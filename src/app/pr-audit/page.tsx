"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Settings,
  FileText,
  Inbox,
  Wallet,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import { directSelectList } from "@/lib/supabase/rest";
import type { PrAudit, CostCenterBudget } from "@/types/database";
import {
  buildCostCenterRollup,
  rollupTotals,
  type CostCenterRollup,
} from "@/lib/pr-audit/rollup";
import { downloadApprovedBundle } from "@/lib/pr-audit/download";
import {
  currentFederalFiscalYear,
  fiscalYearShort,
  fiscalYearLabel,
} from "@/lib/pr-audit/fiscal-year";

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

/** Short cost-center label: "25581 — GLK VMGC GC MAINTENANCE" → "GC Maintenance". */
function shortCcLabel(label: string): string {
  const afterDash = label.includes("—") ? label.split("—")[1].trim() : label;
  return afterDash.replace(/^GLK VMGC\s*/i, "").trim() || label;
}

// ── Cost-center budget card ───────────────────────────────────────────────────

function MonthlyBars({ row }: { row: CostCenterRollup }) {
  const max = Math.max(
    1,
    ...row.byMonth.map((m) => m.approved + m.pending),
  );
  return (
    <div className="flex items-end gap-[3px] h-10 mt-2">
      {row.byMonth.map((m) => {
        const total = m.approved + m.pending;
        const h = total > 0 ? Math.max(8, Math.round((total / max) * 40)) : 2;
        const approvedH =
          total > 0 ? Math.round((m.approved / total) * h) : 0;
        return (
          <div
            key={m.index}
            className="flex-1 flex flex-col justify-end items-stretch"
            title={`${m.label}: ${formatMoney(m.approved)} approved${
              m.pending > 0 ? ` · ${formatMoney(m.pending)} pending` : ""
            }`}
          >
            <div
              className="rounded-sm bg-muted overflow-hidden flex flex-col justify-end"
              style={{ height: `${h}px` }}
            >
              <div
                className="bg-amber-400/70"
                style={{ height: `${h - approvedH}px` }}
              />
              <div
                className="bg-emerald-500"
                style={{ height: `${approvedH}px` }}
              />
            </div>
            <span className="text-[7px] text-muted-foreground text-center mt-0.5 leading-none">
              {m.label[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CostCenterCard({ row }: { row: CostCenterRollup }) {
  const [open, setOpen] = useState(false);
  const hasBudget = row.budget > 0;
  const over = row.remaining < 0;
  const pct = Math.min(row.percentUsed, 100);
  const barColor =
    row.percentUsed > 100
      ? "bg-red-500"
      : row.percentUsed > 90
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">
            {shortCcLabel(row.label)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.cost_ctr || "Unassigned"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-bold text-sm ${over ? "text-red-600" : ""}`}>
            {hasBudget ? formatMoney(row.remaining) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {hasBudget ? (over ? "over budget" : "left") : "no budget set"}
          </p>
        </div>
      </div>

      {/* Budget bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>
            {formatMoney(row.spent)}
            {hasBudget && <> of {formatMoney(row.budget)}</>}
          </span>
          {hasBudget && <span>{row.percentUsed}%</span>}
        </div>
        {hasBudget && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {row.pending > 0 && (
        <p className="text-[11px] text-amber-600 mt-1.5">
          + {formatMoney(row.pending)} pending review
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        Monthly
      </button>
      {open && <MonthlyBars row={row} />}
    </div>
  );
}

// ── Audited-PR list row ───────────────────────────────────────────────────────

const REVIEW_META: Record<
  PrAudit["review_status"],
  { label: string; badge: string; icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: ShieldCheck,
  },
  sent_back: {
    label: "Sent Back",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    icon: AlertTriangle,
  },
};

function AuditRow({ audit }: { audit: PrAudit }) {
  const meta = REVIEW_META[audit.review_status] ?? REVIEW_META.pending;
  const clean = audit.audit_error_count === 0 && audit.audit_warning_count === 0;
  return (
    <Link
      href={`/pr-audit/view?id=${audit.id}`}
      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          clean
            ? "bg-emerald-500/10 text-emerald-600"
            : audit.audit_error_count > 0
              ? "bg-red-500/10 text-red-600"
              : "bg-amber-500/10 text-amber-600"
        }`}
      >
        {clean ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <AlertTriangle className="w-5 h-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {!audit.viewed_at && (
            <span
              className="w-2 h-2 rounded-full bg-primary shrink-0"
              title="Not looked at yet"
              aria-label="Not looked at yet"
            />
          )}
          <p className="font-semibold text-sm truncate">
            {audit.vendor_name || "Vendor TBD"}
          </p>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.badge}`}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {formatDate(audit.pr_date)} · {formatMoney(audit.computed_total)}
          {audit.requestor_name ? ` · ${audit.requestor_name}` : ""}
        </p>
        <p className="text-[11px] mt-0.5">
          {clean ? (
            <span className="text-emerald-600">Passed all checks</span>
          ) : (
            <span className="text-muted-foreground">
              {audit.audit_error_count > 0 && (
                <span className="text-red-600 font-medium">
                  {audit.audit_error_count} error
                  {audit.audit_error_count !== 1 ? "s" : ""}
                </span>
              )}
              {audit.audit_error_count > 0 &&
                audit.audit_warning_count > 0 &&
                " · "}
              {audit.audit_warning_count > 0 && (
                <span className="text-amber-600 font-medium">
                  {audit.audit_warning_count} warning
                  {audit.audit_warning_count !== 1 ? "s" : ""}
                </span>
              )}
            </span>
          )}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrAuditPage() {
  const { profile, loading: authLoading } = useAuth();
  const [audits, setAudits] = useState<PrAudit[]>([]);
  const [budgets, setBudgets] = useState<CostCenterBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(() => currentFederalFiscalYear());

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
          limit: 200,
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

  const rollup = useMemo(
    () => buildCostCenterRollup(audits, budgets, fiscalYear),
    [audits, budgets, fiscalYear],
  );
  const totals = useMemo(() => rollupTotals(rollup), [rollup]);

  const notLookedAt = useMemo(
    () => audits.filter((a) => !a.viewed_at),
    [audits],
  );
  const lookedAt = useMemo(
    () => audits.filter((a) => !!a.viewed_at),
    [audits],
  );
  const approvedCount = useMemo(
    () => audits.filter((a) => a.review_status === "approved").length,
    [audits],
  );

  const [downloadingApproved, setDownloadingApproved] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  const handleDownloadApproved = useCallback(async () => {
    setDownloadingApproved(true);
    setDownloadMsg(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await downloadApprovedBundle(audits, today);
      if (res.count === 0) {
        setDownloadMsg(res.warnings[0] || "No approved PRs to download.");
      } else {
        setDownloadMsg(
          `Downloaded ${res.count} approved PR${res.count !== 1 ? "s" : ""}.` +
            (res.warnings.length
              ? ` ${res.warnings.length} couldn't be included.`
              : ""),
        );
      }
    } catch (err) {
      setDownloadMsg(
        err instanceof Error ? err.message : "Couldn't build the download.",
      );
    } finally {
      setDownloadingApproved(false);
    }
  }, [audits]);

  const currentFy = currentFederalFiscalYear();

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
          <Link
            href="/more"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">PR Audit</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, directors, and GMs
            can audit purchase requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/more"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">PR Audit</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Upload team PRs · auto-audit · budget by cost center
          </p>
        </div>
        <Link
          href="/pr-audit/budget"
          aria-label="Edit budgets"
          title="Edit budgets"
          className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>

      {/* Upload CTA */}
      <Link
        href="/pr-audit/new"
        className="mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
      >
        <Upload className="w-5 h-5" /> Upload &amp; Audit a PR
      </Link>

      {notLookedAt.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
          <Inbox className="w-4 h-4 shrink-0" />
          {notLookedAt.length} PR{notLookedAt.length !== 1 ? "s" : ""} you
          haven&apos;t looked at yet
        </div>
      )}

      {/* FY selector + totals */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Wallet className="w-4 h-4" />
          Budget — {fiscalYearShort(fiscalYear)}
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
      <p className="text-[11px] text-muted-foreground -mt-0.5 mb-3">
        {fiscalYearLabel(fiscalYear)}
      </p>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Budget
          </p>
          <p className="text-base font-bold leading-tight mt-0.5">
            {formatMoneyShort(totals.budget)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
            Spent
          </p>
          <p className="text-base font-bold leading-tight mt-0.5">
            {formatMoneyShort(totals.spent)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            Left
          </p>
          <p
            className={`text-base font-bold leading-tight mt-0.5 ${
              totals.remaining < 0 ? "text-red-600" : ""
            }`}
          >
            {formatMoneyShort(totals.remaining)}
          </p>
        </div>
      </div>

      {totals.budget === 0 && (
        <div className="mb-4 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
          No budget set for {fiscalYearShort(fiscalYear)} yet.{" "}
          <Link href="/pr-audit/budget" className="text-primary font-medium underline">
            Set annual budgets
          </Link>{" "}
          to track what&apos;s left in each account.
        </div>
      )}

      {/* Cost-center cards */}
      <div className="grid sm:grid-cols-2 gap-2">
        {rollup.map((row) => (
          <CostCenterCard key={row.cost_ctr || "unassigned"} row={row} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Approved
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-400/70" /> Pending
        </span>
      </div>

      {/* Audited PRs */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Audited PRs
          </h2>
          {approvedCount > 0 && (
            <button
              type="button"
              onClick={handleDownloadApproved}
              disabled={downloadingApproved}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-60"
            >
              {downloadingApproved ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download approved ({approvedCount})
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
        ) : audits.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Inbox className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">No PRs audited yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload the PRs your team sent you to check them and track their cost.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {notLookedAt.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Not looked at ({notLookedAt.length})
                </h3>
                <ul className="space-y-2">
                  {notLookedAt.map((audit) => (
                    <li key={audit.id}>
                      <AuditRow audit={audit} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lookedAt.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Looked at ({lookedAt.length})
                </h3>
                <ul className="space-y-2">
                  {lookedAt.map((audit) => (
                    <li key={audit.id}>
                      <AuditRow audit={audit} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
