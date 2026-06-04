"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Edit,
  Trash2,
  AlertTriangle,
  Loader2,
  Copy,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { createClient } from "@/lib/supabase/client";
import { isCcFeeItem } from "@/lib/pr-cc-fee";
import {
  generatePurchaseRequestReport,
  PurchaseRequestReportError,
} from "@/lib/reports/purchase-request-report";
import {
  buildPrBundle,
  PrBundleError,
} from "@/lib/reports/pr-bundle";
import { formatInternalOrder } from "@/lib/pr-internal-order";
import {
  purchaseRequestPdfFilename,
  prEmailSubject,
} from "@/lib/reports/pr-naming";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { generateSowReport, type SowFormData } from "@/lib/reports/sow-report";
import { generateSowContent } from "@/lib/reports/sow-content";
import { roleLabels } from "@/lib/hooks/useProfiles";
import type { UserRole } from "@/types/database";
import {
  PR_DELIVERY_DEFAULTS,
  PR_REQUESTOR_DEFAULTS,
} from "@/lib/pr-defaults";
import { todayLocal, todayCentralMmDdYyyy } from "@/lib/utils/date";
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database";

// ── Constants (mirrors /sow page) ─────────────────────────────────────────────

const COURSE_NAME = "Veterans Memorial Golf Course";
const BUILDING = "Golf Course Maintenance Facility, BLDG 8400";
const FACILITY_ADDRESS = "2821 Great Lakes Dr, Great Lakes, IL 60088";

const REQUISITION_REASONS = [
  "New Requirement",
  "Replacement",
  "Additional Quantity",
  "Enhancement/Upgrade",
  "Other",
];

const REQUISITION_TYPES = [
  "New Procurement",
  "Re-order",
  "Renewal",
  "Non-Personal Services Contract",
  "Other",
];

// ── SOW quick-fill form type ───────────────────────────────────────────────────

