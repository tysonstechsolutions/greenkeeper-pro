"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Camera,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { callApi } from "@/lib/api/client";
import {
  PR_INVOICE_DEFAULTS,
  PR_DELIVERY_DEFAULTS,
  PR_ACCOUNTING_DEFAULTS,
  PR_REQUEST_VIA_DEFAULT,
  PR_DELIVERY_DAYS,
} from "@/lib/pr-defaults";
import {
  PR_SITES,
  PR_COST_CENTERS,
  PR_GL_ACCOUNTS,
} from "@/lib/pr-accounting-codes";
import { formatInternalOrder } from "@/lib/pr-internal-order";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { isNative, capturePhoto } from "@/lib/utils/native-camera";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";
import { usePartHistory, type PartHistoryEntry } from "@/lib/hooks/usePartHistory";
import { History as HistoryIcon } from "lucide-react";
import type {
  PurchaseRequest,
  PurchaseRequestItem,
  VendorWith889,
} from "@/types/database";

// Response shape from the extract-quote edge function.
interface ExtractedQuote {
  vendor: {
    name: string | null;
    address: string | null;
    line2: string | null;
    city_state_zip: string | null;
    poc: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  items: Array<{
    description: string;
    part_number: string | null;
    qty: number;
    unit: string | null;
    unit_price: number;
  }>;
  warnings: string[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today + N days, ISO. */
function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptyItem(n: number): PurchaseRequestItem {
  return {
    item: n,
    site: "",
    cost_ctr: "",
    gl_acct: "",
    description: "",
    part_number: "",
    qty: 0,
    unit: "",
    unit_price: 0,
  };
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ──────────────────────────────────────────────────────────────────────────────

function NewPurchaseRequestPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  // `?from=<prId>` clones an existing PR into a brand-new draft. We load the
  // same fields as edit mode but reset dates / sequence / signatures so the
  // result is treated as a new request on save.
  const fromId = searchParams.get("from");
  const { profile, user, loading: authLoading } = useAuth();

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // ── State ────────────────────────────────────────────────────────────────
  const [datePrepared, setDatePrepared] = useState(todayIso());
  const [requiredDeliveryDate, setRequiredDeliveryDate] = useState(() =>
    editId ? "" : plusDaysIso(PR_DELIVERY_DAYS),
  );
  const [requestVia, setRequestVia] = useState(PR_REQUEST_VIA_DEFAULT);
  const [currency, setCurrency] = useState("US Dollar $");
  const [prSequenceNumber, setPrSequenceNumber] = useState<number | null>(null);

  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [requestorPhone, setRequestorPhone] = useState("");

  // Vendor 1
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [v1, setV1] = useState({
    name: "",
    address: "",
    line2: "",
    city_state_zip: "",
    poc: "",
    email: "",
    phone: "",
    sap_no: "",
    gsa_naf_no: "",
  });
  const [vendor2Name, setVendor2Name] = useState("");
  const [vendor3Name, setVendor3Name] = useState("");

  // Vendor library (for picker)
  const [vendors, setVendors] = useState<VendorWith889[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);

  // Uploaded quote file (kept locally; uploaded to storage on save)
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [existingQuoteName, setExistingQuoteName] = useState<string | null>(null);

  // Invoice — pre-filled with facility defaults on new PRs.
  // (Edit mode replaces these from the loaded row a few effects below.)
  const [invoice, setInvoice] = useState(() =>
    editId
      ? { address: "", line2: "", city_state_zip: "", poc: "", phone: "", email: "" }
      : { ...PR_INVOICE_DEFAULTS },
  );

  // Delivery — same pattern.
  const [delivery, setDelivery] = useState(() =>
    editId
      ? { address: "", line2: "", city_state_zip: "", poc: "", phone: "", email: "" }
      : { ...PR_DELIVERY_DEFAULTS },
  );

  // Accounting — Company Code is set by facility default; the rest is
  // user-editable. Internal Order is auto-generated on save and shown
  // read-only (computed from prSequenceNumber + datePrepared).
  const [companyCode, setCompanyCode] = useState(() =>
    editId ? "" : PR_ACCOUNTING_DEFAULTS.company_code,
  );
  const [requestingFacility, setRequestingFacility] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [program, setProgram] = useState("");

  // Line items
  const [items, setItems] = useState<PurchaseRequestItem[]>([emptyItem(1)]);

  // IGE / approvals
  const [igeExcessPct, setIgeExcessPct] = useState(0);
  const [justification, setJustification] = useState("");
  const [igeBasedOn, setIgeBasedOn] = useState("");
  const [financialAnalyst, setFinancialAnalyst] = useState("");
  const [approvingAuthority, setApprovingAuthority] = useState("");
  const [approvingDate, setApprovingDate] = useState("");
  const [secondApproval, setSecondApproval] = useState("");
  const [secondDate, setSecondDate] = useState("");

  // Attached items
  const [attached, setAttached] = useState({
    ssj: false,
    bnj: false,
    pws: false,
    itpr: false,
    section_889: false,
  });
  const [attachedOther, setAttachedOther] = useState("");

  // UI state for collapsible sections
  const [openSection, setOpenSection] = useState<string | null>("header");

  // Part-history library (past line items for re-ordering).
  const partHistory = usePartHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");

  const [loadingExisting, setLoadingExisting] = useState(!!editId || !!fromId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quote-extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  // Tick-counter so the spinner can show seconds elapsed — gives the user
  // visible feedback that we haven't crashed during the 15-30s vision call.
  const [extractElapsed, setExtractElapsed] = useState(0);
  // Mutable cancellation flag — the supabase-js invoke() doesn't accept an
  // AbortSignal in v2, so cancelling can't interrupt the in-flight network
  // call, but it lets the UI bail out and stop applying the late response.
  const cancelExtractRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    isNative().then((n) => {
      if (!cancelled) setNative(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auto-fill from profile ───────────────────────────────────────────────
  useEffect(() => {
    // Edit mode loads from the row; clone mode loads from the source PR.
    // Skip profile auto-fill in both cases so the loaded data wins.
    if (editId || fromId) return;
    if (!profile) return;
    if (!requestorName) {
      setRequestorName(profile.full_name || profile.display_name || "");
    }
    if (!requestorEmail && profile.email) {
      setRequestorEmail(profile.email);
    }
    if (!requestorPhone && profile.phone) {
      setRequestorPhone(profile.phone);
    }
  }, [profile, editId, fromId, requestorName, requestorEmail, requestorPhone]);

  // ── Load vendor library (for picker) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      if (cancelled) return;
      setVendors((data as VendorWith889[] | null) || []);
      setVendorsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Vendor picker → fill v1 fields ───────────────────────────────────────
  function handleVendorPicked(id: string) {
    setVendorId(id);
    const v = vendors.find((vv) => vv.id === id);
    if (!v) return;
    setV1({
      name: v.name || "",
      address: v.address || "",
      line2: v.address_line2 || "",
      city_state_zip: v.city_state_zip || "",
      poc: v.poc || "",
      email: v.email || "",
      phone: v.phone || "",
      sap_no: v.sap_vendor_no || "",
      gsa_naf_no: v.gsa_naf_other_no || "",
    });
    // Mark Section 889 as attached on this PR (vendor has it on file).
    if (v.section_889_path) {
      setAttached((prev) => ({ ...prev, section_889: true }));
    }
  }

  // ── Edit-mode load ───────────────────────────────────────────────────────
  useEffect(() => {
    const sourceId = editId || fromId;
    if (!sourceId) return;
    const isClone = !editId && !!fromId;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("id", sourceId)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr || !data) {
        setError(fetchErr?.message || "Request not found");
        setLoadingExisting(false);
        return;
      }
      const row = data as unknown as PurchaseRequest;
      // Edit: keep the original dates / sequence / signatures.
      // Clone: reset to "today" and let save assign a fresh sequence number,
      // and drop signatures so the new draft starts unsigned.
      setDatePrepared(isClone ? todayIso() : row.date_prepared);
      setRequiredDeliveryDate(
        isClone ? plusDaysIso(PR_DELIVERY_DAYS) : row.required_delivery_date || "",
      );
      setRequestVia(row.request_via);
      setCurrency(row.currency);
      setPrSequenceNumber(isClone ? null : row.pr_sequence_number);
      setVendorId(row.vendor_id);
      // Don't carry the source PR's uploaded quote file — the new request
      // will get its own.
      setExistingQuoteName(isClone ? null : row.quote_filename);
      setRequestorName(row.requestor_name);
      setRequestorEmail(row.requestor_email || "");
      setRequestorPhone(row.requestor_phone || "");
      setV1({
        name: row.vendor1_name || "",
        address: row.vendor1_address || "",
        line2: row.vendor1_line2 || "",
        city_state_zip: row.vendor1_city_state_zip || "",
        poc: row.vendor1_poc || "",
        email: row.vendor1_email || "",
        phone: row.vendor1_phone || "",
        sap_no: row.vendor1_sap_no || "",
        gsa_naf_no: row.vendor1_gsa_naf_no || "",
      });
      setVendor2Name(row.vendor2_name || "");
      setVendor3Name(row.vendor3_name || "");
      setInvoice({
        address: row.invoice_address || "",
        line2: row.invoice_line2 || "",
        city_state_zip: row.invoice_city_state_zip || "",
        poc: row.invoice_poc || "",
        phone: row.invoice_phone || "",
        email: row.invoice_email || "",
      });
      setDelivery({
        address: row.delivery_address || "",
        line2: row.delivery_line2 || "",
        city_state_zip: row.delivery_city_state_zip || "",
        poc: row.delivery_poc || "",
        phone: row.delivery_phone || "",
        email: row.delivery_email || "",
      });
      setCompanyCode(row.company_code || "");
      setRequestingFacility(row.requesting_facility_code || "");
      // internal_order is computed from pr_sequence_number; nothing to load.
      setProjectNo(row.project_no || "");
      setProgram(row.program || "");
      setItems(row.items?.length ? row.items : [emptyItem(1)]);
      setIgeExcessPct(Number(row.ige_excess_pct) || 0);
      setJustification(row.justification || "");
      setIgeBasedOn(row.ige_based_on || "");
      // Clone: drop signatures and approver names so the new draft starts
      // unsigned. Edit: keep what was there.
      setFinancialAnalyst(isClone ? "" : row.financial_analyst || "");
      setApprovingAuthority(isClone ? "" : row.approving_authority || "");
      setApprovingDate(isClone ? "" : row.approving_signature_date || "");
      setSecondApproval(isClone ? "" : row.second_approval || "");
      setSecondDate(isClone ? "" : row.second_signature_date || "");
      setAttached({
        ssj: row.attached_ssj,
        bnj: row.attached_bnj,
        pws: row.attached_pws,
        itpr: row.attached_itpr,
        section_889: row.attached_section_889,
      });
      setAttachedOther(row.attached_other || "");
      setLoadingExisting(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId, fromId]);

  // ── Computed totals ──────────────────────────────────────────────────────
  const igeAmount = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
        0,
      ),
    [items],
  );

  // ── Item helpers ─────────────────────────────────────────────────────────
  function updateItem(idx: number, patch: Partial<PurchaseRequestItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem(prev.length + 1)]);
  }
  function removeItem(idx: number) {
    setItems((prev) => {
      const out = prev.filter((_, i) => i !== idx);
      // Renumber 1..n
      return out.length === 0
        ? [emptyItem(1)]
        : out.map((it, i) => ({ ...it, item: i + 1 }));
    });
  }

  /**
   * Reuse a history entry. If the last line item is empty (nothing typed),
   * we fill it in place; otherwise we add a new line. This matches the
   * "tap a part, it appears as the next item" mental model.
   */
  function applyHistoryEntry(entry: PartHistoryEntry) {
    const filled: PurchaseRequestItem = {
      item: 0, // overwritten below
      site: "",
      cost_ctr: "",
      gl_acct: "",
      description: entry.description,
      part_number: entry.part_number,
      qty: entry.qty || 1,
      unit: entry.unit,
      unit_price: entry.unit_price,
    };
    setItems((prev) => {
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      const lastIsEmpty =
        !last.description.trim() &&
        !(last.part_number || "").trim() &&
        (last.qty || 0) === 0 &&
        (last.unit_price || 0) === 0;
      if (lastIsEmpty) {
        const next = [...prev];
        next[lastIdx] = { ...filled, item: lastIdx + 1 };
        return next;
      }
      return [...prev, { ...filled, item: prev.length + 1 }];
    });
    setHistoryOpen(false);
    setHistoryQuery("");
    setOpenSection("items");
  }

  // ── Quote upload + AI extraction ─────────────────────────────────────────
  async function handleQuoteUpload(file: File) {
    setExtracting(true);
    setExtractElapsed(0);
    setExtractWarnings([]);
    setExtractInfo(null);
    setError(null);

    // New cancellation handle — replaces any prior in-flight upload's flag.
    const cancel = { cancelled: false };
    cancelExtractRef.current = cancel;

    // 1Hz elapsed counter so the user can see vision is still working.
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setExtractElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    recordBreadcrumb(
      "click",
      `[quote-upload] start: ${file.name} ${file.type} ${file.size}B`,
    );

    try {
      // 1. Resize the image client-side to keep the request payload small
      //    and survive Capacitor WebView memory constraints.
      let payload: { image_base64: string; media_type: string };
      try {
        const resized = await resizeImageFile(file, {
          maxDim: 1600,
          quality: 0.82,
        });
        if (cancel.cancelled) return;
        recordBreadcrumb(
          "click",
          `[quote-upload] resized: ${resized.size}B ${resized.finalSize.width}x${resized.finalSize.height}`,
        );
        payload = {
          image_base64: resized.base64,
          media_type: resized.mediaType,
        };
        // Track the resized File for storage upload later.
        setQuoteFile(resized.file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Couldn't read image: ${msg}`);
      }

      // 2. Send JSON (NOT FormData — supabase.functions.invoke + Capacitor
      //    Android crashes on FormData bodies).
      const result = await callApi<ExtractedQuote>("extract-quote", {
        method: "POST",
        body: payload,
      });
      if (cancel.cancelled) {
        recordBreadcrumb("warn", `[quote-upload] response arrived after cancel — discarding`);
        return;
      }
      recordBreadcrumb(
        "click",
        `[quote-upload] got ${result.items?.length || 0} items + ${result.vendor ? "vendor" : "no vendor"} in ${Math.floor((Date.now() - startedAt) / 1000)}s`,
      );

      // Merge vendor fields if any are present and the existing form vendor
      // is empty — don't clobber what the user already typed.
      if (result.vendor) {
        setV1((prev) => ({
          name: prev.name || result.vendor!.name || "",
          address: prev.address || result.vendor!.address || "",
          line2: prev.line2 || result.vendor!.line2 || "",
          city_state_zip:
            prev.city_state_zip || result.vendor!.city_state_zip || "",
          poc: prev.poc || result.vendor!.poc || "",
          email: prev.email || result.vendor!.email || "",
          phone: prev.phone || result.vendor!.phone || "",
          sap_no: prev.sap_no,
          gsa_naf_no: prev.gsa_naf_no,
        }));
      }

      // Replace line items with extracted ones (renumbering 1..n).
      // If the form only had one empty default item, this is the natural
      // expectation. If the user already had real items typed in, merge.
      if (result.items && result.items.length > 0) {
        const extracted: PurchaseRequestItem[] = result.items.map((ex, i) => ({
          item: i + 1,
          site: "",
          cost_ctr: "",
          gl_acct: "",
          description: ex.description || "",
          part_number: ex.part_number || "",
          qty: Number(ex.qty) || 0,
          unit: ex.unit || "",
          unit_price: Number(ex.unit_price) || 0,
        }));

        // Heuristic: if existing items are all empty defaults, replace.
        // Otherwise append.
        const hasRealItems = items.some(
          (it) =>
            it.description.trim() ||
            it.part_number ||
            (it.qty || 0) > 0 ||
            (it.unit_price || 0) > 0,
        );

        if (hasRealItems) {
          setItems((prev) => {
            const combined = [...prev, ...extracted];
            return combined.map((it, i) => ({ ...it, item: i + 1 }));
          });
          setExtractInfo(
            `Added ${result.items.length} line items from the quote.`,
          );
        } else {
          setItems(extracted);
          setExtractInfo(
            `Filled ${result.items.length} line items from the quote.`,
          );
        }
        setOpenSection("items");
      } else if (!result.vendor) {
        setError(
          "Couldn't pull anything useful from that file. Try a clearer photo or a PDF version.",
        );
      } else {
        setExtractInfo("Filled in vendor info from the quote.");
      }

      if (result.warnings && result.warnings.length > 0) {
        setExtractWarnings(result.warnings);
      }
    } catch (err) {
      if (cancel.cancelled) return;
      const msg =
        err instanceof Error ? err.message : "Failed to read the quote.";
      // Log to breadcrumbs so the debug panel surfaces the real cause even
      // if React swallows the rendered error during a state-batching race.
      recordBreadcrumb("error", `[quote-upload] failed: ${msg}`);
      console.error("[quote-upload] failed", err);
      setError(`Quote upload failed: ${msg}`);
    } finally {
      window.clearInterval(tick);
      if (cancelExtractRef.current === cancel) {
        cancelExtractRef.current = null;
      }
      setExtracting(false);
    }
  }

  /**
   * Native camera path — uses @capacitor/camera so we don't trip the
   * file-input + WebView OOM crash on high-resolution Android photos.
   */
  async function handleNativeTakePhoto() {
    setExtracting(true);
    setExtractWarnings([]);
    setExtractInfo(null);
    setError(null);
    try {
      recordBreadcrumb("click", "[quote-upload] opening native camera");
      const photo = await capturePhoto();
      recordBreadcrumb(
        "click",
        `[quote-upload] photo captured ${photo.file.size}B`,
      );
      // Reuse the same upload pipeline so the resize + JSON-POST path still runs.
      await handleQuoteUpload(photo.file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Cancellation is the most common "error" — silently ignore.
      if (
        /cancel/i.test(msg) ||
        /denied/i.test(msg) ||
        /user/i.test(msg)
      ) {
        recordBreadcrumb("click", `[quote-upload] camera cancelled: ${msg}`);
        setExtracting(false);
        return;
      }
      recordBreadcrumb("error", `[quote-upload] camera failed: ${msg}`);
      console.error("[quote-upload] camera failed", err);
      setError(`Camera error: ${msg}`);
      setExtracting(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave(asDraft: boolean) {
    if (!user) {
      setError("Not signed in.");
      return;
    }
    if (!requestorName.trim()) {
      setError("Requestor name is required.");
      return;
    }
    if (!asDraft && !v1.name.trim()) {
      setError(
        "Vendor 1 is required to submit. Pick from the vendor library or fill in the name (use Save as Draft to skip).",
      );
      setOpenSection("vendor1");
      return;
    }
    if (!asDraft && !justification.trim()) {
      setError("Justification is required to submit (use Save as Draft to skip).");
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();

    // Upload the quote file (if a new one was attached) BEFORE saving the
    // PR, so the row points at a real storage path. We need the PR id to
    // namespace the path, so we generate it client-side here.
    let quoteStoragePath: string | null = null;
    let quoteFilenameSaved: string | null = existingQuoteName;
    let quoteUploadedAt: string | null = null;

    // We'll know the id only after insert (for new) OR we already have it (for edit).
    // For new PRs, defer the upload until after insert and do a follow-up update.
    if (quoteFile && editId) {
      try {
        const ext = quoteFile.name.split(".").pop() || "bin";
        quoteStoragePath = `quotes/${editId}/quote-${Date.now()}.${ext}`;
        // Race the upload against a 30s timeout so a stuck connection
        // doesn't lock the form forever.
        const upPromise = supabase.storage
          .from("vendor-files")
          .upload(quoteStoragePath, quoteFile, {
            upsert: true,
            contentType: quoteFile.type || "application/octet-stream",
          });
        const result = (await Promise.race([
          upPromise,
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  error: { message: "Quote upload timed out after 30s" },
                }),
              30_000,
            ),
          ),
        ])) as { error: { message: string } | null };
        if (result.error) throw result.error;
        quoteFilenameSaved = quoteFile.name;
        quoteUploadedAt = new Date().toISOString();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Quote upload failed: ${msg}`);
        setSaving(false);
        return;
      }
    }

    const payload = {
      date_prepared: datePrepared,
      required_delivery_date: requiredDeliveryDate || null,
      request_via: requestVia.trim() || "CONTRACTING OFFICE",
      currency: currency.trim() || "US Dollar $",
      vendor_id: vendorId,
      ...(quoteStoragePath
        ? {
            quote_storage_path: quoteStoragePath,
            quote_filename: quoteFilenameSaved,
            quote_uploaded_at: quoteUploadedAt,
          }
        : {}),
      requestor_name: requestorName.trim(),
      requestor_email: requestorEmail.trim() || null,
      requestor_phone: requestorPhone.trim() || null,
      vendor1_name: v1.name.trim() || null,
      vendor1_address: v1.address.trim() || null,
      vendor1_line2: v1.line2.trim() || null,
      vendor1_city_state_zip: v1.city_state_zip.trim() || null,
      vendor1_poc: v1.poc.trim() || null,
      vendor1_email: v1.email.trim() || null,
      vendor1_phone: v1.phone.trim() || null,
      vendor1_sap_no: v1.sap_no.trim() || null,
      vendor1_gsa_naf_no: v1.gsa_naf_no.trim() || null,
      vendor2_name: vendor2Name.trim() || null,
      vendor3_name: vendor3Name.trim() || null,
      invoice_address: invoice.address.trim() || null,
      invoice_line2: invoice.line2.trim() || null,
      invoice_city_state_zip: invoice.city_state_zip.trim() || null,
      invoice_poc: invoice.poc.trim() || null,
      invoice_phone: invoice.phone.trim() || null,
      invoice_email: invoice.email.trim() || null,
      delivery_address: delivery.address.trim() || null,
      delivery_line2: delivery.line2.trim() || null,
      delivery_city_state_zip: delivery.city_state_zip.trim() || null,
      delivery_poc: delivery.poc.trim() || null,
      delivery_phone: delivery.phone.trim() || null,
      delivery_email: delivery.email.trim() || null,
      company_code: companyCode.trim() || null,
      requesting_facility_code: requestingFacility.trim() || null,
      // internal_order is computed from pr_sequence_number at render time —
      // we don't let the user type a custom value, so we just store null
      // and the PDF/view layer formats from the sequence + date_prepared.
      internal_order: null,
      project_no: projectNo.trim() || null,
      program: program.trim() || null,
      items: items.filter(
        (it) => it.description.trim() || it.qty > 0 || it.unit_price > 0,
      ),
      ige_excess_pct: igeExcessPct,
      ige_amount: igeAmount,
      justification: justification.trim() || null,
      ige_based_on: igeBasedOn.trim() || null,
      financial_analyst: financialAnalyst.trim() || null,
      approving_authority: approvingAuthority.trim() || null,
      approving_signature_date: approvingDate || null,
      second_approval: secondApproval.trim() || null,
      second_signature_date: secondDate || null,
      attached_ssj: attached.ssj,
      attached_bnj: attached.bnj,
      attached_pws: attached.pws,
      attached_itpr: attached.itpr,
      attached_other: attachedOther.trim() || null,
      attached_section_889: attached.section_889,
      status: asDraft ? "draft" : "submitted",
    };

    if (editId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- purchase_requests not yet in generated types
      const { error: updateErr } = await (supabase as any)
        .from("purchase_requests")
        .update(payload)
        .eq("id", editId);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
      router.push(`/purchase-requests/view?id=${editId}`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- purchase_requests not yet in generated types
      const { data, error: insertErr } = await (supabase as any)
        .from("purchase_requests")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Failed to save request");
        setSaving(false);
        return;
      }
      const newId = (data as { id: string }).id;

      // Now that we have an id, upload the quote (if any) and link it.
      if (quoteFile) {
        try {
          const ext = quoteFile.name.split(".").pop() || "bin";
          const path = `quotes/${newId}/quote-${Date.now()}.${ext}`;
          // 30s timeout — large quote PDFs on slow networks otherwise
          // freeze the navigation to the view page.
          const upPromise = supabase.storage
            .from("vendor-files")
            .upload(path, quoteFile, {
              upsert: true,
              contentType: quoteFile.type || "application/octet-stream",
            });
          const result = (await Promise.race([
            upPromise,
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    error: { message: "Quote upload timed out after 30s" },
                  }),
                30_000,
              ),
            ),
          ])) as { error: { message: string } | null };
          if (result.error) throw result.error;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types
          await (supabase as any)
            .from("purchase_requests")
            .update({
              quote_storage_path: path,
              quote_filename: quoteFile.name,
              quote_uploaded_at: new Date().toISOString(),
            })
            .eq("id", newId);
        } catch (err) {
          // Non-fatal — the PR is saved, quote upload can be retried via Edit.
          console.warn("[PR] quote upload failed:", err);
        }
      }

      router.push(`/purchase-requests/view?id=${newId}`);
    }
  }

  // ── Render guards ────────────────────────────────────────────────────────
  if (authLoading || loadingExisting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/purchase-requests"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">New Purchase Request</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-3 pb-40 max-w-2xl mx-auto overflow-x-hidden">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/purchase-requests"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">
            {editId ? "Edit Purchase Request" : "New Purchase Request"}
          </h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            NAVMIDLANT NAF FY2025
          </p>
        </div>
      </div>

      {/* Vendor picker — first thing the user sees */}
      <section className="mt-3 rounded-xl border border-border bg-card p-3">
        <h2 className="font-semibold text-sm mb-2">Pick a Vendor</h2>
        {vendorsLoading ? (
          <div className="px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
            Loading vendors...
          </div>
        ) : vendors.length === 0 ? (
          <div className="px-3 py-3 rounded-lg border border-dashed border-border text-sm">
            <p className="text-muted-foreground mb-2">
              No vendors yet. Add a vendor first so the PR auto-fills (and 889 form attaches automatically).
            </p>
            <Link
              href="/vendors"
              className="text-primary font-medium text-sm hover:underline"
            >
              Manage Vendors →
            </Link>
          </div>
        ) : (
          <>
            <select
              value={vendorId || ""}
              onChange={(e) => {
                const id = e.target.value;
                if (id) handleVendorPicked(id);
                else {
                  setVendorId(null);
                  setV1({
                    name: "", address: "", line2: "", city_state_zip: "",
                    poc: "", email: "", phone: "", sap_no: "", gsa_naf_no: "",
                  });
                }
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
            >
              <option value="">— Select vendor —</option>
              {vendors
                .filter((v) => {
                  // Only vendors with an active (non-expired) 889 are eligible.
                  // No 889 → ineligible. Expired → ineligible. Expiring soon
                  // is still eligible but we tag it so the user re-uploads.
                  if (!v.section_889_path) return false;
                  if (
                    v.section_889_expiration_date &&
                    new Date(v.section_889_expiration_date).getTime() < Date.now()
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((v) => {
                  const exp = v.section_889_expiration_date;
                  const expSoon =
                    exp &&
                    new Date(exp).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
                  const tag = expSoon ? " [889 expiring soon]" : "";
                  return (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {tag}
                    </option>
                  );
                })}
            </select>
            {vendors.some(
              (v) =>
                !v.section_889_path ||
                (v.section_889_expiration_date &&
                  new Date(v.section_889_expiration_date).getTime() < Date.now()),
            ) && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                Some vendors are hidden because they don&apos;t have an active 889
                form. Procurement can&apos;t accept PRs without one — upload a 889
                in{" "}
                <Link href="/vendors" className="underline">
                  Vendors
                </Link>{" "}
                to make them available.
              </p>
            )}
          </>
        )}
        {vendorId && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Vendor info auto-filled below. You can still edit any field.
          </p>
        )}
      </section>

      {/* Running total banner */}
      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          IGE Total
        </p>
        <p className="text-2xl font-bold text-primary">
          {formatMoney(igeAmount)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {items.length} line item{items.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Quote upload — AI auto-fill + attach for download bundle */}
      <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
        <div className="flex items-start gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Quote</p>
            <p className="text-[11px] text-muted-foreground">
              Snap or upload the vendor quote. Vendor info + line items
              auto-fill, AND the file gets attached to the PR download bundle.
            </p>
          </div>
        </div>
        {(quoteFile || existingQuoteName) && (
          <div className="mb-2 px-2 py-1.5 rounded bg-background border border-border text-xs">
            <span className="text-muted-foreground">Attached:</span>{" "}
            <span className="font-medium break-all">
              {quoteFile?.name || existingQuoteName}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {native ? (
            <button
              type="button"
              onClick={handleNativeTakePhoto}
              disabled={extracting}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-amber-500/60 bg-background text-sm font-medium transition-colors ${
                extracting
                  ? "opacity-50 pointer-events-none"
                  : "hover:bg-amber-500/10"
              }`}
            >
              <Camera className="w-4 h-4" />
              Take Photo
            </button>
          ) : (
            <label
              className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-amber-500/60 bg-background text-sm font-medium transition-colors cursor-pointer ${
                extracting
                  ? "opacity-50 pointer-events-none"
                  : "hover:bg-amber-500/10"
              }`}
            >
              <Camera className="w-4 h-4" />
              Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleQuoteUpload(f);
                  e.target.value = "";
                }}
                disabled={extracting}
              />
            </label>
          )}
          <label
            className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-amber-500/60 bg-background text-sm font-medium transition-colors cursor-pointer ${
              extracting
                ? "opacity-50 pointer-events-none"
                : "hover:bg-amber-500/10"
            }`}
          >
            <Plus className="w-4 h-4" />
            Upload File
            <input
              type="file"
              accept="image/*,application/pdf"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleQuoteUpload(f);
                e.target.value = "";
              }}
              disabled={extracting}
            />
          </label>
        </div>

        {extracting && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="flex-1">
              Reading quote with Claude
              {extractElapsed > 0 && ` · ${extractElapsed}s`}
              {extractElapsed >= 25 && extractElapsed < 60 && (
                <span className="text-muted-foreground"> (vision can take 30–45s)</span>
              )}
              {extractElapsed >= 60 && (
                <span className="text-red-600 dark:text-red-400">
                  {" "}(taking longer than usual — try Cancel)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                if (cancelExtractRef.current) {
                  cancelExtractRef.current.cancelled = true;
                }
                setExtracting(false);
                setExtractElapsed(0);
                recordBreadcrumb("click", "[quote-upload] user cancelled");
              }}
              className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        {extractInfo && !extracting && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{extractInfo}</span>
          </div>
        )}

        {extractWarnings.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {extractWarnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <Section
        title="Header"
        sectionKey="header"
        open={openSection === "header"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Date Prepared">
          <input
            type="date"
            value={datePrepared}
            onChange={(e) => setDatePrepared(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Required Delivery Date">
          <input
            type="date"
            value={requiredDeliveryDate}
            onChange={(e) => setRequiredDeliveryDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Request Via">
          <input
            type="text"
            value={requestVia}
            onChange={(e) => setRequestVia(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Currency">
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Requestor */}
      <Section
        title="Requestor"
        sectionKey="requestor"
        open={openSection === "requestor"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Name">
          <input
            type="text"
            value={requestorName}
            onChange={(e) => setRequestorName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={requestorEmail}
            onChange={(e) => setRequestorEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={requestorPhone}
            onChange={(e) => setRequestorPhone(e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Vendor 1 */}
      <Section
        title="Vendor 1 (primary)"
        sectionKey="vendor1"
        open={openSection === "vendor1"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Vendor Name">
          <input type="text" value={v1.name} onChange={(e) => setV1({ ...v1, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Address">
          <input type="text" value={v1.address} onChange={(e) => setV1({ ...v1, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Address Line 2">
          <input type="text" value={v1.line2} onChange={(e) => setV1({ ...v1, line2: e.target.value })} className={inputCls} />
        </Field>
        <Field label="City, State ZIP">
          <input type="text" value={v1.city_state_zip} onChange={(e) => setV1({ ...v1, city_state_zip: e.target.value })} className={inputCls} />
        </Field>
        <Field label="POC">
          <input type="text" value={v1.poc} onChange={(e) => setV1({ ...v1, poc: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" value={v1.email} onChange={(e) => setV1({ ...v1, email: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={v1.phone} onChange={(e) => setV1({ ...v1, phone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="SAP Vendor No">
          <input type="text" value={v1.sap_no} onChange={(e) => setV1({ ...v1, sap_no: e.target.value })} className={inputCls} />
        </Field>
        <Field label="GSA / NAF / Other No">
          <input type="text" value={v1.gsa_naf_no} onChange={(e) => setV1({ ...v1, gsa_naf_no: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      {/* Vendor 2 + 3 */}
      <Section
        title="Vendor 2 / Vendor 3"
        sectionKey="vendor23"
        open={openSection === "vendor23"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <p className="text-[11px] text-muted-foreground italic mb-2">
          Names only — full vendor details go as separate attachments per the form.
        </p>
        <Field label="Vendor 2 Name">
          <input type="text" value={vendor2Name} onChange={(e) => setVendor2Name(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Vendor 3 Name">
          <input type="text" value={vendor3Name} onChange={(e) => setVendor3Name(e.target.value)} className={inputCls} />
        </Field>
      </Section>

      {/* Invoice address */}
      <Section
        title="Invoice Address"
        sectionKey="invoice"
        open={openSection === "invoice"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Address">
          <input type="text" value={invoice.address} onChange={(e) => setInvoice({ ...invoice, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Address Line 2">
          <input type="text" value={invoice.line2} onChange={(e) => setInvoice({ ...invoice, line2: e.target.value })} className={inputCls} />
        </Field>
        <Field label="City, State ZIP">
          <input type="text" value={invoice.city_state_zip} onChange={(e) => setInvoice({ ...invoice, city_state_zip: e.target.value })} className={inputCls} />
        </Field>
        <Field label="POC">
          <input type="text" value={invoice.poc} onChange={(e) => setInvoice({ ...invoice, poc: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={invoice.phone} onChange={(e) => setInvoice({ ...invoice, phone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" value={invoice.email} onChange={(e) => setInvoice({ ...invoice, email: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      {/* Delivery address */}
      <Section
        title="Delivery Address"
        sectionKey="delivery"
        open={openSection === "delivery"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Address">
          <input type="text" value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Address Line 2">
          <input type="text" value={delivery.line2} onChange={(e) => setDelivery({ ...delivery, line2: e.target.value })} className={inputCls} />
        </Field>
        <Field label="City, State ZIP">
          <input type="text" value={delivery.city_state_zip} onChange={(e) => setDelivery({ ...delivery, city_state_zip: e.target.value })} className={inputCls} />
        </Field>
        <Field label="POC">
          <input type="text" value={delivery.poc} onChange={(e) => setDelivery({ ...delivery, poc: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" value={delivery.email} onChange={(e) => setDelivery({ ...delivery, email: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      {/* Accounting */}
      <Section
        title="Accounting"
        sectionKey="accounting"
        open={openSection === "accounting"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Company Code">
          <input type="text" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Requesting Facility / Code">
          <input type="text" value={requestingFacility} onChange={(e) => setRequestingFacility(e.target.value)} className={inputCls} />
        </Field>
        <Field
          label="Internal Order"
          hint={
            prSequenceNumber == null
              ? "Auto-assigned at save (next available FY26-FM-NNNN)."
              : "Locked once a PR is saved — used for procurement filing."
          }
        >
          <input
            type="text"
            value={
              formatInternalOrder(prSequenceNumber, datePrepared) ||
              "(auto-assigned at save)"
            }
            readOnly
            className={`${inputCls} bg-muted/40 text-muted-foreground font-mono`}
          />
        </Field>
        <Field label="Project No">
          <input type="text" value={projectNo} onChange={(e) => setProjectNo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Program">
          <input type="text" value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls} />
        </Field>
      </Section>

      {/* Line items */}
      <Section
        title={`Line Items (${items.length})`}
        sectionKey="items"
        open={openSection === "items"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        {/* Apply to all — bulk-set Site / Cost Ctr / G/L across every line.
            Typical use: one PR per site, so the user picks once instead of
            setting each row. Picking a value immediately overwrites every
            line item's matching field. */}
        <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Apply to all line items
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="Site (all)">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setItems((prev) => prev.map((it) => ({ ...it, site: v })));
                }}
                className={inputCls}
              >
                <option value="">— pick to apply —</option>
                {PR_SITES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cost Ctr (all)">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setItems((prev) => prev.map((it) => ({ ...it, cost_ctr: v })));
                }}
                className={inputCls}
              >
                <option value="">— pick to apply —</option>
                {PR_COST_CENTERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="G/L (all)">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setItems((prev) => prev.map((it) => ({ ...it, gl_acct: v })));
                }}
                className={inputCls}
              >
                <option value="">— pick to apply —</option>
                {PR_GL_ACCOUNTS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Reuse from history */}
        {!partHistory.loading && partHistory.total > 0 && (
          <div className="mb-3 rounded-lg border border-border bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
            >
              <HistoryIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium flex-1">
                Reuse from history
              </span>
              <span className="text-[11px] text-muted-foreground">
                {partHistory.total} parts
              </span>
              {historyOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {historyOpen && (
              <div className="border-t border-border p-2 space-y-2">
                <input
                  type="text"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Search by part # or description..."
                  className={inputCls}
                />
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {partHistory.search(historyQuery, 12).map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => applyHistoryEntry(entry)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug break-words">
                          {entry.description || "(no description)"}
                        </p>
                        <span className="text-xs text-primary font-semibold shrink-0">
                          ${entry.unit_price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                        {entry.part_number && (
                          <span className="font-mono">
                            #{entry.part_number}
                          </span>
                        )}
                        {entry.vendor && <span>{entry.vendor}</span>}
                        <span>used {entry.count}×</span>
                      </div>
                    </button>
                  ))}
                  {partHistory.search(historyQuery, 12).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No matches.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border bg-background p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">
                  Item #{item.item}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-500/10"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Field label="Item Name / Description">
                <textarea
                  value={item.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  rows={2}
                  placeholder="e.g. Toro Greensmaster 3150 mower blade"
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <Field label="Part / Item Number">
                <input
                  type="text"
                  value={item.part_number || ""}
                  onChange={(e) => updateItem(idx, { part_number: e.target.value })}
                  placeholder="e.g. 100-1234 or SKU"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Site">
                  <select
                    value={item.site}
                    onChange={(e) => updateItem(idx, { site: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">— pick —</option>
                    {PR_SITES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cost Ctr">
                  <select
                    value={item.cost_ctr}
                    onChange={(e) => updateItem(idx, { cost_ctr: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">— pick —</option>
                    {PR_COST_CENTERS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="G/L Account">
                <select
                  value={item.gl_acct}
                  onChange={(e) => updateItem(idx, { gl_acct: e.target.value })}
                  className={inputCls}
                >
                  <option value="">— pick —</option>
                  {PR_GL_ACCOUNTS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Qty">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={item.qty || ""}
                    onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Unit">
                  <input type="text" value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="Unit Price ($)">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={item.unit_price || ""}
                  onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                  className={inputCls}
                />
              </Field>
              <div className="text-right text-sm font-semibold pt-1">
                Extended:{" "}
                <span className="text-primary">
                  {formatMoney((item.qty || 0) * (item.unit_price || 0))}
                </span>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Line Item
          </button>
        </div>
      </Section>

      {/* IGE / Justification */}
      <Section
        title="IGE & Justification"
        sectionKey="ige"
        open={openSection === "ige"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="IGE Excess Authorized (%)" hint="Cardholder may exceed IGE by this %">
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            max="100"
            value={igeExcessPct}
            onChange={(e) => setIgeExcessPct(parseFloat(e.target.value) || 0)}
            className={inputCls}
          />
        </Field>
        <Field label="IGE Based On">
          <textarea
            value={igeBasedOn}
            onChange={(e) => setIgeBasedOn(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Quote, prior invoice, market research..."
          />
        </Field>
        <Field label="Justification for Purchase">
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
            className={`${inputCls} resize-none`}
            placeholder="Why this purchase is needed..."
          />
        </Field>
      </Section>

      {/* Approvals */}
      <Section
        title="Approvals"
        sectionKey="approvals"
        open={openSection === "approvals"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <Field label="Financial Analyst">
          <input type="text" value={financialAnalyst} onChange={(e) => setFinancialAnalyst(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Approving Authority">
          <input type="text" value={approvingAuthority} onChange={(e) => setApprovingAuthority(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Signature Date">
          <input type="date" value={approvingDate} onChange={(e) => setApprovingDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Second Approval (if required)">
          <input type="text" value={secondApproval} onChange={(e) => setSecondApproval(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Second Signature Date">
          <input type="date" value={secondDate} onChange={(e) => setSecondDate(e.target.value)} className={inputCls} />
        </Field>
      </Section>

      {/* Attached items */}
      <Section
        title="Attached Items"
        sectionKey="attached"
        open={openSection === "attached"}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
      >
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="SSJ"
            checked={attached.ssj}
            onChange={(v) => setAttached({ ...attached, ssj: v })}
          />
          <Checkbox
            label="BNJ"
            checked={attached.bnj}
            onChange={(v) => setAttached({ ...attached, bnj: v })}
          />
          <Checkbox
            label="PWS"
            checked={attached.pws}
            onChange={(v) => setAttached({ ...attached, pws: v })}
          />
          <Checkbox
            label="ITPR"
            checked={attached.itpr}
            onChange={(v) => setAttached({ ...attached, itpr: v })}
          />
          <Checkbox
            label="Section 889"
            checked={attached.section_889}
            onChange={(v) => setAttached({ ...attached, section_889: v })}
          />
        </div>
        <div className="mt-2">
          <Field label="Other (specify)">
            <input
              type="text"
              value={attachedOther}
              onChange={(e) => setAttachedOther(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Save bar */}
      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {saving ? "Saving..." : editId ? "Update Request" : "Submit Request"}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-all"
        >
          <Save className="w-4 h-4" />
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  sectionKey,
  open,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  open: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between px-3 py-3 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors"
      >
        <span className="font-semibold text-sm">{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </section>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
        checked
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border hover:bg-muted"
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          checked ? "bg-white border-white" : "border-current"
        }`}
      >
        {checked && (
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
        )}
      </span>
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper that re-mounts the inner page when `?id=…` changes (or appears /
 * disappears). Without this, navigating from /new?id=A to /new (fresh)
 * keeps the previous form state because the pathname didn't change.
 */
function NewPurchaseRequestPageKeyed() {
  const editId = useSearchParams().get("id");
  return <NewPurchaseRequestPageInner key={editId || "new"} />;
}

export default function NewPurchaseRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <NewPurchaseRequestPageKeyed />
    </Suspense>
  );
}
