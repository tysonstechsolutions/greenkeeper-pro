"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  ArrowLeft,
  X,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Keyboard,
  FileText,
  Camera,
  Flashlight,
  FlashlightOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  type Fy26Asset,
  type Fy26AssetStatus,
} from "@/types/fy26-assets";
import { parseAssetLabel } from "@/lib/utils/parse-asset-label";
import {
  isNativeBarcodeAvailable,
  startNativeScanSession,
  type NativeScanSession,
} from "@/lib/scan/barcode";

// Dynamically import html5-qrcode only on client to avoid SSR issues.
let Html5Qrcode: typeof import("html5-qrcode").Html5Qrcode | null = null;

// Every MWRMA property tag encodes ASSETNUM-SUBNUM as 8 digits, dash,
// 4 digits. Barcode symbologies sometimes drop the separator so we
// also accept the raw 12-digit form. Anything else is a misread by
// definition — the scanner is looking at the wrong thing or decoding
// noise, and we should keep scanning instead of wasting a lookup.
const VALID_TAG_RE = /^\d{8}-\d{4}$|^\d{12}$/;

// Hard ceiling on how long ANY single supabase query can block the
// lookup flow. The scanner used to hang forever on "Searching
// inventory..." if the service worker's NetworkFirst strategy got
// stuck waiting on a stale cache entry, a flaky 4G connection
// dropped mid-response, or the browser's fetch queue stalled. 8 s is
// plenty for a healthy round-trip and short enough that the UI can
// fall back to the next lookup strategy — or surface a real error —
// instead of spinning indefinitely.
// Match the Supabase client's 12s fetch timeout so we don't bail before
// the network layer even gets a chance to complete. On mobile data a
// Postgres query behind an RLS check + trigram ilike can easily hit
// 8-10s; 15s is generous without being "broken".
const QUERY_TIMEOUT_MS = 15_000;

/**
 * Wrap a Supabase query (PromiseLike) in a timeout. If the query doesn't
 * settle within `ms`, rejects with a Timeout error so the caller can
 * move on to the next lookup path or show an error instead of hanging.
 *
 * Default generic is `any` rather than `unknown` because `createClient()`
 * returns a Supabase client WITHOUT a Database generic (see
 * src/lib/supabase/client.ts for rationale), which means every
 * `.from(...).select(...)` chain is typed as `any`. If we defaulted T to
 * `unknown`, destructuring `{ data, error }` off the awaited result
 * would trip TS2339 at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTimeout<T = any>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Asset barcode / serial scanner page.
 *
 * Workflow: scan barcode (or type serial#) → auto-search fy26_assets
 * → show match → one-tap mark Present.
 */