interface SowQuickForm {
  workDescription: string;
  requisitionType: string;
  requisitionReason: string;
  projectedStartDate: string;
  desiredCompletionDate: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ── SOW wizard modal ──────────────────────────────────────────────────────────

function SowWizardModal({
  pr,
  profile,
  onComplete,
  onCancel,
}: {
  pr: PurchaseRequest;
  profile: { full_name?: string | null; role?: string; phone?: string | null; email?: string | null } | null;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const roleLabel = profile?.role ? (roleLabels[profile.role as UserRole] ?? "") : "";
  const fromName = [profile?.full_name, roleLabel, COURSE_NAME].filter(Boolean).join(", ");
  const userPhone = profile?.phone ?? PR_REQUESTOR_DEFAULTS.phone;

  // Pre-fill work description from PR line item descriptions.
  // Skip the 3% credit-card fee line — it's a payment surcharge, not work
  // a contractor needs to see described in the SOW.
  const autoDescription = (pr.items || [])
    .filter((it: PurchaseRequestItem) => !isCcFeeItem(it))
    .map((it: PurchaseRequestItem) => it.description)
    .filter(Boolean)
    .join("; ");

  const [step, setStep] = useState<"form" | "review">("form");
  useBodyScrollLock();
  const [form, setForm] = useState<SowQuickForm>({
    workDescription: autoDescription,
    requisitionType: "",
    requisitionReason: "New Requirement",
    projectedStartDate: "",
    desiredCompletionDate: "",
  });
  const [draft, setDraft] = useState<SowFormData | null>(null);

  const [generating, setGenerating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate =
    form.workDescription.trim() &&
    form.requisitionType &&
    form.projectedStartDate &&
    form.desiredCompletionDate;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { expectation, goods, certifications } = await generateSowContent({
        workDescription: form.workDescription,
        activityName: COURSE_NAME,
        from: fromName,
        startDate: form.projectedStartDate,
        endDate: form.desiredCompletionDate,
        requisitionType: form.requisitionType,
        // Hand the AI everything we know from the PR/quote so it can write
        // specific contracting language instead of generic boilerplate.
        vendorName: pr.vendor1_name,
        vendorContact: [pr.vendor1_poc, pr.vendor1_phone, pr.vendor1_email]
          .filter(Boolean)
          .join(" · ") || null,
        // Exclude the 3% credit-card fee line — the AI generating SOW
        // contracting language doesn't need to think about payment-method
        // surcharges as if they were work scope.
        items: (pr.items || [])
          .filter((it: PurchaseRequestItem) => !isCcFeeItem(it))
          .map((it: PurchaseRequestItem) => ({
            description: it.description || "",
            part_number: it.part_number,
            qty: Number(it.qty) || 0,
            unit: it.unit,
            unit_price: Number(it.unit_price) || 0,
          })),
        totalAmount: Number(pr.ige_amount) || 0,
        justification: pr.justification,
      });

      const sowData: SowFormData = {
        date: todayCentralMmDdYyyy(),
        from: fromName,
        activityName: COURSE_NAME,
        requisitionType: form.requisitionType,
        requisitionReason: form.requisitionReason,
        hasReferences: false,
        referencesText: "",
        projectedStartDate: form.projectedStartDate,
        desiredCompletionDate: form.desiredCompletionDate,
        facilityHours: "Open daily, including Sundays and holidays: 0700–2000",
        appointmentTime: "",
        servicesInterrupted: false,
        patronsInDanger: false,
        personnelCertifications: certifications,
        specificPersonnelRequired: false,
        personnelCount: "",
        lodgingRequired: false,
        individualLodging: false,
        groupLodging: false,
        vehicleStorage: false,
        equipmentStorage: false,
        baseAccess: false,
        escort: true,
        expectationText: expectation,
        weatherInterrupt: false,
        rescheduleIfWeather: false,
        rescheduleDate: "",
        baseEntryAmendments: false,
        buildingNameNumber: BUILDING,
        roomNumber: "",
        accessDirections: `Contractor shall proceed to the Veterans Memorial Golf Course at ${FACILITY_ADDRESS}. Upon arrival, contractor shall report to ${profile?.full_name ?? "the Course Superintendent"} (Course Superintendent) at ${userPhone} for escort to the work area. The contractor reports directly to the Course Superintendent for the duration of the contract. No base access, gate entry, or government-issued ID is required — the facility is accessible directly from the public road.`,
        descriptionOfGoods: goods,
        requestorName: profile?.full_name ?? "",
        requestorTitle: roleLabel,
        directPhone: userPhone,
        cellPhone: "",
        email: profile?.email ?? "",
        // The contractor reports to the superintendent (the current user),
        // not to the user's own boss. Joseph Caprez is still the delivery
        // POC on the PR itself; for the SOW he doesn't supervise the work.
        supervisorName: profile?.full_name ?? "",
        supervisorPhone: userPhone,
      };
      setDraft(sowData);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate SOW. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleBuildPdf() {
    if (!draft) return;
    setBuilding(true);
    setError(null);
    try {
      const { blob } = await generateSowReport(draft);
      onComplete(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build SOW PDF. Please try again.");
    } finally {
      setBuilding(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            {step === "review" && (
              <button
                onClick={() => setStep("form")}
                className="p-1 -ml-1 rounded hover:bg-muted transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <FileText className="w-4 h-4 text-[#1B4332]" />
            <span className="font-semibold text-sm">
              {step === "form" ? "Statement of Work" : "Review SOW Before Download"}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "form" && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              This PR is marked as requiring a Statement of Work. Fill in the details below — Claude AI will expand your description into formal contracting language. You&apos;ll get to review and edit before downloading.
            </p>

            {/* Work description */}
            <div>
              <label className={labelCls}>
                What work needs to be done? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.workDescription}
                onChange={(e) => setForm({ ...form, workDescription: e.target.value })}
                rows={4}
                placeholder="e.g. Asphalt patch & seal cart paths from tee 3 to 5; OR install new pump-house electrical panel; OR fence repair on perimeter — any trade works"
                className={`${inputCls} resize-none`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Pre-filled from your PR line items. Edit as needed.
              </p>
            </div>

            {/* Requisition type + reason */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Requisition Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.requisitionType}
                  onChange={(e) => setForm({ ...form, requisitionType: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select type…</option>
                  {REQUISITION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  Reason for Requisition
                </label>
                <select
                  value={form.requisitionReason}
                  onChange={(e) => setForm({ ...form, requisitionReason: e.target.value })}
                  className={inputCls}
                >
                  {REQUISITION_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Projected Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.projectedStartDate}
                  onChange={(e) => setForm({ ...form, projectedStartDate: e.target.value })}
                  min={todayLocal()}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Desired Completion <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.desiredCompletionDate}
                  onChange={(e) => setForm({ ...form, desiredCompletionDate: e.target.value })}
                  min={form.projectedStartDate || todayLocal()}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Auto-filled from your profile & PR defaults:</p>
              <p>Requestor & on-site supervisor: {profile?.full_name || "—"} · {roleLabel}</p>
              <p>Location: {BUILDING}</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === "review" && draft && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the AI-generated SOW content below. Edit any section before downloading.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>4.1 Requisition Type</label>
                <select
                  value={draft.requisitionType}
                  onChange={(e) => setDraft({ ...draft, requisitionType: e.target.value })}
                  className={inputCls}
                >
                  {REQUISITION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>4.2 Reason for Requisition</label>
                <select
                  value={draft.requisitionReason}
                  onChange={(e) => setDraft({ ...draft, requisitionReason: e.target.value })}
                  className={inputCls}
                >
                  {REQUISITION_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>4.6 Expectation (contractor duties)</label>
              <textarea
                value={draft.expectationText}
                onChange={(e) => setDraft({ ...draft, expectationText: e.target.value })}
                rows={10}
                className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
              />
            </div>

            <div>
              <label className={labelCls}>Description of Goods Requested</label>
              <textarea
                value={draft.descriptionOfGoods}
                onChange={(e) => setDraft({ ...draft, descriptionOfGoods: e.target.value })}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            </div>

            <div>
              <label className={labelCls}>Minimum Personnel Certifications</label>
              <textarea
                value={draft.personnelCertifications}
                onChange={(e) => setDraft({ ...draft, personnelCertifications: e.target.value })}
                rows={3}
                className={`${inputCls} resize-y`}
              />
            </div>

            <div>
              <label className={labelCls}>Facility / Program Hours</label>
              <input
                type="text"
                value={draft.facilityHours}
                onChange={(e) => setDraft({ ...draft, facilityHours: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Access Directions / Reporting Structure</label>
              <textarea
                value={draft.accessDirections}
                onChange={(e) => setDraft({ ...draft, accessDirections: e.target.value })}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Projected Start</label>
                <input
                  type="date"
                  value={draft.projectedStartDate}
                  onChange={(e) => setDraft({ ...draft, projectedStartDate: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Desired Completion</label>
                <input
                  type="date"
                  value={draft.desiredCompletionDate}
                  onChange={(e) => setDraft({ ...draft, desiredCompletionDate: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 flex gap-3">
          <button
            onClick={step === "review" ? () => setStep("form") : onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all"
          >
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "form" ? (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#2D6A4F] disabled:opacity-50 transition-all"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4" />Generate SOW</>
              )}
            </button>
          ) : (
            <button
              onClick={handleBuildPdf}
              disabled={building}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#2D6A4F] disabled:opacity-50 transition-all"
            >
              {building ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Building PDF…</>
              ) : (
                <><CheckCircle className="w-4 h-4" />Use This SOW</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main view component ───────────────────────────────────────────────────────

function ViewPurchaseRequestInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { profile, loading: authLoading } = useAuth();

  const isManagement =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdfOnly, setDownloadingPdfOnly] = useState(false);
  const [bundleWarnings, setBundleWarnings] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // SOW wizard state — shown before bundling when attached_sow is true
  const [showSowModal, setShowSowModal] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing request id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr) setError(fetchErr.message);
      else if (!data) setError("Not found");
      else setPr(data as unknown as PurchaseRequest);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const igeAmount = useMemo(() => {
    if (!pr) return 0;
    return (pr.items || []).reduce(
      (sum: number, it: PurchaseRequestItem) =>
        sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
      0,
    );
  }, [pr]);

  /** Execute the actual zip build + download, optionally with a SOW blob. */
  async function doBundleDownload(sowBlob?: Blob) {
    if (!pr) return;
    setDownloading(true);
    setBundleWarnings([]);
    setError(null);
    try {
      const result = await buildPrBundle(pr, sowBlob);
      await saveBlobToDevice({
        blob: result.blob,
        filename: result.filename,
        shareTitle: prEmailSubject(pr),
      });
      if (result.warnings.length > 0) setBundleWarnings(result.warnings);
    } catch (err) {
      const msg =
        err instanceof PrBundleError
          ? `Bundle build failed at "${err.step}": ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to build PR bundle";
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  /** Bundle download: intercepts if SOW is required but not yet filled. */
  function handleDownloadBundle() {
    if (!pr) return;
    if (pr.attached_sow && !pr.sow_storage_path) {
      // No pre-generated SOW on file — open the wizard
      setShowSowModal(true);
      return;
    }
    // Either no SOW required, or SOW was pre-generated at create time
    // (pr-bundle.ts will pull it from storage automatically)
    doBundleDownload();
  }

  /** Called by the SOW wizard after PDF generation. */
  async function handleSowComplete(sowBlob: Blob) {
    setShowSowModal(false);
    await doBundleDownload(sowBlob);
  }

  /** Single PDF download — when the user only wants the PR itself. */
  async function handleDownloadPdfOnly() {
    if (!pr) return;
    setDownloadingPdfOnly(true);
    setError(null);
    try {
      const blob = await generatePurchaseRequestReport(pr);
      const filename = purchaseRequestPdfFilename(pr);
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
    } catch (err) {
      const msg =
        err instanceof PurchaseRequestReportError
          ? `PDF generation failed at "${err.step}": ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to generate PDF";
      setError(msg);
    } finally {
      setDownloadingPdfOnly(false);
    }
  }

  async function handleDelete() {
    if (!pr) return;
    if (!confirm("Delete this purchase request? This cannot be undone.")) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("purchase_requests")
      .delete()
      .eq("id", pr.id);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.push("/purchase-requests");
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (error && !pr) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/purchase-requests"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Purchase Request</h1>
        </div>
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!pr) return null;

  const isDraft = pr.status === "draft";

  return (
    <>
      {/* SOW wizard modal — shown before bundling when attached_sow is true */}
      {showSowModal && (
        <SowWizardModal
          pr={pr}
          profile={profile}
          onComplete={handleSowComplete}
          onCancel={() => setShowSowModal(false)}
        />
      )}

      <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/purchase-requests"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">
              {formatDate(pr.date_prepared)}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {pr.vendor1_name || "Vendor TBD"}
            </p>
          </div>
        </div>

        {/* Total banner */}
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                IGE Amount
              </p>
              <p className="text-2xl font-bold text-primary">
                {formatMoney(igeAmount)}
              </p>
            </div>
            {isDraft ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-muted text-muted-foreground shrink-0">
                Draft
              </span>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-green-500/15 text-green-700 dark:text-green-400 shrink-0">
                Submitted
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={handleDownloadBundle}
            disabled={downloading || downloadingPdfOnly}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading
              ? "Building bundle..."
              : pr.attached_sow
                ? "Fill SOW & Download Bundle (zip)"
                : "Download PR + Quote + 889 (zip)"}
          </button>
          <button
            onClick={handleDownloadPdfOnly}
            disabled={downloading || downloadingPdfOnly}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {downloadingPdfOnly ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloadingPdfOnly ? "Generating..." : "Download PR PDF only"}
          </button>
          {isManagement && (
            <>
              <Link
                href={`/purchase-requests/new?from=${pr.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border font-medium hover:bg-muted active:scale-[0.98] transition-all"
              >
                <Copy className="w-4 h-4" />
                Order Again
              </Link>
              <Link
                href={`/purchase-requests/new?id=${pr.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border font-medium hover:bg-muted active:scale-[0.98] transition-all"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Link>
            </>
          )}
        </div>

        {bundleWarnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            {bundleWarnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Header */}
        <SectionCard title="Header">
          <Detail label="Date Prepared" value={formatDate(pr.date_prepared)} />
          <Detail label="Required Delivery" value={formatDate(pr.required_delivery_date)} />
          <Detail label="Request Via" value={pr.request_via} />
          <Detail label="Currency" value={pr.currency} />
        </SectionCard>

        {/* Requestor */}
        <SectionCard title="Requestor">
          <Detail label="Name" value={pr.requestor_name} />
          <Detail label="Email" value={pr.requestor_email || "—"} />
          <Detail label="Phone" value={pr.requestor_phone || "—"} />
        </SectionCard>

        {/* Vendor 1 */}
        <SectionCard title="Vendor 1">
          <Detail label="Name" value={pr.vendor1_name || "—"} />
          <Detail label="Address" value={
            [pr.vendor1_address, pr.vendor1_line2, pr.vendor1_city_state_zip]
              .filter(Boolean).join(", ") || "—"
          } fullWidth />
          <Detail label="POC" value={pr.vendor1_poc || "—"} />
          <Detail label="Email" value={pr.vendor1_email || "—"} />
          <Detail label="Phone" value={pr.vendor1_phone || "—"} />
          <Detail label="SAP No" value={pr.vendor1_sap_no || "—"} />
          <Detail label="GSA / NAF / Other" value={pr.vendor1_gsa_naf_no || "—"} />
        </SectionCard>

        {(pr.vendor2_name || pr.vendor3_name) && (
          <SectionCard title="Other Vendors">
            {pr.vendor2_name && <Detail label="Vendor 2" value={pr.vendor2_name} fullWidth />}
            {pr.vendor3_name && <Detail label="Vendor 3" value={pr.vendor3_name} fullWidth />}
          </SectionCard>
        )}

        {/* Invoice */}
        {(pr.invoice_address ||
          pr.invoice_email ||
          pr.invoice_phone ||
          pr.invoice_poc) && (
          <SectionCard title="Invoice Address">
            <Detail label="Address" value={
              [pr.invoice_address, pr.invoice_line2, pr.invoice_city_state_zip]
                .filter(Boolean).join(", ") || "—"
            } fullWidth />
            <Detail label="POC" value={pr.invoice_poc || "—"} />
            <Detail label="Phone" value={pr.invoice_phone || "—"} />
            <Detail label="Email" value={pr.invoice_email || "—"} />
          </SectionCard>
        )}

        {/* Delivery */}
        {(pr.delivery_address ||
          pr.delivery_email ||
          pr.delivery_phone ||
          pr.delivery_poc) && (
          <SectionCard title="Delivery Address">
            <Detail label="Address" value={
              [pr.delivery_address, pr.delivery_line2, pr.delivery_city_state_zip]
                .filter(Boolean).join(", ") || "—"
            } fullWidth />
            <Detail label="POC" value={pr.delivery_poc || "—"} />
            <Detail label="Phone" value={pr.delivery_phone || "—"} />
            <Detail label="Email" value={pr.delivery_email || "—"} />
          </SectionCard>
        )}

        {/* Accounting */}
        <SectionCard title="Accounting">
          <Detail label="Company Code" value={pr.company_code || "—"} />
          <Detail label="Requesting Facility" value={pr.requesting_facility_code || "—"} />
          <Detail
            label="Internal Order"
            value={
              formatInternalOrder(pr.pr_sequence_number, pr.date_prepared) ||
              pr.internal_order ||
              "—"
            }
          />
          <Detail label="Project No" value={pr.project_no || "—"} />
          <Detail label="Program" value={pr.program || "—"} />
        </SectionCard>

        {/* Items */}
        <section className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
          <header className="px-3 py-2 bg-muted/40 border-b border-border">
            <h2 className="font-semibold text-sm">
              Line Items ({pr.items?.length || 0})
            </h2>
          </header>
          <div className="divide-y divide-border">
            {(pr.items || []).map((it: PurchaseRequestItem, idx: number) => {
              const ext = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
              return (
                <div key={idx} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-muted-foreground">
                      Item #{it.item}
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {formatMoney(ext)}
                    </span>
                  </div>
                  <p className="text-sm leading-snug break-words">
                    {it.description || "—"}
                  </p>
                  {it.part_number && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Part #: <span className="font-mono">{it.part_number}</span>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2">
                    <span className="text-muted-foreground">Qty:</span>
                    <span>
                      {it.qty} {it.unit}
                    </span>
                    <span className="text-muted-foreground">Unit Price:</span>
                    <span>{formatMoney(Number(it.unit_price) || 0)}</span>
                    {it.site && (
                      <>
                        <span className="text-muted-foreground">Site:</span>
                        <span>{it.site}</span>
                      </>
                    )}
                    {it.cost_ctr && (
                      <>
                        <span className="text-muted-foreground">Cost Ctr:</span>
                        <span>{it.cost_ctr}</span>
                      </>
                    )}
                    {it.gl_acct && (
                      <>
                        <span className="text-muted-foreground">G/L Acct:</span>
                        <span>{it.gl_acct}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Justification */}
        {(pr.justification || pr.ige_based_on) && (
          <SectionCard title="IGE & Justification">
            {pr.ige_based_on && (
              <Detail label="IGE Based On" value={pr.ige_based_on} fullWidth />
            )}
            {pr.justification && (
              <Detail label="Justification" value={pr.justification} fullWidth />
            )}
            <Detail
              label="Excess Authorized"
              value={`${pr.ige_excess_pct}%`}
            />
          </SectionCard>
        )}

        {/* Approvals */}
        {(pr.financial_analyst ||
          pr.approving_authority ||
          pr.second_approval) && (
          <SectionCard title="Approvals">
            <Detail label="Financial Analyst" value={pr.financial_analyst || "—"} />
            <Detail label="Approving Authority" value={pr.approving_authority || "—"} />
            <Detail label="Approval Date" value={formatDate(pr.approving_signature_date)} />
            {pr.second_approval && (
              <>
                <Detail label="Second Approval" value={pr.second_approval} />
                <Detail label="Second Date" value={formatDate(pr.second_signature_date)} />
              </>
            )}
          </SectionCard>
        )}

        {/* Attached items */}
        {(pr.attached_ssj ||
          pr.attached_bnj ||
          pr.attached_pws ||
          pr.attached_itpr ||
          pr.attached_other ||
          pr.attached_section_889 ||
          pr.attached_sow) && (
          <SectionCard title="Attached Items">
            <div className="flex flex-wrap gap-2 col-span-2">
              {pr.attached_ssj && <Tag>SSJ</Tag>}
              {pr.attached_bnj && <Tag>BNJ</Tag>}
              {pr.attached_pws && <Tag>PWS</Tag>}
              {pr.attached_itpr && <Tag>ITPR</Tag>}
              {pr.attached_section_889 && <Tag>Section 889</Tag>}
              {pr.attached_sow && <Tag highlight>SOW</Tag>}
              {pr.attached_other && <Tag>Other: {pr.attached_other}</Tag>}
            </div>
          </SectionCard>
        )}

        {/* Delete */}
        {isManagement && (
          <div className="mt-8 pt-4 border-t border-border">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.99] transition-all disabled:opacity-50 text-sm font-medium"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deleting ? "Deleting..." : "Delete Request"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-border bg-card p-3">
      <h2 className="font-semibold text-sm mb-2">{title}</h2>
      <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">{children}</dl>
    </section>
  );
}

function Detail({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-foreground mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function Tag({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-md ${
        highlight
          ? "bg-[#1B4332]/15 text-[#1B4332] dark:text-green-400"
          : "bg-primary/10 text-primary"
      }`}
    >
      {children}
    </span>
  );
}

export default function ViewPurchaseRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <ViewPurchaseRequestInner />
    </Suspense>
  );
}
