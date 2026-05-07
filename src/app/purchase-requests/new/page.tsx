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
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { callApi, resolveAccessToken } from "@/lib/api/client";
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
import {
  generatePurchaseRequestReport,
  PurchaseRequestReportError,
} from "@/lib/reports/purchase-request-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";
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
  // Surfaced when the AI had to make a guess between multiple valid prices
  // (rental tiers, bulk-discount tiers, package levels, etc.). Items are
  // populated with the best guess; clicking an option here applies the
  // option's overrides to the matching line items in place — no second AI
  // call needed.
  clarifications?: Array<{
    question: string;
    options?: ClarificationOption[] | null;
    applies_to?: string[] | null;
  }>;
}

interface ClarificationOption {
  label: string;
  item_overrides: Array<{
    match_description: string;
    unit_price: number;
    qty?: number | null;
    unit?: string | null;
  }>;
}

function todayIso(): string {
  return todayLocal();
}

/** Today + N days, ISO. */
function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
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
  // Requesting facility is always 8400 for VMGC — pre-filled on new PRs
  // and overwritten by the loaded row in edit mode (see effect below).
  const [requestingFacility, setRequestingFacility] = useState(() =>
    editId ? "" : PR_ACCOUNTING_DEFAULTS.requesting_facility_code,
  );
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
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tick-counter so the spinner can show seconds elapsed during save —
  // gives the user feedback when the supabase-js auth lock or the
  // postgrest call wedges, instead of an indefinitely-spinning button.
  const [saveElapsed, setSaveElapsed] = useState(0);
  // Mutable cancel flag for the save flow. Set by the Cancel button while
  // saving; checked between async steps to bail out cleanly without
  // half-applying state.
  const cancelSaveRef = useRef<{ cancelled: boolean } | null>(null);

  // Quote-extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);
  const [extractClarifications, setExtractClarifications] = useState<
    Array<{
      question: string;
      options?: ClarificationOption[] | null;
      applies_to?: string[] | null;
    }>
  >([]);
  // Per-clarification: which option index has been applied (so the UI shows
  // a checkmark on the chosen pill and we can let the user switch).
  const [clarificationChoices, setClarificationChoices] = useState<
    Record<number, number>
  >({});
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
  // Uses raw REST instead of supabase.from() because this page is
  // frequently mounted right after a save, when supabase-js's auth
  // client has been observed to wedge — its getAccessToken() call sits
  // forever before our timeoutFetch wrapper fires, and the user just
  // sees "Loading vendors..." with no breadcrumb. Going straight to
  // PostgREST with the localStorage-cached JWT sidesteps that path.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      try {
        const accessToken = await resolveAccessToken(supabase, supabaseUrl, anonKey);
        const url = `${supabaseUrl}/rest/v1/vendors?select=*&order=name`;
        const res = await fetch(url, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (cancelled) return;
        if (!res.ok) {
          recordBreadcrumb(
            "warn",
            `[pr-new] vendor list fetch failed: ${res.status} ${res.statusText}`,
          );
          setVendors([]);
        } else {
          const data = (await res.json()) as VendorWith889[];
          setVendors(data);
        }
      } catch (err) {
        if (cancelled) return;
        recordBreadcrumb(
          "warn",
          `[pr-new] vendor list fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
        setVendors([]);
      } finally {
        if (!cancelled) setVendorsLoading(false);
      }
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
      // Backfill the facility code for older PRs that pre-date the
      // "always 8400" rule — they otherwise come in blank and the user
      // would have to type it again on every edit.
      setRequestingFacility(
        row.requesting_facility_code || PR_ACCOUNTING_DEFAULTS.requesting_facility_code,
      );
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

  /**
   * Apply a clarification option's overrides to the line items. Each override
   * matches an item by case-insensitive substring against `description`, then
   * updates unit_price (always) plus qty / unit (when set in the override).
   *
   * Idempotent — clicking a different option just overwrites the previous one,
   * so the user can switch between rental tiers without reloading the quote.
   */
  function applyClarificationOption(
    clarificationIdx: number,
    optionIdx: number,
    option: ClarificationOption,
  ) {
    setItems((prev) =>
      prev.map((it) => {
        const desc = (it.description || "").toLowerCase();
        // First override whose match_description is contained in the item's
        // description wins. (Most quotes only have one override per item.)
        const override = option.item_overrides.find((o) =>
          desc.includes((o.match_description || "").toLowerCase()),
        );
        if (!override) return it;
        return {
          ...it,
          unit_price: Number(override.unit_price) || it.unit_price,
          ...(override.qty !== null && override.qty !== undefined
            ? { qty: Number(override.qty) || it.qty }
            : {}),
          ...(override.unit ? { unit: override.unit } : {}),
        };
      }),
    );
    setClarificationChoices((prev) => ({ ...prev, [clarificationIdx]: optionIdx }));
    recordBreadcrumb(
      "click",
      `[clarification] applied option "${option.label}" (${option.item_overrides.length} override${option.item_overrides.length === 1 ? "" : "s"})`,
    );
  }

  // ── Quote upload + AI extraction ─────────────────────────────────────────
  async function handleQuoteUpload(file: File) {
    setExtracting(true);
    setExtractElapsed(0);
    setExtractWarnings([]);
    setExtractClarifications([]);
    setClarificationChoices({});
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
      if (result.clarifications && result.clarifications.length > 0) {
        setExtractClarifications(result.clarifications);
        recordBreadcrumb(
          "click",
          `[quote-upload] ${result.clarifications.length} clarification(s) needed`,
        );
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

  /**
   * Render a PR PDF from the CURRENT form state without saving anything to
   * the database. Useful for sanity-checking AI-extracted line items, vendor
   * blocks, and totals before committing the PR (and burning a sequence
   * number).
   *
   * The preview filename is prefixed with PREVIEW- and uses today's date in
   * place of the would-be Internal Order number, so it's obviously not a
   * submitted PR if it ends up in a "PRs" folder by accident.
   */
  async function handlePreview() {
    if (previewing || saving) return;
    setPreviewing(true);
    setError(null);
    try {
      const previewPr: PurchaseRequest = {
        id: editId || "preview",
        date_prepared: datePrepared,
        required_delivery_date: requiredDeliveryDate || null,
        request_via: requestVia.trim() || "CONTRACTING OFFICE",
        currency: currency.trim() || "US Dollar $",
        vendor_id: vendorId,
        quote_storage_path: null,
        quote_filename: existingQuoteName,
        quote_uploaded_at: null,
        // Sequence number isn't assigned until save; the PDF generator
        // falls back to whatever's in `internal_order` when this is null,
        // and we leave that null too so the IO field is just blank in the
        // preview.
        pr_sequence_number: prSequenceNumber,
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
        status: "draft",
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const blob = await generatePurchaseRequestReport(previewPr);

      // Filename: PREVIEW prefix + date + sanitized vendor name. No
      // sequence number here, so it can't be confused with a real PR PDF
      // generated from the view page.
      const dateStr = datePrepared.replace(/-/g, "");
      const vendorSlug = (v1.name.trim() || "vendor")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 30);
      const filename = `PR-PREVIEW-${dateStr}-${vendorSlug}.pdf`;

      await saveBlobToDevice({
        blob,
        filename,
        shareTitle: "PR preview",
      });
      recordBreadcrumb("click", `[pr-preview] saved ${filename} (${blob.size}B)`);
    } catch (err) {
      const msg =
        err instanceof PurchaseRequestReportError
          ? `${err.step}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      recordBreadcrumb("error", `[pr-preview] failed: ${msg}`);
      setError(`Preview failed: ${msg}`);
    } finally {
      setPreviewing(false);
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
    setSaveElapsed(0);
    setError(null);

    // Fresh cancellation handle for this save attempt.
    const cancel = { cancelled: false };
    cancelSaveRef.current = cancel;

    // 1Hz elapsed counter so the user sees the save isn't dead.
    const saveStartedAt = Date.now();
    const saveTick = window.setInterval(() => {
      setSaveElapsed(Math.floor((Date.now() - saveStartedAt) / 1000));
    }, 1000);

    /**
     * Wrap a supabase call with a step name so a wedged auth lock or
     * stalled postgrest call surfaces as "[pr-save] step X timed out
     * after Ns" in breadcrumbs, instead of an indefinitely-spinning
     * button. The timeout matches the supabase client's own 12s ceiling
     * with a small grace window.
     */
    const STEP_TIMEOUT_MS = 15_000;
    async function timedStep<T>(step: string, work: Promise<T>): Promise<T> {
      recordBreadcrumb("click", `[pr-save] ${step} start`);
      const result = await Promise.race([
        work,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${step} timed out after ${STEP_TIMEOUT_MS / 1000}s`)),
            STEP_TIMEOUT_MS,
          ),
        ),
      ]);
      recordBreadcrumb(
        "click",
        `[pr-save] ${step} done (${Math.floor((Date.now() - saveStartedAt) / 1000)}s)`,
      );
      return result;
    }

    const finishSave = () => {
      window.clearInterval(saveTick);
      if (cancelSaveRef.current === cancel) cancelSaveRef.current = null;
      setSaving(false);
      setSaveElapsed(0);
    };

    const supabase = createClient();
    recordBreadcrumb("click", `[pr-save] starting (asDraft=${asDraft})`);

    // ── Direct-to-PostgREST helper ──────────────────────────────────────
    // supabase.from(…).insert(…) is wrapped in supabase-js's fetchWithAuth,
    // which awaits auth.getSession() first. When the gotrue navigator.locks
    // auth lock is held by an abandoned holder (hot-reload race, crashed
    // prior call, expired refresh), every call hangs INDEFINITELY before
    // our fetch wrapper fires — exactly the "PR insert timed out after 15s"
    // breadcrumb we see in the wild. Bypassing supabase-js entirely for
    // these writes gets us a clean failure mode (or a successful write with
    // the cached localStorage token).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const accessToken = await resolveAccessToken(supabase, supabaseUrl, anonKey);

    interface RestResult<T> {
      data: T | null;
      error: { message: string } | null;
    }
    async function restFetch<T = unknown>(
      method: "POST" | "PATCH",
      pathWithQuery: string,
      body: unknown,
      preferRepresentation: boolean,
    ): Promise<RestResult<T>> {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/${pathWithQuery}`, {
          method,
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(preferRepresentation
              ? { Prefer: "return=representation" }
              : { Prefer: "return=minimal" }),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let message = `${method} ${pathWithQuery} failed: ${res.status} ${res.statusText}`;
          try {
            const errJson = await res.json();
            if (errJson?.message) message = errJson.message;
          } catch {
            /* ignore */
          }
          return { data: null, error: { message } };
        }
        if (!preferRepresentation) {
          return { data: null, error: null };
        }
        // PostgREST with .single() returns an array even when only one row is
        // expected. We fetched without ?select=* so the response is the
        // representation array; pick the first row.
        const json = (await res.json()) as T | T[];
        const row = Array.isArray(json) ? (json[0] ?? null) : json;
        return { data: row as T | null, error: null };
      } catch (err) {
        return {
          data: null,
          error: { message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

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
        finishSave();
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

    try {
      if (editId) {
        const { error: updateErr } = await timedStep(
          "update PR",
          restFetch(
            "PATCH",
            `purchase_requests?id=eq.${encodeURIComponent(editId)}`,
            payload,
            false,
          ),
        );
        if (cancel.cancelled) return;
        if (updateErr) {
          recordBreadcrumb("error", `[pr-save] update failed: ${updateErr.message}`);
          setError(updateErr.message);
          return;
        }
        router.push(`/purchase-requests/view?id=${editId}`);
      } else {
        const { data, error: insertErr } = await timedStep(
          "insert PR",
          restFetch<{ id: string }>(
            "POST",
            "purchase_requests",
            { ...payload, created_by: user.id },
            true,
          ),
        );
        if (cancel.cancelled) return;
        if (insertErr || !data) {
          recordBreadcrumb(
            "error",
            `[pr-save] insert failed: ${insertErr?.message || "no data"}`,
          );
          setError(insertErr?.message || "Failed to save request");
          return;
        }
        const newId = data.id;
        recordBreadcrumb("click", `[pr-save] inserted id=${newId.slice(-8)}`);

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
            recordBreadcrumb(
              "click",
              `[pr-save] quote upload start (${quoteFile.size}B)`,
            );
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
            if (cancel.cancelled) return;
            if (result.error) throw result.error;
            recordBreadcrumb("click", `[pr-save] quote upload done`);

            await timedStep(
              "link quote to PR",
              restFetch(
                "PATCH",
                `purchase_requests?id=eq.${encodeURIComponent(newId)}`,
                {
                  quote_storage_path: path,
                  quote_filename: quoteFile.name,
                  quote_uploaded_at: new Date().toISOString(),
                },
                false,
              ),
            );
            if (cancel.cancelled) return;
          } catch (err) {
            // Non-fatal — the PR is saved, quote upload can be retried via Edit.
            console.warn("[PR] quote upload failed:", err);
            recordBreadcrumb(
              "warn",
              `[pr-save] quote upload non-fatal failure: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        router.push(`/purchase-requests/view?id=${newId}`);
      }
    } catch (err) {
      if (cancel.cancelled) return;
      const msg = err instanceof Error ? err.message : String(err);
      recordBreadcrumb("error", `[pr-save] failed: ${msg}`);
      setError(`Save failed: ${msg}`);
    } finally {
      finishSave();
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

        {/* Request Via — gov form accepts only two values; render them
            as a binary toggle right under the vendor picker so the user
            picks once at the top. The values feed straight into the
            AcroForm dropdown on the generated PR PDF. */}
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Request Via
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["PURCHASE CARD", "CONTRACTING OFFICE"] as const).map((opt) => {
              const selected = requestVia === opt;
              const label =
                opt === "PURCHASE CARD" ? "Purchase Card" : "Contracting Office";
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRequestVia(opt)}
                  aria-pressed={selected}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors active:scale-[0.98] ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {selected && <CheckCircle2 className="w-4 h-4" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
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
              Reading quote
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

        {/* Clarifications — surfaced when the AI saw multiple valid prices
            (rental tiers, bulk discounts, package levels) and had to pick
            one. Each option carries its own item_overrides; clicking an
            option applies those overrides to matching line items. */}
        {extractClarifications.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {extractClarifications.length === 1
                ? "Quick question about this quote"
                : `${extractClarifications.length} quick questions about this quote`}
            </div>
            {extractClarifications.map((c, i) => {
              const chosenIdx = clarificationChoices[i];
              return (
                <div key={i} className="space-y-1">
                  <p className="text-xs font-medium leading-snug">{c.question}</p>
                  {c.applies_to && c.applies_to.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Affects: {c.applies_to.join(", ")}
                    </p>
                  )}
                  {c.options && c.options.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {c.options.map((opt, j) => {
                        const isChosen = chosenIdx === j;
                        return (
                          <button
                            key={j}
                            type="button"
                            onClick={() => applyClarificationOption(i, j, opt)}
                            className={`text-[11px] px-2 py-1 rounded-md border font-medium transition-colors active:scale-[0.97] ${
                              isChosen
                                ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:text-amber-200"
                                : "border-amber-500/40 bg-background text-foreground hover:bg-amber-500/10"
                            }`}
                          >
                            {isChosen && (
                              <CheckCircle2 className="inline w-3 h-3 mr-1 -mt-0.5" />
                            )}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-amber-500/20">
              Tap an answer above and the matching line items&apos; prices
              update automatically.
            </p>
            <button
              type="button"
              onClick={() => {
                setExtractClarifications([]);
                setClarificationChoices({});
              }}
              className="text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              Dismiss questions
            </button>
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
          {/* Set this from the toggle in the Vendor 1 section. Read-only
              here so we don't have two places that disagree. */}
          <div className="px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
            {requestVia || "—"}
            <span className="text-[10px] ml-2">
              (set from the toggle under Vendor 1)
            </span>
          </div>
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
            line item's matching field; the dropdown then displays whatever
            value is shared across ALL items (or "Mixed" if rows differ).
            That way the user can see at a glance what they applied. */}
        <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Apply to all line items
          </p>
          {(() => {
            // Reflect the value back to the picker if every line item agrees.
            // If items disagree (some 7010 / some 7009), show no selection
            // and surface a "Mixed" option so the user knows.
            const sharedValue = <K extends keyof PurchaseRequestItem>(
              key: K,
            ): string => {
              if (items.length === 0) return "";
              const first = items[0]?.[key];
              const allSame = items.every((it) => it[key] === first);
              return allSame && first ? String(first) : "";
            };
            const isMixed = <K extends keyof PurchaseRequestItem>(
              key: K,
            ): boolean => {
              if (items.length < 2) return false;
              const first = items[0]?.[key];
              return items.some((it) => it[key] !== first);
            };
            const sharedSite = sharedValue("site");
            const sharedCostCtr = sharedValue("cost_ctr");
            const sharedGl = sharedValue("gl_acct");
            const siteMixed = isMixed("site");
            const costCtrMixed = isMixed("cost_ctr");
            const glMixed = isMixed("gl_acct");

            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Site (all)">
                  <select
                    value={sharedSite}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setItems((prev) => prev.map((it) => ({ ...it, site: v })));
                    }}
                    className={inputCls}
                  >
                    <option value="">
                      {siteMixed ? "— Mixed (pick to override) —" : "— pick to apply —"}
                    </option>
                    {PR_SITES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cost Ctr (all)">
                  <select
                    value={sharedCostCtr}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setItems((prev) =>
                        prev.map((it) => ({ ...it, cost_ctr: v })),
                      );
                    }}
                    className={inputCls}
                  >
                    <option value="">
                      {costCtrMixed ? "— Mixed (pick to override) —" : "— pick to apply —"}
                    </option>
                    {PR_COST_CENTERS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="G/L (all)">
                  <select
                    value={sharedGl}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setItems((prev) =>
                        prev.map((it) => ({ ...it, gl_acct: v })),
                      );
                    }}
                    className={inputCls}
                  >
                    <option value="">
                      {glMixed ? "— Mixed (pick to override) —" : "— pick to apply —"}
                    </option>
                    {PR_GL_ACCOUNTS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })()}
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
          disabled={saving || previewing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {saving
            ? `Saving${saveElapsed > 3 ? ` · ${saveElapsed}s` : "..."}`
            : editId
              ? "Update Request"
              : "Submit Request"}
        </button>
        {saving && saveElapsed >= 10 && (
          <button
            onClick={() => {
              if (cancelSaveRef.current) cancelSaveRef.current.cancelled = true;
              setSaving(false);
              setSaveElapsed(0);
              recordBreadcrumb("click", "[pr-save] user cancelled");
              setError(
                "Save cancelled. If this keeps happening, hard-refresh (Ctrl+Shift+R) — the auth lock is sometimes held by an abandoned tab.",
              );
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-500/20 active:scale-[0.98] transition-all"
          >
            Cancel save · taking longer than usual
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handlePreview}
            disabled={saving || previewing}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-all"
          >
            {previewing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {previewing ? "Generating..." : "Preview PR"}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || previewing}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            Save as Draft
          </button>
        </div>
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