export default function AssetScanPage() {
  const router = useRouter();
  const supabase = createClient();

  const [scanning, setScanning] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // OCR (read label text) fallback state
  const [ocrMode, setOcrMode] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState<string>("");
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<Fy26Asset | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Surfaced to the UI so the user knows the scanner is seeing the
  // label but refusing to accept garbage reads. Bumped every time the
  // decoder returns something that doesn't match the MWRMA tag format.
  const [misreadCount, setMisreadCount] = useState(0);
  // Flashlight / torch state. Only the rear camera and most modern
  // phones support it — we probe capabilities when the scanner starts
  // and hide the button if unavailable.
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const scannerRef = useRef<InstanceType<
    typeof import("html5-qrcode").Html5Qrcode
  > | null>(null);
  // Active native (ML Kit) scan session, when on Capacitor. Held in a ref
  // so stopScanner / unmount can tear it down even from stale-closure code.
  const nativeSessionRef = useRef<NativeScanSession | null>(null);
  // Mirrors `nativeSessionRef` as state so the overlay re-renders when
  // the session actually starts. Without this, setting the ref doesn't
  // trigger React, the overlay never appears, and the user sees the
  // camera feed with no cancel button — exactly the "no way to exit"
  // bug reported.
  const [nativeSessionActive, setNativeSessionActive] = useState(false);
  // Prevents the auto-start effect from firing twice in flight (React 19
  // StrictMode / re-renders) before the first attempt finishes.
  const startingRef = useRef(false);
  // Stable ref to the latest lookupAsset so startScanner doesn't need
  // lookupAsset as a dep (which would destabilize its identity). Filled in
  // by an effect below once lookupAsset is declared.
  const lookupAssetRef = useRef<((query: string) => void) | null>(null);
  // Mirrors `match` state so OCR's async candidate loop can see the
  // latest value without the stale-closure problem.
  const matchRef = useRef<Fy26Asset | null>(null);
  // Track recent decoded values; we only accept a decode after two
  // consecutive frames produce the same valid-format value. This
  // filters out transient misreads (which are usually non-repeating).
  const recentDecodesRef = useRef<string[]>([]);
  const recentMisreadsRef = useRef<number>(0);
  // Set to true by the unmount cleanup so any in-flight lookup bails
  // out of its state-setters. Without this, navigating away while
  // "Searching inventory..." was up would (a) leak a setState onto an
  // unmounted tree and (b) sometimes leave the Supabase client in a
  // pending state that made subsequent pages (tasks / schedule /
  // messages) appear to hang too, because the user's perception was
  // that the whole app had died.
  const cancelledRef = useRef(false);

  // ── Lookup logic ──────────────────────────────────────────────────────

  const lookupAsset = useCallback(
    async (query: string) => {
      // Normalize: trim, strip control chars (scanners often append
      // CR/LF/NUL), collapse internal whitespace. Barcode comparisons
      // below then happen case-insensitively via `ilike` so TXT vs
      // txt scans all match the stored value.
      const normalized = query
        .replace(/[\u0000-\u001F\u007F]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) return;

      // Guard against setState after unmount (see cancelledRef above).
      const safeSetSearching = (v: boolean) => {
        if (!cancelledRef.current) setSearching(v);
      };
      const safeSetMatch = (v: Fy26Asset | null) => {
        if (!cancelledRef.current) setMatch(v);
      };
      const safeSetMatchError = (v: string | null) => {
        if (!cancelledRef.current) setMatchError(v);
      };

      safeSetSearching(true);
      safeSetMatch(null);
      safeSetMatchError(null);

      // Escape PostgREST special chars inside a filter value. Any of
      // , ( ) % * " \ break the or/ilike syntax and cause a 400 response,
      // and a leading * in the pattern collides with the wildcard.
      const escapedForLike = normalized.replace(/[,()%*"\\]/g, " ");

      // Log the raw + normalized values so the user can share them with
      // support if nothing matches. Two identical-looking barcodes can
      // differ in Unicode code points (NFC vs NFD), zero-width chars,
      // or fullwidth digits that visibly look the same.
      console.log("[scan] raw:", JSON.stringify(query), "normalized:", JSON.stringify(normalized));

      // Once we find an asset via any non-exact path, auto-link the raw
      // scanned value to that asset's barcode_value — but only if the
      // slot is empty. Next scan of the same physical tag then hits the
      // fast exact-match branch with zero fallback round-trips.
      const learnBarcodeIfEmpty = (asset: Fy26Asset) => {
        if (asset.barcode_value && asset.barcode_value.trim()) return;
        // Fire-and-forget: don't hold up the match card render. Bound
        // by the same timeout so a stuck update doesn't leak a pending
        // promise into the service worker's background-sync queue.
        (async () => {
          try {
            const { error } = await withTimeout(
              supabase
                .from("fy26_assets")
                .update({ barcode_value: normalized })
                .eq("id", asset.id)
                .is("barcode_value", null),
              QUERY_TIMEOUT_MS,
              "auto-link"
            );
            if (error) {
              console.warn("[scan] auto-link failed:", error.message);
            } else {
              console.log(
                "[scan] auto-linked",
                JSON.stringify(normalized),
                "→",
                asset.asset_number +
                  (asset.sub_number && asset.sub_number !== "0"
                    ? "/" + asset.sub_number
                    : "")
              );
            }
          } catch (err) {
            console.warn("[scan] auto-link errored:", err);
          }
        })();
      };

      try {
        // 1. Try CASE-INSENSITIVE exact match on barcode_value.
        const { data: barcodeRows, error: barcodeErr } = await withTimeout(
          supabase
            .from("fy26_assets")
            .select("*")
            .ilike("barcode_value", normalized)
            .limit(1),
          QUERY_TIMEOUT_MS,
          "barcode_value exact"
        );

        if (cancelledRef.current) return;

        if (barcodeErr) {
          safeSetMatchError(`Lookup failed: ${barcodeErr.message}`);
          return;
        }
        if (barcodeRows && barcodeRows.length > 0) {
          safeSetMatch(barcodeRows[0] as Fy26Asset);
          return;
        }

        // 2. MWRMA property-tag format: "17000198-0018" →
        //    asset_number=17000198, sub_number=18. The DB stores
        //    sub_number without leading zeros ("18" not "0018"), so
        //    strip them from the scanned value before matching.
        const tagMatch = normalized.match(/^(\d+)-(\d+)$/);
        if (tagMatch) {
          const assetNum = tagMatch[1];
          const subNum = String(parseInt(tagMatch[2], 10)); // strips leading zeros

          // 2a. Exact match (clean scan)
          const { data: tagRows, error: tagErr } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("*")
              .eq("asset_number", assetNum)
              .eq("sub_number", subNum)
              .limit(1),
            QUERY_TIMEOUT_MS,
            "tag exact"
          );
          if (cancelledRef.current) return;
          if (tagErr) {
            safeSetMatchError(`Lookup failed: ${tagErr.message}`);
            return;
          }
          if (tagRows && tagRows.length > 0) {
            safeSetMatch(tagRows[0] as Fy26Asset);
            return;
          }

          // 2b. Sub stored WITH leading zeros (legacy). Cheap to check.
          const { data: tagRowsRaw } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("*")
              .eq("asset_number", assetNum)
              .eq("sub_number", tagMatch[2])
              .limit(1),
            QUERY_TIMEOUT_MS,
            "tag raw sub"
          );
          if (cancelledRef.current) return;
          if (tagRowsRaw && tagRowsRaw.length > 0) {
            const hit = tagRowsRaw[0] as Fy26Asset;
            learnBarcodeIfEmpty(hit);
            safeSetMatch(hit);
            return;
          }

          // 2c. Scanner-misread tolerance. Scanners occasionally drop
          //     a leading or trailing digit on Code 128 tags at an
          //     angle, so "17000198-0004" decodes as "1000198-004" (as
          //     happened on the HP LaserJet MGR label). Substring match
          //     on asset_number catches that: %1000198% matches
          //     17000198. We still require an exact sub_number match
          //     so we don't pick the wrong sibling in a multi-sub
          //     asset family.
          const { data: fuzzyTagRows } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("*")
              .ilike("asset_number", `%${assetNum}%`)
              .eq("sub_number", subNum)
              .limit(2),
            QUERY_TIMEOUT_MS,
            "tag fuzzy asset+sub"
          );
          if (cancelledRef.current) return;
          if (fuzzyTagRows && fuzzyTagRows.length === 1) {
            const hit = fuzzyTagRows[0] as Fy26Asset;
            learnBarcodeIfEmpty(hit);
            safeSetMatch(hit);
            return;
          }
          if (fuzzyTagRows && fuzzyTagRows.length > 1) {
            safeSetMatchError(
              `Scanner read "${assetNum}-${tagMatch[2]}" but that matches ${fuzzyTagRows.length} assets. Try scanning again or use Manual entry.`
            );
            return;
          }

          // 2d. Also allow the sub to be missing/fuzzy — only asset
          //     number substring + any sub. Rare but happens when the
          //     sub digits are at the edge of the scanned frame.
          const { data: fuzzyAssetRows } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("*")
              .ilike("asset_number", `%${assetNum}%`)
              .limit(5),
            QUERY_TIMEOUT_MS,
            "tag fuzzy asset any-sub"
          );
          if (cancelledRef.current) return;
          if (fuzzyAssetRows && fuzzyAssetRows.length === 1) {
            const hit = fuzzyAssetRows[0] as Fy26Asset;
            learnBarcodeIfEmpty(hit);
            safeSetMatch(hit);
            return;
          }
        }

        // 3. Just-digits scan (no dash) → try asset_number exact match
        //    for the case where the scanner decoded without the sub.
        if (/^\d+$/.test(normalized)) {
          const { data: numRows } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("*")
              .eq("asset_number", normalized)
              .limit(1),
            QUERY_TIMEOUT_MS,
            "digits exact"
          );
          if (cancelledRef.current) return;
          if (numRows && numRows.length > 0) {
            const hit = numRows[0] as Fy26Asset;
            learnBarcodeIfEmpty(hit);
            safeSetMatch(hit);
            return;
          }
        }

        // 3b. Reverse-substring match. Field scanner example:
        //       label: 17000198-0004
        //       decoded by html5-qrcode: "1700019870004" (extra "7"
        //       injected from the Code 128 internal encoding)
        //     No pattern of our own fixes that because the extra char
        //     is in the middle. But 17000198 IS a substring of the
        //     decoded value, so we can fetch a bounded asset list and
        //     find any row whose asset_number appears inside the scan,
        //     then disambiguate by checking the trailing digits against
        //     sub_number.
        //
        //     IMPORTANT: We cap this at 2000 rows. The original code
        //     did `.select("*")` with no limit, which returned the
        //     ENTIRE fy26_assets table on every digit-style scan —
        //     multi-megabyte payload, multi-second round-trip, and on
        //     a phone cell connection with the service worker's
        //     NetworkFirst wrapper it was the number-one source of the
        //     "Searching inventory..." hang. Selecting only the three
        //     columns we actually need for matching is ~20x smaller
        //     than `*` and plenty fast.
        if (/^\d{6,}$/.test(normalized) && normalized.length >= 8) {
          const { data: allAssets } = await withTimeout(
            supabase
              .from("fy26_assets")
              .select("id, asset_number, sub_number")
              .limit(2000),
            QUERY_TIMEOUT_MS,
            "reverse-substring list"
          );
          if (cancelledRef.current) return;

          if (allAssets && allAssets.length > 0) {
            type MiniAsset = Pick<Fy26Asset, "id" | "asset_number" | "sub_number">;
            // Any asset whose full asset_number appears anywhere in
            // the scan string. Require asset_number ≥ 6 chars so a
            // short "0" doesn't claim every scan.
            const candidates = (allAssets as MiniAsset[])
              .filter(
                (a) =>
                  a.asset_number.length >= 6 &&
                  normalized.includes(a.asset_number)
              );

            const fetchFullAsset = async (id: string): Promise<Fy26Asset | null> => {
              const { data } = await withTimeout(
                supabase
                  .from("fy26_assets")
                  .select("*")
                  .eq("id", id)
                  .limit(1),
                QUERY_TIMEOUT_MS,
                "reverse-substring full row"
              );
              if (!data || data.length === 0) return null;
              return data[0] as Fy26Asset;
            };

            if (candidates.length === 1) {
              const full = await fetchFullAsset(candidates[0].id);
              if (cancelledRef.current) return;
              if (full) {
                learnBarcodeIfEmpty(full);
                safeSetMatch(full);
                return;
              }
            }

            if (candidates.length > 1) {
              // Multiple asset_numbers embedded in the scan — happens
              // when asset_numbers share a common prefix. Disambiguate
              // by looking at what's after the asset_number in the
              // scan and checking if it matches (or ends with) the
              // sub_number.
              const withScore = candidates.map((a) => {
                const pos = normalized.indexOf(a.asset_number);
                const tail = normalized.slice(pos + a.asset_number.length);
                const tailAsInt = tail ? String(parseInt(tail, 10)) : "";
                const lastFourAsInt = tail.length >= 4
                  ? String(parseInt(tail.slice(-4), 10))
                  : "";
                const sub = a.sub_number ?? "";
                let score = 0;
                if (sub && tailAsInt === sub) score = 3;
                else if (sub && lastFourAsInt === sub) score = 2;
                else if (sub && tail.endsWith(sub)) score = 1;
                else if (!sub || sub === "0") score = 1; // primary asset, no sub
                return { asset: a, score, tailLen: tail.length };
              });
              withScore.sort(
                (x, y) => y.score - x.score || x.tailLen - y.tailLen
              );
              if (withScore[0].score > 0) {
                const full = await fetchFullAsset(withScore[0].asset.id);
                if (cancelledRef.current) return;
                if (full) {
                  learnBarcodeIfEmpty(full);
                  safeSetMatch(full);
                  return;
                }
              }
            }
          }
        }

        // 4. Substring match on barcode_value. Catches legacy rows stored
        //    with stray whitespace/control chars the scanner appended.
        const likeTerm = `%${escapedForLike.trim()}%`;
        const { data: substringRows } = await withTimeout(
          supabase
            .from("fy26_assets")
            .select("*")
            .ilike("barcode_value", likeTerm)
            .limit(1),
          QUERY_TIMEOUT_MS,
          "barcode_value substring"
        );
        if (cancelledRef.current) return;
        if (substringRows && substringRows.length > 0) {
          const hit = substringRows[0] as Fy26Asset;
          learnBarcodeIfEmpty(hit);
          safeSetMatch(hit);
          return;
        }

        // 5. Fall back to fuzzy search on serial / asset # / description /
        //    model / barcode_value.
        if (!escapedForLike.trim()) {
          safeSetMatchError(`No asset matching "${normalized}"`);
          return;
        }
        const { data, error } = await withTimeout(
          supabase
            .from("fy26_assets")
            .select("*")
            .or(
              `barcode_value.ilike.${likeTerm},serial_number.ilike.${likeTerm},asset_number.ilike.${likeTerm},description.ilike.${likeTerm},model_text.ilike.${likeTerm}`
            )
            .limit(1)
            .maybeSingle(),
          QUERY_TIMEOUT_MS,
          "fuzzy or"
        );
        if (cancelledRef.current) return;

        if (error) {
          safeSetMatchError(`Search failed: ${error.message}`);
          return;
        }
        if (!data) {
          safeSetMatchError(
            `No asset found matching "${normalized}". Check the browser console (raw scan value is logged) — if it looks right, the barcode may not actually be linked in the DB.`
          );
          return;
        }
        const hit = data as Fy26Asset;
        learnBarcodeIfEmpty(hit);
        safeSetMatch(hit);
      } catch (err) {
        // `err.message` includes our "… timed out after 8000ms" label, so
        // the user gets an actionable message instead of the old silent
        // forever-spin.
        if (cancelledRef.current) return;
        safeSetMatchError(
          err instanceof Error
            ? `Search failed: ${err.message}`
            : "Search failed — check connection."
        );
      } finally {
        safeSetSearching(false);
      }
    },
    [supabase]
  );

  // Keep the ref in sync with the latest lookupAsset closure.
  useEffect(() => {
    lookupAssetRef.current = lookupAsset;
  }, [lookupAsset]);

  // Keep matchRef aligned with match so async OCR code sees fresh value.
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  // ── Mark asset present ────────────────────────────────────────────────

  // ── OCR fallback: read the whole sticker instead of the barcode ─────
  //    When the barcode scan keeps failing (printed at an angle, worn
  //    label, Code 128 quirks), we can take a photo of the whole label
  //    and run Tesseract.js on it client-side. We extract every
  //    plausible identifier (tag-format, asset number, serial, model)
  //    and try each against the DB until something matches. Tesseract
  //    is lazy-imported so the 2 MB WASM bundle only downloads when
  //    the user actually picks this mode.

  const runOcrOnFile = useCallback(
    async (file: File) => {
      setOcrRunning(true);
      setOcrProgress(0);
      setMatch(null);
      setMatchError(null);

      // Show a preview of what they captured
      const previewUrl = URL.createObjectURL(file);
      setOcrPreview(previewUrl);

      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === "recognizing text") {
              setOcrProgress(Math.round(m.progress * 100));
            }
          },
        });
        const { data } = await worker.recognize(file);
        await worker.terminate();
        const text = data.text ?? "";
        setOcrText(text);

        console.log("[scan/ocr] text:", JSON.stringify(text));
        const candidates = parseAssetLabel(text);
        console.log("[scan/ocr] candidates:", candidates);

        if (candidates.all.length === 0) {
          setMatchError(
            "No asset identifiers could be read from the label. Try a clearer photo, or use Manual entry."
          );
          return;
        }

        // Try each candidate in order until one matches.
        for (const candidate of candidates.all) {
          // Re-use the same lookup cascade we use for barcodes.
          await new Promise<void>((resolve) => {
            const sub = lookupAssetRef.current;
            if (!sub) return resolve();
            // lookupAsset updates match/matchError state. We want to
            // keep trying until one produces a match, so we clear
            // matchError between candidates.
            setMatchError(null);
            sub(candidate);
            // Small delay to let state settle. Cheap — max 4 candidates
            // and the lookups themselves take ~100ms each.
            setTimeout(resolve, 350);
          });
          // Check whether a match landed; if so, stop iterating.
          if (matchRef.current) return;
        }
        // Fell through — no candidate matched. lookupAsset will have
        // set matchError with the last attempt's message already.
        if (!matchRef.current) {
          setMatchError(
            `Couldn't find any of: ${candidates.all.slice(0, 4).join(", ")}${
              candidates.all.length > 4 ? "…" : ""
            }`
          );
        }
      } catch (err) {
        console.error("[scan/ocr] failed:", err);
        setMatchError(
          err instanceof Error
            ? `Text recognition failed: ${err.message}`
            : "Text recognition failed."
        );
      } finally {
        setOcrRunning(false);
      }
    },
    []
  );

  // Grab the current frame from the live barcode scanner video element,
  // convert to a File, and run it through the same OCR pipeline as the
  // explicit "Read label" mode. This gives the user a one-tap fallback
  // right from the barcode camera — no mode switching required.
  // stopScannerRef is populated once stopScanner is declared (below),
  // so this callback can be declared here without a hoisting cycle.
  const stopScannerRef = useRef<(() => Promise<void>) | null>(null);
  const captureFrameAndOcr = useCallback(async () => {
    const video = document.querySelector<HTMLVideoElement>(
      "#scanner-viewport video"
    );
    if (!video || !video.videoWidth) {
      setMatchError("Camera isn't ready yet — give it a second and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) {
      setMatchError("Couldn't capture a frame — try the full Read label mode.");
      return;
    }
    const file = new File([blob], `scan-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    // Stop the scanner so it doesn't fight with OCR for the camera.
    await stopScannerRef.current?.();
    await runOcrOnFile(file);
  }, [runOcrOnFile]);

  const markPresent = async () => {
    if (!match) return;
    setUpdating(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("fy26_assets")
          .update({
            status: "verified_present" as Fy26AssetStatus,
            verified_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .select()
          .single(),
        QUERY_TIMEOUT_MS,
        "mark present"
      );

      if (error) throw error;
      setMatch(data as Fy26Asset);
    } catch {
      // Non-fatal: show as already-present or offline
    } finally {
      setUpdating(false);
    }
  };

  // ── Camera scanner lifecycle ──────────────────────────────────────────

  // startScanner uses refs instead of closed-over state so its identity is
  // stable across renders. This prevents the "effect re-runs, sees stale
  // scanning=false, bails or re-fires" race that was blocking auto-start.
  const startScanner = useCallback(async () => {
    if (startingRef.current) return;
    if (scannerRef.current) return;
    startingRef.current = true;
    setCameraError(null);
    setMisreadCount(0);
    recentDecodesRef.current = [];
    recentMisreadsRef.current = 0;

    // ── Native path (ML Kit, Spark-for-Walmart style) ─────────────────────
    // Uses startScan() + a live camera feed rendered BEHIND our transparent
    // WebView, with our own overlay UI on top. The plugin fires a
    // "barcodesScanned" event each time it detects something — we accept
    // the first valid read, tear the session down, and route the value
    // through lookupAsset (which handles 12-digit no-dash + substring
    // matches). Unlike the old `scan()` API, there is no full-screen
    // native modal, so no black-screen-after-close bug.
    if (isNativeBarcodeAvailable()) {
      try {
        setScanning(true);
        let handled = false;
        const session = await startNativeScanSession({
          onBarcode: (raw) => {
            if (handled) return;
            handled = true;
            // Stop the camera + restore WebView before running the lookup
            // so the user sees the result card (not a live camera feed).
            nativeSessionRef.current?.stop().catch(() => {});
            nativeSessionRef.current = null;
            setNativeSessionActive(false);
            setScanning(false);
            startingRef.current = false;
            const clean = raw.replace(/[\u0000-\u001F\u007F\s]+/g, "").trim();
            const canonical = /^\d{12}$/.test(clean)
              ? `${clean.slice(0, 8)}-${clean.slice(8)}`
              : clean;
            lookupAssetRef.current?.(canonical);
          },
          onError: (err) => {
            if (handled) return;
            handled = true;
            nativeSessionRef.current?.stop().catch(() => {});
            nativeSessionRef.current = null;
            setNativeSessionActive(false);
            setScanning(false);
            startingRef.current = false;
            console.error("[scan] native scan error:", err);
            setCameraError(
              err.message.includes("permission")
                ? "Camera permission is required to scan. Tap Try again or use Manual entry."
                : "Could not start the camera. Tap Try again or use Manual entry.",
            );
          },
        });
        if (!session) {
          // Session setup failed (permission denied / plugin error). The
          // onError callback already set camera state — just return so the
          // user can retry or switch to Manual.
          setScanning(false);
          startingRef.current = false;
          return;
        }
        nativeSessionRef.current = session;
        setNativeSessionActive(true);
        // Scanning continues asynchronously — a future onBarcode / onError
        // or stopScanner() call is what finishes the flow.
        return;
      } catch (err) {
        setScanning(false);
        startingRef.current = false;
        console.error("[scan] native scan setup failed:", err);
        setCameraError(
          "Could not open the barcode scanner. Use Manual entry or tap Try again.",
        );
        return;
      }
    }

    // ── Web path (html5-qrcode) ───────────────────────────────────────────
    try {
      // Dynamic import so SSR doesn't fail
      if (!Html5Qrcode) {
        const mod = await import("html5-qrcode");
        Html5Qrcode = mod.Html5Qrcode;
      }

      // Wait a tick for React to paint the viewport div if we were called
      // from an effect on the same render that mounted it.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const containerId = "scanner-viewport";
      if (!document.getElementById(containerId)) {
        // Viewport not in DOM — bail quietly so effect can retry later.
        return;
      }

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // No qrbox → scan the entire video frame. Users reported the
          // small 280×120 crop made it impossible to fit the whole
          // MWRMA label legibly. Detection is slightly slower across
          // the full frame but still real-time on modern phones, and
          // tag-style Code 128 decodes reliably at any position now.
          // No aspectRatio either — let the camera use its native
          // aspect so nothing gets squished.
        },
        (decodedText) => {
          // Normalize: strip control chars + whitespace. Also normalize
          // the 12-digit no-dash form to the canonical ASSET-SUB form.
          const clean = decodedText
            .replace(/[\u0000-\u001F\u007F\s]+/g, "")
            .trim();
          const canonical =
            /^\d{12}$/.test(clean)
              ? `${clean.slice(0, 8)}-${clean.slice(8)}`
              : clean;

          // ENFORCE the known MWRMA tag format. Anything else is a
          // misread (Code 128 symbology giving us a checksum digit, a
          // barcode from a completely different sticker, etc.) — don't
          // waste a DB round-trip on garbage.
          if (!VALID_TAG_RE.test(clean) && !/^\d{8}-\d{4}$/.test(canonical)) {
            recentMisreadsRef.current += 1;
            setMisreadCount(recentMisreadsRef.current);
            console.log(
              "[scan] discarding misread:",
              JSON.stringify(decodedText),
              "clean:",
              JSON.stringify(clean)
            );
            // Keep scanning. If the user keeps getting misreads, the
            // status text below tells them to switch to READ mode.
            return;
          }

          // Require TWO consecutive frames decoding to the same value
          // before accepting. Transient misreads almost never repeat,
          // so this single rule filters out 95% of bad decodes without
          // adding latency on a clean scan (second frame arrives within
          // ~100 ms at fps: 10).
          recentDecodesRef.current.push(canonical);
          if (recentDecodesRef.current.length > 5) {
            recentDecodesRef.current.shift();
          }
          const last = recentDecodesRef.current;
          const confirmed =
            last.length >= 2 && last[last.length - 1] === last[last.length - 2];
          if (!confirmed) {
            console.log("[scan] awaiting confirmation, got:", canonical);
            return;
          }

          // Confirmed — stop the scanner and run the lookup with the
          // canonical value.
          scanner
            .stop()
            .then(() => {
              scannerRef.current = null;
              setScanning(false);
              recentDecodesRef.current = [];
              recentMisreadsRef.current = 0;
              lookupAssetRef.current?.(canonical);
            })
            .catch(() => {
              scannerRef.current = null;
              setScanning(false);
            });
        },
        () => {
          /* ignore per-frame failures */
        }
      );
      setScanning(true);

      // Probe torch support on the running video track so we can show
      // (or hide) the flashlight button. Runs async so it doesn't block
      // the scanner being usable.
      setTimeout(() => {
        try {
          const videoEl = document.querySelector<HTMLVideoElement>(
            "#scanner-viewport video"
          );
          const stream = videoEl?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()?.[0];
          // `torch` isn't in all browsers' MediaTrackCapabilities type,
          // so we probe it via a cast. Safe: we only apply it below
          // behind another capability check.
          const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps.torch));
          setTorchOn(false);
        } catch {
          setTorchSupported(false);
        }
      }, 300);
    } catch (err) {
      console.error("Camera start error:", err);
      scannerRef.current = null;
      setCameraError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission denied. Tap the lock icon in the browser's address bar to allow camera access, or use Manual entry."
          : "Could not access camera. Use Manual entry or tap Try camera again."
      );
    } finally {
      startingRef.current = false;
    }
  }, []);

  // Toggle the flashlight (torch constraint) on the running video track.
  // Fails silently if the device or browser doesn't allow it — the
  // button is only rendered when torchSupported is true anyway.
  const toggleTorch = useCallback(async () => {
    try {
      const videoEl = document.querySelector<HTMLVideoElement>(
        "#scanner-viewport video"
      );
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()?.[0];
      if (!track) return;
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet & { torch?: boolean }],
      });
      setTorchOn(next);
    } catch (err) {
      console.warn("[scan] torch toggle failed:", err);
      setTorchSupported(false);
    }
  }, [torchOn]);

  const stopScanner = useCallback(async () => {
    const ref = scannerRef.current;
    const nativeSession = nativeSessionRef.current;
    scannerRef.current = null;
    nativeSessionRef.current = null;
    setNativeSessionActive(false);
    setScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
    if (nativeSession) {
      try {
        await nativeSession.stop();
      } catch {
        /* already stopped — best-effort cleanup */
      }
    }
    if (ref) {
      try {
        await ref.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // Keep captureFrameAndOcr able to call stopScanner without a forward
  // reference cycle — see the stopScannerRef declaration above.
  useEffect(() => {
    stopScannerRef.current = stopScanner;
  }, [stopScanner]);

  // Auto-start the scanner on mount and whenever we enter (or re-enter)
  // camera mode without an active match or unresolved error.
  // startScanner is stable and self-guards against double-starts, so
  // this is safe to fire eagerly. When a match/error lands or the user
  // switches to manual, tear the scanner down so the camera light
  // turns off and the black viewport unmounts.
  useEffect(() => {
    if (manualMode || ocrMode || match || matchError) {
      stopScanner();
      return;
    }
    startScanner();
  }, [manualMode, ocrMode, match, matchError, startScanner, stopScanner]);

  // Cleanup on unmount. Mark cancelled so any lookup in flight bails
  // out of its setState calls — without this, navigating away during
  // "Searching inventory..." could leave the Supabase JS client in a
  // weird state (the response arrives after the React tree is gone,
  // a listener fires, and subsequent pages appear to hang).
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (nativeSessionRef.current) {
        nativeSessionRef.current.stop().catch(() => {});
        nativeSessionRef.current = null;
      }
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // ── Manual entry submit ───────────────────────────────────────────────

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupAsset(manualInput);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const statusColor = match
    ? fy26AssetStatusColors[match.status]
    : undefined;

  // Native Spark-for-Walmart-style live scanner overlay. Visible ONLY while
  // the native ML Kit session is active — the globals.css rule hides the
  // rest of the app (including the header, mode toggle, and web scanner
  // container below) when body has `.barcode-scanner-active`.
  // Drive the overlay + web-viewport gating off STATE, not the ref. The
  // ref is set synchronously when startNativeScanSession resolves, but a
  // ref write alone doesn't re-render, so the overlay (with its cancel
  // buttons) never appeared and the user had no way to exit.
  const nativeScanning = scanning && isNativeBarcodeAvailable() && nativeSessionActive;
  // On any native platform, we always use ML Kit — the html5-qrcode web
  // viewport is never rendered. This removes the big black box that was
  // appearing alongside the native camera feed.
  const onNativePlatform = isNativeBarcodeAvailable();

  return (
    <div className="p-4 md:p-6 pb-24 max-w-lg mx-auto">
      {nativeScanning && (() => {
        // Single cancel handler — used by the X button, the Cancel pill,
        // and tap-outside-reticle. Stop the camera session first so the
        // camera light turns off, then navigate back to the asset list.
        const cancelScan = () => {
          stopScanner();
          router.push("/assets");
        };
        return (
          <div className="scanner-overlay fixed inset-0 z-[100]">
            {/* Dim background. Tapping it also cancels — matches Spark / iOS
                scanner UX where anywhere outside the reticle dismisses. */}
            <button
              type="button"
              onClick={cancelScan}
              aria-label="Cancel scan"
              className="absolute inset-0 bg-black/35"
            />

            {/* Top-right X button — obvious close affordance. White on a
                dark chip so it's readable against any camera feed. */}
            <div
              className="absolute top-0 right-0 p-4"
              style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <button
                type="button"
                onClick={cancelScan}
                aria-label="Close scanner"
                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition shadow-lg"
              >
                <X className="w-6 h-6" strokeWidth={2.5} />
              </button>
            </div>

            {/* Viewfinder reticle — centered, pointer-events-none so taps
                on the reticle area fall through to the dim-background
                cancel button. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-72 max-w-[80vw] max-h-[60vh]">
                <span className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl" />
                <span className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl" />
                <div className="absolute inset-x-4 top-1/2 h-0.5 bg-primary shadow-[0_0_12px_var(--color-primary)] animate-pulse" />
              </div>
            </div>

            {/* Bottom zone: instruction pill + big Cancel button in the
                thumb-reach area. Cancel is the primary escape — the X up
                top is a secondary. */}
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 pb-8"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
            >
              <div className="px-4 py-2 rounded-full bg-black/70 text-white text-sm font-medium backdrop-blur-sm pointer-events-none">
                Point at the asset barcode
              </div>
              <button
                type="button"
                onClick={cancelScan}
                aria-label="Cancel scanning"
                className="w-full max-w-xs h-14 rounded-full bg-white text-black font-semibold text-base shadow-xl active:scale-95 transition flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/assets")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Scan Asset</h1>
          <p className="text-xs text-muted-foreground">
            Scan barcode or type serial / asset #
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          variant={!manualMode && !ocrMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setManualMode(false);
            setOcrMode(false);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <ScanLine className="w-4 h-4 mr-1.5" />
          Barcode
        </Button>
        <Button
          variant={ocrMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            stopScanner();
            setManualMode(false);
            setOcrMode(true);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <FileText className="w-4 h-4 mr-1.5" />
          Read label
        </Button>
        <Button
          variant={manualMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            stopScanner();
            setManualMode(true);
            setOcrMode(false);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <Keyboard className="w-4 h-4 mr-1.5" />
          Manual
        </Button>
      </div>

      {/* OCR mode — take a photo of the whole label, extract any asset
          identifiers we can find, try each. Useful when the barcode
          itself is scratched/worn/printed wrong and won't scan. */}
      {ocrMode && !match && (
        <div className="mb-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-center">
                <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold">Read the label text</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Take a photo of the MWRMA sticker. We&apos;ll look for the
                  asset number, serial number, or tag ID on the label.
                </p>
              </div>
              <input
                ref={ocrFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) runOcrOnFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                className="w-full"
                size="lg"
                onClick={() => ocrFileInputRef.current?.click()}
                disabled={ocrRunning}
              >
                {ocrRunning ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 mr-2" />
                )}
                {ocrRunning ? `Reading… ${ocrProgress}%` : "Take photo of label"}
              </Button>
              {ocrPreview && (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ocrPreview}
                    alt="Label preview"
                    className="w-full rounded-lg border border-border"
                  />
                  {ocrText && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Text read from label
                      </summary>
                      <pre className="mt-1 p-2 bg-muted rounded text-[10px] whitespace-pre-wrap break-all">
                        {ocrText}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Camera scanner — auto-starts on mount, hidden once a match
          lands OR an error is showing. (Effect above tears down the
          scanner so the camera LED goes off too.)

          On native platforms we use ML Kit's live camera via the
          transparent-WebView overlay (above), so the html5-qrcode
          viewport is never rendered — otherwise it shows up as a dead
          black panel behind the real camera feed. */}
      {!manualMode && !ocrMode && !match && !matchError && !onNativePlatform && (
        <div className="mb-4">
          <div className="relative">
            <div
              id="scanner-viewport"
              className="rounded-xl overflow-hidden bg-black"
              style={{ minHeight: "min(70vh, 480px)" }}
            />
            {/* Flashlight toggle — only rendered if the running video
                track actually supports torch control. */}
            {scanning && torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                className={`absolute bottom-3 left-3 w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition ${
                  torchOn
                    ? "bg-yellow-400 text-yellow-950"
                    : "bg-black/70 text-white"
                }`}
              >
                {torchOn ? (
                  <Flashlight className="w-5 h-5" />
                ) : (
                  <FlashlightOff className="w-5 h-5" />
                )}
              </button>
            )}

            {/* OCR shutter — when the barcode isn't cooperating, tap
                this to grab the current video frame and OCR the whole
                label in one shot. Stays out of the way visually. */}
            {scanning && (
              <button
                type="button"
                onClick={captureFrameAndOcr}
                disabled={ocrRunning}
                aria-label="Read label text from current frame"
                className="absolute bottom-3 right-3 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex flex-col items-center justify-center active:scale-95 transition disabled:opacity-50"
              >
                {ocrRunning ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    <span className="text-[9px] font-semibold leading-none mt-0.5">
                      READ
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
          {!scanning && !cameraError && !match && (
            <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
              Starting camera…
            </p>
          )}
          {scanning && !ocrRunning && misreadCount < 3 && (
            <p className="text-xs text-center text-muted-foreground mt-2">
              Aim at the barcode — expecting format like 17000198-0004
            </p>
          )}
          {scanning && !ocrRunning && misreadCount >= 3 && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400 mt-2">
              Scanner keeps misreading this tag ({misreadCount} bad
              reads). Move closer, clean the label, or tap{" "}
              <span className="font-semibold">READ</span> to OCR it.
            </p>
          )}
          {ocrRunning && (
            <p className="text-xs text-center text-primary mt-2">
              Reading label… {ocrProgress}%
            </p>
          )}
          {cameraError && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-red-500">{cameraError}</p>
              <Button onClick={startScanner} size="sm" className="w-full">
                <ScanLine className="w-4 h-4 mr-2" />
                Try camera again
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Camera-error block for NATIVE platform — the viewport that used
          to own the error message is hidden above when onNativePlatform,
          so we render the error here so the user can see why scanning
          failed and retry. */}
      {onNativePlatform && cameraError && !manualMode && !ocrMode && !match && !matchError && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-red-500">{cameraError}</p>
          <Button onClick={startScanner} size="sm" className="w-full">
            <ScanLine className="w-4 h-4 mr-2" />
            Try camera again
          </Button>
        </div>
      )}

      {/* Manual entry */}
      {manualMode && (
        <form onSubmit={handleManualSubmit} className="flex gap-2 mb-4">
          <Input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Serial #, asset #, or description..."
            autoFocus
          />
          <Button type="submit" disabled={searching || !manualInput.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </form>
      )}

      {/* Searching indicator */}
      {searching && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Searching inventory...</span>
        </div>
      )}

      {/* No match — camera viewport is torn down by the effect above
          so the screen is just the error + the big button. */}
      {matchError && !searching && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 mb-5">
              {matchError}
            </p>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                setMatchError(null);
                setManualInput("");
                // Effect will auto-restart the scanner now that
                // matchError cleared.
              }}
            >
              <ScanLine className="w-5 h-5 mr-2" />
              Scan again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Match found */}
      {match && !searching && (
        <Card className="rounded-2xl overflow-hidden">
          {/* Front condition photo — shown full-width at the top so you
              can visually confirm you've scanned the right thing before
              marking it present. Falls back to any available angle if
              front isn't set. */}
          {(() => {
            const photos = match.condition_photos ?? {};
            const frontPhoto =
              photos.front ?? photos.back ?? photos.left ?? photos.right;
            return frontPhoto ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={frontPhoto}
                alt={`${match.description} — front view`}
                className="w-full aspect-[4/3] object-cover bg-muted"
              />
            ) : null;
          })()}
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h2 className="font-semibold text-base">
                  {match.description}
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  Asset #{match.asset_number}
                  {match.sub_number &&
                    match.sub_number !== "0" &&
                    ` / sub ${match.sub_number}`}
                </p>
              </div>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: statusColor,
                  color: statusColor,
                }}
              >
                {fy26AssetStatusLabels[match.status]}
              </Badge>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground mb-4">
              {match.serial_number && (
                <p>
                  <span className="font-semibold">SN:</span>{" "}
                  <span className="font-mono">{match.serial_number}</span>
                </p>
              )}
              {match.manufacturer && (
                <p>
                  <span className="font-semibold">Manufacturer:</span>{" "}
                  {match.manufacturer}
                </p>
              )}
              {match.model_text && (
                <p>
                  <span className="font-semibold">Model:</span>{" "}
                  {match.model_text}
                </p>
              )}
              <p>
                <span className="font-semibold">Site:</span> {match.site}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {match.status !== "verified_present" ? (
                <Button
                  onClick={markPresent}
                  disabled={updating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Mark Present
                </Button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 py-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Verified Present</span>
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => router.push(`/assets/view?id=${match.id}`)}
              >
                Details
              </Button>
            </div>

            {/* Scan next */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-muted-foreground"
              onClick={() => {
                setMatch(null);
                setMatchError(null);
                setManualInput("");
                if (!manualMode) startScanner();
              }}
            >
              <ScanLine className="w-4 h-4 mr-1.5" />
              Scan next
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
