"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Keyboard,
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

// Dynamically import html5-qrcode only on client to avoid SSR issues.
let Html5Qrcode: typeof import("html5-qrcode").Html5Qrcode | null = null;

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
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<Fy26Asset | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<InstanceType<
    typeof import("html5-qrcode").Html5Qrcode
  > | null>(null);
  const scanContainerRef = useRef<HTMLDivElement>(null);
  // Prevents the auto-start effect from firing twice in flight (React 19
  // StrictMode / re-renders) before the first attempt finishes.
  const startingRef = useRef(false);
  // Stable ref to the latest lookupAsset so startScanner doesn't need
  // lookupAsset as a dep (which would destabilize its identity). Filled in
  // by an effect below once lookupAsset is declared.
  const lookupAssetRef = useRef<((query: string) => void) | null>(null);

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

      setSearching(true);
      setMatch(null);
      setMatchError(null);

      // Escape PostgREST special chars inside a filter value. Any of
      // , ( ) % * " \ break the or/ilike syntax and cause a 400 response,
      // and a leading * in the pattern collides with the wildcard.
      const escapedForLike = normalized.replace(/[,()%*"\\]/g, " ");

      // Log the raw + normalized values so the user can share them with
      // support if nothing matches. Two identical-looking barcodes can
      // differ in Unicode code points (NFC vs NFD), zero-width chars,
      // or fullwidth digits that visibly look the same.
      console.log("[scan] raw:", JSON.stringify(query), "normalized:", JSON.stringify(normalized));

      try {
        // 1. Try CASE-INSENSITIVE exact match on barcode_value.
        const { data: barcodeRows, error: barcodeErr } = await supabase
          .from("fy26_assets")
          .select("*")
          .ilike("barcode_value", normalized)
          .limit(1);

        if (barcodeErr) {
          setMatchError(`Lookup failed: ${barcodeErr.message}`);
          return;
        }
        if (barcodeRows && barcodeRows.length > 0) {
          setMatch(barcodeRows[0] as Fy26Asset);
          return;
        }

        // 2. MWRMA property-tag format: "17000198-0018" →
        //    asset_number=17000198, sub_number=18. The asset tags on
        //    every piece of MWRMA equipment follow this pattern. The
        //    DB stores sub_number without leading zeros ("18" not
        //    "0018"), so strip them from the scanned value before
        //    matching. Also handle "-0000" → sub_number "0" which is
        //    how the baseline/primary asset is stored.
        const tagMatch = normalized.match(/^(\d+)-(\d+)$/);
        if (tagMatch) {
          const assetNum = tagMatch[1];
          const subNum = String(parseInt(tagMatch[2], 10)); // strips leading zeros
          const { data: tagRows, error: tagErr } = await supabase
            .from("fy26_assets")
            .select("*")
            .eq("asset_number", assetNum)
            .eq("sub_number", subNum)
            .limit(1);
          if (tagErr) {
            setMatchError(`Lookup failed: ${tagErr.message}`);
            return;
          }
          if (tagRows && tagRows.length > 0) {
            setMatch(tagRows[0] as Fy26Asset);
            return;
          }
          // Also try the raw string form in case some rows stored the sub
          // with leading zeros. Rare but cheap to check.
          const { data: tagRowsRaw } = await supabase
            .from("fy26_assets")
            .select("*")
            .eq("asset_number", assetNum)
            .eq("sub_number", tagMatch[2])
            .limit(1);
          if (tagRowsRaw && tagRowsRaw.length > 0) {
            setMatch(tagRowsRaw[0] as Fy26Asset);
            return;
          }
        }

        // 3. Just-digits scan (no dash) → try asset_number exact match
        //    for the case where the scanner decoded without the sub.
        if (/^\d+$/.test(normalized)) {
          const { data: numRows } = await supabase
            .from("fy26_assets")
            .select("*")
            .eq("asset_number", normalized)
            .limit(1);
          if (numRows && numRows.length > 0) {
            setMatch(numRows[0] as Fy26Asset);
            return;
          }
        }

        // 4. Substring match on barcode_value. Catches legacy rows stored
        //    with stray whitespace/control chars the scanner appended.
        const likeTerm = `%${escapedForLike.trim()}%`;
        const { data: substringRows } = await supabase
          .from("fy26_assets")
          .select("*")
          .ilike("barcode_value", likeTerm)
          .limit(1);
        if (substringRows && substringRows.length > 0) {
          setMatch(substringRows[0] as Fy26Asset);
          return;
        }

        // 5. Fall back to fuzzy search on serial / asset # / description /
        //    model / barcode_value.
        if (!escapedForLike.trim()) {
          setMatchError(`No asset matching "${normalized}"`);
          return;
        }
        const { data, error } = await supabase
          .from("fy26_assets")
          .select("*")
          .or(
            `barcode_value.ilike.${likeTerm},serial_number.ilike.${likeTerm},asset_number.ilike.${likeTerm},description.ilike.${likeTerm},model_text.ilike.${likeTerm}`
          )
          .limit(1)
          .maybeSingle();

        if (error) {
          setMatchError(`Search failed: ${error.message}`);
          return;
        }
        if (!data) {
          setMatchError(
            `No asset found matching "${normalized}". Check the browser console (raw scan value is logged) — if it looks right, the barcode may not actually be linked in the DB.`
          );
          return;
        }
        setMatch(data as Fy26Asset);
      } catch (err) {
        setMatchError(
          err instanceof Error
            ? `Search failed: ${err.message}`
            : "Search failed — check connection."
        );
      } finally {
        setSearching(false);
      }
    },
    [supabase]
  );

  // Keep the ref in sync with the latest lookupAsset closure.
  useEffect(() => {
    lookupAssetRef.current = lookupAsset;
  }, [lookupAsset]);

  // ── Mark asset present ────────────────────────────────────────────────

  const markPresent = async () => {
    if (!match) return;
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from("fy26_assets")
        .update({
          status: "verified_present" as Fy26AssetStatus,
          verified_at: new Date().toISOString(),
        })
        .eq("id", match.id)
        .select()
        .single();

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
          qrbox: { width: 280, height: 120 },
          aspectRatio: 2.0,
        },
        (decodedText) => {
          // Stop scanning on first successful decode. Clear the ref
          // so the auto-start effect can re-arm after user dismisses
          // the match card.
          scanner
            .stop()
            .then(() => {
              scannerRef.current = null;
              setScanning(false);
              lookupAssetRef.current?.(decodedText);
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

  const stopScanner = useCallback(async () => {
    const ref = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (ref) {
      try {
        await ref.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // Auto-start the scanner on mount and whenever we enter (or re-enter)
  // camera mode without an active match. startScanner is stable and
  // self-guards against double-starts, so this is safe to fire eagerly.
  useEffect(() => {
    if (manualMode) return;
    if (match) return; // a match card is showing — don't burn battery scanning
    startScanner();
  }, [manualMode, match, startScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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

  return (
    <div className="p-4 md:p-6 pb-24 max-w-lg mx-auto">
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
      <div className="flex gap-2 mb-4">
        <Button
          variant={!manualMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setManualMode(false);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <ScanLine className="w-4 h-4 mr-1.5" />
          Camera
        </Button>
        <Button
          variant={manualMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            stopScanner();
            setManualMode(true);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <Keyboard className="w-4 h-4 mr-1.5" />
          Manual
        </Button>
      </div>

      {/* Camera scanner — auto-starts on mount */}
      {!manualMode && (
        <div className="mb-4">
          <div
            id="scanner-viewport"
            ref={scanContainerRef}
            className="rounded-xl overflow-hidden bg-black relative"
            style={{ minHeight: "min(70vh, 480px)" }}
          />
          {!scanning && !cameraError && !match && (
            <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
              Starting camera…
            </p>
          )}
          {scanning && (
            <p className="text-xs text-center text-muted-foreground mt-2">
              Point the camera at the asset barcode
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

      {/* No match */}
      {matchError && !searching && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {matchError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setMatchError(null);
                if (manualMode) setManualInput("");
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Match found */}
      {match && !searching && (
        <Card className="rounded-2xl">
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
                onClick={() => router.push(`/assets/${match.id}`)}
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
