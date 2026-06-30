"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Settings,
  FileText,
  Inbox,
  Wallet,
  Download,
  Trash2,
  Undo2,
  ArrowRight,
  SlidersHorizontal,
  Loader2,
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
  directStorageDelete,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type {
  PrAudit,
  CostCenterBudget,
  PrAuditReviewStatus,
  PurchaseRequest,
} from "@/types/database";
import {
  buildCostCenterRollup,
  rollupTotals,
  rollupMonthTotals,
  monthFor,
  auditInFiscalMonth,
  type CostCenterRollup,
} from "@/lib/pr-audit/rollup";
import {
  currentFederalFiscalYear,
  fiscalYearShort,
  fiscalYearLabel,
  fiscalMonthIndex,
  FISCAL_MONTH_LABELS,
} from "@/lib/pr-audit/fiscal-year";
import {
  downloadBundle,
  downloadOriginalFile,
  getAuditPreviewBlob,
  type AuditPreview,
} from "@/lib/pr-audit/download";
import { bundleIssueCounts } from "@/lib/pr-audit/bundle-check";
import { syncPrReceivedTask } from "@/lib/my-day/pr-trigger";
import { FilePreviewOverlay } from "@/components/pr-audit/file-preview";
import { usePrCodes } from "@/lib/hooks/usePrCodes";
import {
  REVIEW_META,
  nextStatus,
  prevStatus,
  flagsAccepted,
  stageDatePatch,
} from "@/lib/pr-audit/lifecycle";
import { groupAuditsByMonth } from "@/lib/pr-audit/month-groups";
import { STAGE_ICON } from "@/components/pr-audit/stage-icon";
import { purchaseRequestToAuditPayload, type Vendor889 } from "@/lib/pr-audit/pr-import";
import {
  DownloadChecklist,
  type Section889Note,
} from "@/components/pr-audit/download-checklist";

function formatMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatMoneyShort(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) {
    return `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortCcLabel(label: string): string {
  const afterDash = label.includes("—") ? label.split("—")[1].trim() : label;
  return afterDash.replace(/^GLK VMGC\s*/i, "").trim() || label;
}

/** Section 889 note for one PR's download checklist, from its own 889 fields. */
function auditSection889Note(audit: PrAudit): Section889Note {
  const vendor = audit.vendor_name || "the vendor";
  const exp = audit.section_889_expiration_date;
  if (!exp) {
    return {
      tone: "muted",
      text: audit.section_889_path
        ? `${vendor}'s 889 is attached but has no expiration recorded — verify it's valid.`
        : `Confirm ${vendor}'s Section 889 is on file and not expired.`,
    };
  }
  const expired = new Date(exp + "T12:00:00").getTime() < Date.now();
  const expStr = formatDate(exp);
  return expired
    ? { tone: "warn", text: `⚠ ${vendor}'s 889 EXPIRED ${expStr} — update it before sending up.` }
    : { tone: "ok", text: `${vendor}'s 889 is valid (expires ${expStr}).` };
}

// ── Monthly bars ──────────────────────────────────────────────────────────────

function MonthlyBars({
  row,
  selectedIdx,
}: {
  row: CostCenterRollup;
  selectedIdx: number | null;
}) {
  const max = Math.max(1, ...row.byMonth.map((m) => m.spent + m.pipeline));
  return (
    <div className="flex items-end gap-[3px] h-10 mt-2">
      {row.byMonth.map((m) => {
        const total = m.spent + m.pipeline;
        const h = total > 0 ? Math.max(8, Math.round((total / max) * 40)) : 2;
        const spentH = total > 0 ? Math.round((m.spent / total) * h) : 0;
        const isSel = selectedIdx === m.index;
        return (
          <div
            key={m.index}
            className="flex-1 flex flex-col justify-end items-stretch"
            title={`${m.label}: ${formatMoney(m.spent)} spent${
              m.pipeline > 0 ? ` · ${formatMoney(m.pipeline)} in pipeline` : ""
            }`}
          >
            <div
              className={`rounded-sm bg-muted overflow-hidden flex flex-col justify-end ${
                isSel ? "ring-1 ring-primary" : ""
              }`}
              style={{ height: `${h}px` }}
            >
              <div className="bg-amber-400/70" style={{ height: `${h - spentH}px` }} />
              <div className="bg-emerald-500" style={{ height: `${spentH}px` }} />
            </div>
            <span
              className={`text-[7px] text-center mt-0.5 leading-none ${
                isSel ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              {m.label[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CostCenterCard({
  row,
  monthIdx,
}: {
  row: CostCenterRollup;
  monthIdx: number | null;
}) {
  const [open, setOpen] = useState(false);
  // In month mode, show that fiscal month's figures; otherwise the annual roll-up.
  const m = monthIdx != null ? monthFor(row, monthIdx) : null;
  const budget = m ? m.budget : row.budget;
  const spent = m ? m.spent : row.spent;
  const pipeline = m ? m.pipeline : row.pending;
  const remaining = m ? m.remaining : row.remaining;
  const percentUsed = m ? m.percentUsed : row.percentUsed;
  const hasBudget = budget > 0;
  const over = remaining < 0;
  const pct = Math.min(percentUsed, 100);
  const barColor =
    percentUsed > 100 ? "bg-red-500" : percentUsed > 90 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">
            {shortCcLabel(row.label)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.cost_ctr || "Unassigned"}
            {row.category ? ` · ${row.category}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-bold text-sm ${over ? "text-red-600" : ""}`}>
            {hasBudget ? formatMoney(remaining) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {hasBudget ? (over ? "over budget" : "left") : "no budget set"}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>
            {formatMoney(spent)}
            {hasBudget && <> of {formatMoney(budget)}</>}
          </span>
          {hasBudget && <span>{percentUsed}%</span>}
        </div>
        {hasBudget && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {pipeline > 0 && (
        <p className="text-[11px] text-amber-600 mt-1.5">
          + {formatMoney(pipeline)} in pipeline
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Monthly
      </button>
      {open && <MonthlyBars row={row} selectedIdx={monthIdx} />}
    </div>
  );
}

// ── Audited-PR row (with inline lifecycle + delete) ───────────────────────────

function AuditRow({
  audit,
  busy,
  onAdvance,
  onRevert,
  onDelete,
  onOpen,
  onPreview,
  onDownload,
}: {
  audit: PrAudit;
  busy: boolean;
  onAdvance: () => void;
  onRevert: () => void;
  onDelete: () => void;
  onOpen?: () => void;
  onPreview?: () => void;
  onDownload?: () => void;
}) {
  const meta = REVIEW_META[audit.review_status] ?? REVIEW_META.pending;
  const StageIcon = STAGE_ICON[audit.review_status] ?? STAGE_ICON.pending;
  const bundle = bundleIssueCounts(audit.bundle_findings ?? []);
  const clean =
    audit.audit_error_count === 0 &&
    audit.audit_warning_count === 0 &&
    bundle.errors === 0 &&
    bundle.warnings === 0;
  // Once sent up (or beyond), the reviewer accepted any flags — show it clean.
  const accepted = flagsAccepted(audit.review_status);
  const next = nextStatus(audit.review_status);
  const prev = prevStatus(audit.review_status);

  return (
    <li className="flex items-stretch gap-2 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors">
      <Link
        href={`/pr-audit/view?id=${audit.id}`}
        onClick={onOpen}
        className="flex items-center gap-3 p-3 flex-1 min-w-0 active:scale-[0.99]"
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.badge}`}
        >
          <StageIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {audit.review_status === "pending" && !audit.viewed_at && (
              <span
                className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-full px-1.5 py-0.5"
                title="Not looked at yet"
                aria-label="Not looked at yet"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                New
              </span>
            )}
            <p className="font-semibold text-sm truncate">{audit.vendor_name || "Vendor TBD"}</p>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.badge}`}
            >
              {meta.short}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {formatDate(audit.pr_date)} · {formatMoney(audit.computed_total)}
            {audit.requestor_name ? ` · ${audit.requestor_name}` : ""}
          </p>
          <p className="text-[11px] mt-0.5">
            {accepted ? (
              <span className="text-muted-foreground">
                {clean ? "Passed all checks" : "Flags accepted"}
              </span>
            ) : (
              <>
                {clean ? (
                  <span className="text-emerald-600">Passed all checks</span>
                ) : (
                  <span className="text-muted-foreground">
                    {audit.audit_error_count > 0 && (
                      <span className="text-red-600 font-medium">
                        {audit.audit_error_count} error{audit.audit_error_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {audit.audit_error_count > 0 && audit.audit_warning_count > 0 && " · "}
                    {audit.audit_warning_count > 0 && (
                      <span className="text-amber-600 font-medium">
                        {audit.audit_warning_count} warning{audit.audit_warning_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {bundle.errors + bundle.warnings > 0 && (
                      <span className="text-amber-600 font-medium">
                        {audit.audit_error_count > 0 || audit.audit_warning_count > 0 ? " · " : ""}
                        quote/889 {bundle.errors + bundle.warnings} issue
                        {bundle.errors + bundle.warnings !== 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                )}
                {audit.fit_suggestion_count > 0 && (
                  <span className="text-violet-600 font-medium">
                    {" · "}
                    {audit.fit_suggestion_count} cost-center tip
                    {audit.fit_suggestion_count !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
      </Link>
      {prev && (
        <button
          type="button"
          aria-label={`Back to ${REVIEW_META[prev].short}`}
          title={`Back to ${REVIEW_META[prev].short}`}
          disabled={busy}
          onClick={onRevert}
          className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <Undo2 className="w-4 h-4" />
        </button>
      )}
      {next && (
        <button
          type="button"
          aria-label={`Advance to ${REVIEW_META[next].short}`}
          title={`Advance to ${REVIEW_META[next].short}`}
          disabled={busy}
          onClick={onAdvance}
          className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
      {onPreview && (
        <button
          type="button"
          aria-label="Preview PR"
          title="Preview the PR document"
          onClick={onPreview}
          className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-primary/10 hover:text-primary active:scale-[0.97] transition-all"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          aria-label="Download to sign"
          title="Download this PR to sign"
          onClick={onDownload}
          className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 active:scale-[0.97] transition-all"
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        disabled={busy}
        onClick={onDelete}
        className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-600 active:scale-[0.97] transition-all disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrAuditPage() {
  const { profile, loading: authLoading } = useAuth();
  const codes = usePrCodes();
  const [audits, setAudits] = useState<PrAudit[]>([]);
  const [budgets, setBudgets] = useState<CostCenterBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(() => currentFederalFiscalYear());
  const [category, setCategory] = useState<string | null>(null);
  // Default to the month view, on the current fiscal month.
  const [monthIdx, setMonthIdx] = useState<number | null>(() =>
    fiscalMonthIndex(new Date()),
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  // Single-PR download (per-row button): the PR awaiting checklist confirm.
  const [rowDownload, setRowDownload] = useState<PrAudit | null>(null);
  const [rowDownloading, setRowDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [auditData, budgetData] = await Promise.all([
        directSelectList<PrAudit>("pr_audits", {
          columns: "*",
          orderBy: [{ column: "pr_date", ascending: false }],
          limit: 500,
          label: "pr-audit.fetchAudits",
        }),
        directSelectList<CostCenterBudget>("cost_center_budgets", {
          columns: "*",
          limit: 400,
          label: "pr-audit.fetchBudgets",
        }),
      ]);
      setAudits(auditData);
      setBudgets(budgetData);
    } catch (err) {
      console.error("[pr-audit] fetch failed:", err);
      setAudits([]);
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    fetchData();
  }, [isAllowed, fetchData]);

  useRefreshOnFocus(fetchData, isAllowed);

  // Remember where the list was scrolled when opening a PR, and restore it on
  // return so the reviewer doesn't have to scroll back down each time.
  const saveScroll = useCallback(() => {
    try {
      sessionStorage.setItem("pr-audit-scroll", String(window.scrollY));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("pr-audit-scroll");
    } catch {
      /* ignore */
    }
    if (raw == null) return;
    try {
      sessionStorage.removeItem("pr-audit-scroll");
    } catch {
      /* ignore */
    }
    const y = parseInt(raw, 10);
    if (Number.isFinite(y) && y > 0) {
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading]);

  // Category list for the switch.
  const categoryNames = useMemo(() => {
    if (codes.categories.length > 0) return codes.categories.map((c) => c.name);
    const set = new Set<string>();
    for (const cc of codes.costCenters) if (cc.category) set.add(cc.category);
    return Array.from(set);
  }, [codes.categories, codes.costCenters]);

  // Does an audit touch the selected category (via its line cost centers)?
  const auditInCategory = useCallback(
    (a: PrAudit, cat: string): boolean =>
      (a.items ?? []).some(
        (it) => codes.categoryNameForCostCenter((it.cost_ctr ?? "").trim()) === cat,
      ),
    [codes],
  );

  const rollupAll = useMemo(
    () => buildCostCenterRollup(audits, budgets, fiscalYear, codes.rollupCostCenters),
    [audits, budgets, fiscalYear, codes.rollupCostCenters],
  );
  const rollup = useMemo(
    () => (category ? rollupAll.filter((r) => r.category === category) : rollupAll),
    [rollupAll, category],
  );
  const totals = useMemo(() => {
    if (monthIdx != null) {
      const t = rollupMonthTotals(rollup, monthIdx);
      return {
        budget: t.budget,
        spent: t.spent,
        pipeline: t.pipeline,
        remaining: t.remaining,
        percentUsed: t.percentUsed,
      };
    }
    const t = rollupTotals(rollup);
    return {
      budget: t.budget,
      spent: t.spent,
      pipeline: t.pending,
      remaining: t.remaining,
      percentUsed: t.percentUsed,
    };
  }, [rollup, monthIdx]);

  const filteredAudits = useMemo(
    () => (category ? audits.filter((a) => auditInCategory(a, category)) : audits),
    [audits, category, auditInCategory],
  );
  // In month view, the list shows only that month's purchases — bucketed by the
  // same effective date the budget uses (ordered date once purchased, else the
  // PR date), so the list always matches the figures above it.
  const visibleAudits = useMemo(
    () =>
      monthIdx == null
        ? filteredAudits
        : filteredAudits.filter((a) => auditInFiscalMonth(a, fiscalYear, monthIdx)),
    [filteredAudits, monthIdx, fiscalYear],
  );
  const monthGroups = useMemo(() => groupAuditsByMonth(visibleAudits), [visibleAudits]);
  // The new-PR banner counts across ALL months (category-filtered), so a fresh
  // upload dated outside the selected month still gets flagged.
  const notLookedAtCount = useMemo(
    () =>
      filteredAudits.filter((a) => a.review_status === "pending" && !a.viewed_at)
        .length,
    [filteredAudits],
  );

  // Bulk-downloadable = active PRs in view (everything except sent-back).
  const downloadable = useMemo(
    () => visibleAudits.filter((a) => a.review_status !== "sent_back"),
    [visibleAudits],
  );

  const currentFy = currentFederalFiscalYear();
  const currentMonthIdx = fiscalMonthIndex(new Date());

  // ── Row actions ─────────────────────────────────────────────────────────────

  const changeStatus = useCallback(
    async (audit: PrAudit, status: PrAuditReviewStatus) => {
      setBusyId(audit.id);
      try {
        const patch = {
          review_status: status,
          ...stageDatePatch(audit, status, todayIso()),
        };
        await directPatchRow("pr_audits", "id", audit.id, patch, "pr-audit.list.status");
        setAudits((prev) => prev.map((a) => (a.id === audit.id ? { ...a, ...patch } : a)));
        // Bridge to My Day: received -> 24h paperwork task; receipt_signed -> done.
        void syncPrReceivedTask(audit, status);
      } catch (err) {
        alert(`Couldn't update status: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const deleteAudit = useCallback(async (audit: PrAudit) => {
    if (
      !confirm(
        `Delete the PR from ${audit.vendor_name || "Vendor TBD"} (${formatDate(
          audit.pr_date,
        )})? This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(audit.id);
    try {
      await directDeleteRow("pr_audits", "id", audit.id, "pr-audit.list.delete");
      if (audit.file_path) {
        try {
          await directStorageDelete("vendor-files", [audit.file_path], "pr-audit.list.deleteFile");
        } catch {
          /* non-fatal */
        }
      }
      setAudits((prev) => prev.filter((a) => a.id !== audit.id));
    } catch (err) {
      alert(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  const confirmBulkDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadMsg(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await downloadBundle(downloadable, today);
      setDownloadOpen(false);
      if (res.count === 0) {
        setDownloadMsg(res.warnings[0] || "Nothing to download.");
      } else {
        setDownloadMsg(
          `Downloaded ${res.count} PR${res.count !== 1 ? "s" : ""}.` +
            (res.warnings.length ? ` ${res.warnings.length} couldn't be included.` : ""),
        );
      }
    } catch (err) {
      setDownloadMsg(err instanceof Error ? err.message : "Couldn't build the download.");
    } finally {
      setDownloading(false);
    }
  }, [downloadable]);

  const confirmRowDownload = useCallback(async () => {
    if (!rowDownload) return;
    setRowDownloading(true);
    setDownloadMsg(null);
    try {
      await downloadOriginalFile(rowDownload);
    } catch (err) {
      setDownloadMsg(err instanceof Error ? err.message : "Couldn't download the file.");
    } finally {
      setRowDownloading(false);
      setRowDownload(null);
    }
  }, [rowDownload]);

  // One-time import of built PRs (purchase_requests) into the audit. Idempotent:
  // already-linked PRs are skipped, so it never double-counts in the budget.
  const runImport = useCallback(async () => {
    if (
      !confirm(
        "Import your submitted / sent / approved / received Purchase Requests into the audit? Already-imported ones are skipped.",
      )
    ) {
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const [prs, vendors] = await Promise.all([
        directSelectList<PurchaseRequest>("purchase_requests", {
          columns: "*",
          filters: ["status=in.(submitted,sent,approved,received)"],
          limit: 1000,
          label: "pr-audit.import.prs",
        }),
        directSelectList<{ id: string } & Vendor889>("vendors", {
          columns: "id,section_889_path,section_889_filename,section_889_expiration_date",
          limit: 1000,
          label: "pr-audit.import.vendors",
        }),
      ]);
      const vendorById = new Map(vendors.map((v) => [v.id, v]));
      const already = new Set(
        audits.map((a) => a.purchase_request_id).filter((x): x is string => !!x),
      );
      const today = todayIso();
      const userId = getCachedUserId();
      let imported = 0;
      const failures: string[] = [];
      for (const pr of prs) {
        if (already.has(pr.id)) continue;
        try {
          const vendor = pr.vendor_id ? vendorById.get(pr.vendor_id) ?? null : null;
          const payload = purchaseRequestToAuditPayload(pr, vendor, today, codes.validCodes);
          await directInsertRow(
            "pr_audits",
            { ...payload, created_by: userId },
            "pr-audit.import.insert",
          );
          imported++;
        } catch (err) {
          failures.push(
            `${pr.vendor1_name || "A PR"}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      await fetchData();
      const firstErr = failures[0] ?? "";
      // A missing-column error means the PR-audit migrations aren't applied yet.
      const migrationMissing =
        /could not find the .*column|schema cache|pgrst204|does not exist/i.test(firstErr);
      setImportMsg(
        imported === 0 && failures.length === 0
          ? "Nothing new — all your built PRs are already imported."
          : migrationMissing
            ? "None imported — the PR-audit database migrations aren't applied yet. Paste 20260609_pr_audit_bundle.sql and 20260609_pr_audit_link.sql into the Supabase SQL editor, then try again."
            : `Imported ${imported} PR${imported !== 1 ? "s" : ""}.` +
                (failures.length
                  ? ` ${failures.length} couldn't be imported — first error: ${firstErr}`
                  : ""),
      );
    } catch (err) {
      setImportMsg(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [audits, codes.validCodes, fetchData]);

  const openPreview = useCallback(
    async (a: PrAudit) => {
      if (previewLoading) return;
      setPreviewLoading(true);
      try {
        setPreview(await getAuditPreviewBlob(a));
      } catch (err) {
        alert(`Couldn't open the preview: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setPreviewLoading(false);
      }
    },
    [previewLoading],
  );

  const renderRow = (audit: PrAudit) => (
    <AuditRow
      key={audit.id}
      audit={audit}
      busy={busyId === audit.id}
      onAdvance={() => {
        const n = nextStatus(audit.review_status);
        if (n) changeStatus(audit, n);
      }}
      onRevert={() => {
        const p = prevStatus(audit.review_status);
        if (p) changeStatus(audit, p);
      }}
      onDelete={() => deleteAudit(audit)}
      onOpen={saveScroll}
      onPreview={() => openPreview(audit)}
      onDownload={
        audit.review_status !== "sent_back" ? () => setRowDownload(audit) : undefined
      }
    />
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (authLoading) {
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
          <Link href="/more" className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">PR Audit</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, directors, and GMs can audit purchase
            requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link href="/more" className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">PR Audit</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Upload team PRs · auto-audit · budget by cost center
          </p>
        </div>
        <Link
          href="/pr-audit/codes"
          aria-label="Manage lists"
          title="Manage cost centers, G/L, categories"
          className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </Link>
        <Link
          href="/pr-audit/budget"
          aria-label="Edit budgets"
          title="Edit budgets"
          className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>

      <Link
        href="/pr-audit/new"
        className="mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
      >
        <Upload className="w-5 h-5" /> Upload &amp; Audit PRs
      </Link>

      <button
        type="button"
        onClick={runImport}
        disabled={importing}
        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card font-medium text-sm hover:bg-muted/40 transition-colors disabled:opacity-60"
      >
        {importing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Import built PRs from the builder
      </button>
      {importMsg && (
        <div className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
          {importMsg}
        </div>
      )}

      {/* Category switch */}
      {categoryNames.length > 0 && (
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              category === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            All
          </button>
          {categoryNames.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                category === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {notLookedAtCount > 0 && (
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
          <Inbox className="w-4 h-4 shrink-0" />
          {notLookedAtCount} PR{notLookedAtCount !== 1 ? "s" : ""} you haven&apos;t looked at yet
        </div>
      )}

      {/* Budget header + FY selector */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Wallet className="w-4 h-4" />
          Budget — {monthIdx != null ? `${FISCAL_MONTH_LABELS[monthIdx]} ` : ""}
          {fiscalYearShort(fiscalYear)}
          {category ? ` · ${category}` : ""}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous fiscal year"
            onClick={() => setFiscalYear((y) => y - 1)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold min-w-[44px] text-center">
            {fiscalYearShort(fiscalYear)}
          </span>
          <button
            type="button"
            aria-label="Next fiscal year"
            disabled={fiscalYear >= currentFy}
            onClick={() => setFiscalYear((y) => Math.min(currentFy, y + 1))}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-0.5 mb-3">{fiscalYearLabel(fiscalYear)}</p>

      {/* Year / Month view toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMonthIdx(null)}
            className={`px-3 py-1 rounded-md transition-colors ${
              monthIdx === null
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Year
          </button>
          <button
            type="button"
            onClick={() => setMonthIdx((m) => (m == null ? currentMonthIdx : m))}
            className={`px-3 py-1 rounded-md transition-colors ${
              monthIdx !== null
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Month
          </button>
        </div>
        {monthIdx !== null && (
          <span className="text-[11px] text-muted-foreground">
            Budget &amp; spend for {FISCAL_MONTH_LABELS[monthIdx]}
          </span>
        )}
      </div>
      {monthIdx !== null && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 mb-3">
          {FISCAL_MONTH_LABELS.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => setMonthIdx(idx)}
              className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                idx === monthIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="text-base font-bold leading-tight mt-0.5">{formatMoneyShort(totals.budget)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Spent</p>
          <p className="text-base font-bold leading-tight mt-0.5">{formatMoneyShort(totals.spent)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Left</p>
          <p
            className={`text-base font-bold leading-tight mt-0.5 ${
              totals.remaining < 0 ? "text-red-600" : ""
            }`}
          >
            {formatMoneyShort(totals.remaining)}
          </p>
        </div>
      </div>
      {totals.pipeline > 0 && (
        <p className="text-[11px] text-amber-600 -mt-2 mb-3">
          + {formatMoney(totals.pipeline)} in pipeline (not yet ordered)
        </p>
      )}

      {totals.budget === 0 && (
        <div className="mb-4 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
          No budget set{category ? ` for ${category}` : ""} in {fiscalYearShort(fiscalYear)} yet.{" "}
          <Link href="/pr-audit/budget" className="text-primary font-medium underline">
            Set annual budgets
          </Link>{" "}
          to track what&apos;s left.
        </div>
      )}

      {/* Cost-center cards */}
      <div className="grid sm:grid-cols-2 gap-2">
        {rollup.map((row) => (
          <CostCenterCard key={row.cost_ctr || "unassigned"} row={row} monthIdx={monthIdx} />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Spent
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-400/70" /> In pipeline
        </span>
      </div>

      {/* Audited PRs */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Audited PRs
            {monthIdx != null ? ` — ${FISCAL_MONTH_LABELS[monthIdx]}` : ""}
          </h2>
          {downloadable.length > 0 && (
            <button
              type="button"
              onClick={() => setDownloadOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download to sign ({downloadable.length})
            </button>
          )}
        </div>

        {downloadMsg && (
          <div className="mb-3 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            {downloadMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : visibleAudits.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Inbox className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">
              {audits.length === 0
                ? "No PRs audited yet"
                : monthIdx != null
                  ? `No PRs purchased in ${FISCAL_MONTH_LABELS[monthIdx]} ${fiscalYearShort(fiscalYear)}`
                  : "Nothing in this category"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {audits.length === 0
                ? "Upload the PRs your team sent you to check them and track their cost."
                : monthIdx != null
                  ? "Try another month, or switch to Year to see everything."
                  : "Try a different category or 'All'."}
            </p>
          </div>
        ) : monthIdx != null ? (
          // Month view — already one month's purchases, so no group headers.
          <ul className="space-y-2">{visibleAudits.map(renderRow)}</ul>
        ) : (
          <div className="space-y-5">
            {monthGroups.map((g) => (
              <div key={g.key}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-2 text-muted-foreground">
                  {g.label} ({g.audits.length})
                </h3>
                <ul className="space-y-2">{g.audits.map(renderRow)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <DownloadChecklist
        open={downloadOpen}
        prTotalText={null}
        count={downloadable.length}
        section889={{
          tone: "muted",
          text: "Confirm each vendor's Section 889 is on file and not expired.",
        }}
        confirming={downloading}
        onConfirm={confirmBulkDownload}
        onCancel={() => setDownloadOpen(false)}
      />

      {/* Single-PR download (per-row button) */}
      <DownloadChecklist
        open={rowDownload !== null}
        prTotalText={rowDownload ? formatMoney(rowDownload.computed_total) : null}
        section889={
          rowDownload
            ? auditSection889Note(rowDownload)
            : { tone: "muted", text: "" }
        }
        confirming={rowDownloading}
        onConfirm={confirmRowDownload}
        onCancel={() => setRowDownload(null)}
      />

      <FilePreviewOverlay source={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
