"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Plus,
  FileText,
  Calendar,
  Download,
  ChevronRight,
  ShieldAlert,
  Copy,
  Trash2,
  PackageCheck,
  CheckCircle2,
  Send,
  ShieldCheck,
  FileSignature,
  ChevronDown,
  ChevronUp,
  Clock,
  Building2,
  X,
  Undo2,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import {
  directDeleteRow,
  directPatchRow,
  directSelectList,
} from "@/lib/supabase/rest";
import type { PurchaseRequest } from "@/types/database";
import { PrStageTracker } from "@/components/features/purchase-requests/pr-stage-tracker";
import {
  prVariance,
  formatVariance,
  prNeedsReceipt,
  prIsComplete,
  prSubmittedTotal,
  VARIANCE_BADGE_CLASSES,
} from "@/lib/pr-reconciliation";

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
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

function getMonthKey(iso: string): string {
  // Returns "YYYY-MM" from a date string
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(anchored);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

// ── PR lifecycle ─────────────────────────────────────────────────────────────

type PrStatus = PurchaseRequest["status"];

interface StatusMeta {
  label: string;
  iconBg: string;
  badge: string;
  icon: LucideIcon;
  next: PrStatus | null;
  nextLabel: string | null;
  nextIcon: LucideIcon | null;
  nextHover: string | null;
  /** Previous status — allows reverting if a PR was rejected or marked too early. */
  prev: PrStatus | null;
  prevLabel: string | null;
}

const STATUS_FLOW: Record<PrStatus, StatusMeta> = {
  draft: {
    label: "Draft",
    iconBg: "bg-muted text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
    icon: FileText,
    next: null,
    nextLabel: null,
    nextIcon: null,
    nextHover: null,
    prev: null,
    prevLabel: null,
  },
  submitted: {
    label: "Not Sent",
    iconBg: "bg-amber-500/10 text-amber-600",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: FileText,
    next: "sent",
    nextLabel: "Sent for Approval",
    nextIcon: Send,
    nextHover: "hover:bg-blue-500/10 hover:text-blue-600",
    prev: null,
    prevLabel: null,
  },
  sent: {
    label: "Sent for Approval",
    iconBg: "bg-blue-500/10 text-blue-600",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    icon: Send,
    next: "approved",
    nextLabel: "Approved",
    nextIcon: ShieldCheck,
    nextHover: "hover:bg-emerald-500/10 hover:text-emerald-600",
    prev: "submitted",
    prevLabel: "Not Sent",
  },
  approved: {
    label: "Approved",
    iconBg: "bg-emerald-500/10 text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: ShieldCheck,
    next: "received",
    nextLabel: "Received & Signed",
    nextIcon: PackageCheck,
    nextHover: "hover:bg-green-500/10 hover:text-green-600",
    prev: "sent",
    prevLabel: "Sent for Approval",
  },
  received: {
    label: "Received & Signed",
    iconBg: "bg-green-600/10 text-green-700 dark:text-green-400",
    badge: "bg-green-600/10 text-green-700 dark:text-green-400",
    icon: CheckCircle2,
    next: null,
    nextLabel: null,
    nextIcon: null,
    nextHover: null,
    prev: "approved",
    prevLabel: "Approved",
  },
};

// ── Money summary helpers ─────────────────────────────────────────────────────

function sumAmount(prs: PurchaseRequest[]): number {
  return prs.reduce((acc, pr) => acc + (Number(pr.ige_amount) || 0), 0);
}

// ── Money Stats Card ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  amount: number;
  count: number;
  icon: LucideIcon;
  colorClass: string; // text + border accent color
  bgClass: string;
}

function StatCard({ label, amount, count, icon: Icon, colorClass, bgClass }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-border bg-card p-3 flex flex-col gap-1 ${bgClass}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
          {label}
        </span>
      </div>
      <p className="text-lg font-bold leading-tight">{formatMoney(amount)}</p>
      <p className="text-[11px] text-muted-foreground">{count} request{count !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Monthly Spending Section ──────────────────────────────────────────────────

interface MonthGroup {
  key: string;       // "YYYY-MM"
  label: string;     // "May 2026"
  total: number;
  prs: PurchaseRequest[];
  byVendor: Record<string, { total: number; prs: PurchaseRequest[] }>;
}

function buildMonthGroups(
  prs: PurchaseRequest[],
  vendorFilter: string | null,
): MonthGroup[] {
  const filtered = vendorFilter
    ? prs.filter((pr) => (pr.vendor1_name || "Unknown") === vendorFilter)
    : prs;

  const map: Record<string, MonthGroup> = {};
  for (const pr of filtered) {
    const key = getMonthKey(pr.date_prepared);
    if (!map[key]) {
      map[key] = { key, label: formatMonthLabel(key), total: 0, prs: [], byVendor: {} };
    }
    const amt = Number(pr.ige_amount) || 0;
    map[key].total += amt;
    map[key].prs.push(pr);

    const vendor = pr.vendor1_name || "Unknown Vendor";
    if (!map[key].byVendor[vendor]) {
      map[key].byVendor[vendor] = { total: 0, prs: [] };
    }
    map[key].byVendor[vendor].total += amt;
    map[key].byVendor[vendor].prs.push(pr);
  }

  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function MonthRow({
  group,
  isCurrentMonth,
  showVendors,
}: {
  group: MonthGroup;
  isCurrentMonth: boolean;
  showVendors: boolean;
}) {
  const [expanded, setExpanded] = useState(isCurrentMonth);
  const vendors = Object.entries(group.byVendor).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCurrentMonth ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{group.label}</span>
            {isCurrentMonth && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                Current
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {group.prs.length} request{group.prs.length !== 1 ? "s" : ""}
            {!showVendors && vendors.length > 1 && ` · ${vendors.length} vendors`}
          </p>
        </div>
        <span className="font-bold text-sm shrink-0">{formatMoney(group.total)}</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border">
          {showVendors ? (
            // Per-vendor breakdown
            <div className="divide-y divide-border">
              {vendors.map(([vendor, data]) => (
                <div key={vendor} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{vendor}</span>
                        <span className="text-sm font-semibold shrink-0">{formatMoney(data.total)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {data.prs.length} request{data.prs.length !== 1 ? "s" : ""}
                        {data.prs.map((pr) => (
                          <span key={pr.id}>
                            {" "}· {formatDate(pr.date_prepared)} ({STATUS_FLOW[pr.status]?.label ?? pr.status})
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // PR list
            <div className="divide-y divide-border">
              {group.prs
                .slice()
                .sort((a, b) => b.date_prepared.localeCompare(a.date_prepared))
                .map((pr) => {
                  const meta = STATUS_FLOW[pr.status] ?? STATUS_FLOW.submitted;
                  return (
                    <Link
                      key={pr.id}
                      href={`/purchase-requests/view?id=${pr.id}`}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm text-muted-foreground truncate flex-1">
                        {pr.vendor1_name || "Vendor TBD"} · {formatDate(pr.date_prepared)}
                      </span>
                      <span className="text-sm font-medium shrink-0">{formatMoney(Number(pr.ige_amount) || 0)}</span>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PurchaseRequestsListPage() {
  const { profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [listView, setListView] = useState<"open" | "completed">("open");
  const [showVendors, setShowVendors] = useState(false);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // True while a status change / delete is committing. Native confirm() dialogs
  // blur then re-focus the window, which fires useRefreshOnFocus mid-action — we
  // skip that refetch so a stale read can't clobber the optimistic update (which
  // made the reviewer click "advance" two or three times before it stuck).
  const mutatingRef = useRef(false);

  const fetchRequests = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    // Background refreshes (tab re-focus) keep the current list on screen so the
    // page doesn't collapse to skeletons and lose the reviewer's scroll spot.
    if (!background) setLoading(true);
    try {
      const data = await directSelectList<PurchaseRequest>("purchase_requests", {
        columns: "*",
        orderBy: [{ column: "date_prepared", ascending: false }],
        limit: 200,
        label: "purchase-requests.fetchList",
      });
      setRequests(data);
    } catch (err) {
      console.error("[purchase-requests] fetch failed:", err);
      if (!background) setRequests([]);
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    fetchRequests();
  }, [isAllowed, fetchRequests]);

  const refreshOnFocus = useCallback(() => {
    if (mutatingRef.current) return;
    void fetchRequests({ background: true });
  }, [fetchRequests]);

  useRefreshOnFocus(refreshOnFocus, isAllowed);

  // ── Money stats ─────────────────────────────────────────────────────────────
  //
  // NOTE: these cover every non-draft PR, completed ones INCLUDED. A completed
  // purchase is still money that was spent — the Active/Completed split below
  // is a working-list filter, never a money filter.

  const activePrs = useMemo(
    () => requests.filter((r) => r.status !== "draft"),
    [requests],
  );

  const pendingPrs = useMemo(
    () => activePrs.filter((r) => r.status === "submitted" || r.status === "sent"),
    [activePrs],
  );
  const approvedPrs = useMemo(
    () => activePrs.filter((r) => r.status === "approved" || r.status === "received"),
    [activePrs],
  );
  const receivedPrs = useMemo(
    () => activePrs.filter((r) => r.status === "received"),
    [activePrs],
  );

  // ── Open vs completed (the History list's working split) ────────────────────
  // Open = anything still needing action, drafts included. Completed = the
  // receipt is in and settled, filed away so the list shows what's left.

  const openRequests = useMemo(
    () => requests.filter((r) => !prIsComplete(r)),
    [requests],
  );
  const completedRequests = useMemo(
    () => requests.filter((r) => prIsComplete(r)),
    [requests],
  );
  const listRequests = listView === "open" ? openRequests : completedRequests;

  // ── Vendor list for filter ──────────────────────────────────────────────────

  const vendors = useMemo(() => {
    const names = new Set<string>();
    for (const pr of requests) {
      if (pr.vendor1_name) names.add(pr.vendor1_name);
    }
    return Array.from(names).sort();
  }, [requests]);

  // ── Monthly groups ──────────────────────────────────────────────────────────

  const currentMonthKey = getMonthKey(new Date().toISOString().slice(0, 10));
  const monthGroups = useMemo(
    () => buildMonthGroups(activePrs, vendorFilter),
    [activePrs, vendorFilter],
  );

  // ── PR list actions ─────────────────────────────────────────────────────────

  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const handleAdvanceStatus = useCallback(
    async (
      id: string,
      label: string,
      next: PrStatus,
      nextLabel: string,
      column: "status" | "sow_status",
      kind: "PR" | "SOW",
    ) => {
      if (
        !confirm(
          `Mark the ${kind} for "${label}" as "${nextLabel}"?\n\nYou can still view and re-download the bundle afterward.`,
        )
      ) {
        return;
      }
      // Set before the first await so the confirm-dismiss focus refetch is skipped.
      mutatingRef.current = true;
      setAdvancingId(`${id}:${column}`);
      try {
        await directPatchRow(
          "purchase_requests",
          "id",
          id,
          { [column]: next },
          `purchase-requests.advance.${column}`,
        );
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, [column]: next } : r)),
        );
      } catch (err) {
        alert(
          `Couldn't update status: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setAdvancingId(null);
        mutatingRef.current = false;
      }
    },
    [],
  );

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = useCallback(
    async (id: string, label: string) => {
      if (!confirm(`Delete the purchase request for ${label}? This can't be undone.`)) {
        return;
      }
      // Set before the first await so the confirm-dismiss focus refetch is skipped.
      mutatingRef.current = true;
      setDeletingId(id);
      try {
        await directDeleteRow(
          "purchase_requests",
          "id",
          id,
          "purchase-requests.delete",
        );
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        alert(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setDeletingId(null);
        mutatingRef.current = false;
      }
    },
    [],
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
          <Link
            href="/more"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Purchase Requests</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, directors, and GMs
            can manage purchase requests.
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
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">Purchase Requests</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            NAVMIDLANT NAF FY2025
          </p>
        </div>
      </div>

      <Link
        href="/purchase-requests/new"
        className="mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
      >
        <Plus className="w-5 h-5" /> New Purchase Request
      </Link>

      {/* ── Money Summary ─────────────────────────────────────────────────── */}
      {!loading && activePrs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Money Tracker
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Pending"
              amount={sumAmount(pendingPrs)}
              count={pendingPrs.length}
              icon={Clock}
              colorClass="text-amber-600"
              bgClass=""
            />
            <StatCard
              label="Approved"
              amount={sumAmount(approvedPrs)}
              count={approvedPrs.length}
              icon={ShieldCheck}
              colorClass="text-emerald-600"
              bgClass=""
            />
            <StatCard
              label="Received"
              amount={sumAmount(receivedPrs)}
              count={receivedPrs.length}
              icon={PackageCheck}
              colorClass="text-green-700 dark:text-green-400"
              bgClass=""
            />
          </div>
        </div>
      )}

      {/* ── Monthly Spending ──────────────────────────────────────────────── */}
      {!loading && activePrs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Spending by Month
            </h2>
            <div className="flex items-center gap-2">
              {/* Vendor filter */}
              {vendors.length > 0 && (
                <div className="relative">
                  {vendorFilter ? (
                    <button
                      type="button"
                      onClick={() => setVendorFilter(null)}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20"
                    >
                      <Building2 className="w-3 h-3" />
                      <span className="max-w-[100px] truncate">{vendorFilter}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => setVendorFilter(e.target.value || null)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-muted text-muted-foreground border border-border appearance-none cursor-pointer pr-5"
                    >
                      <option value="">All Vendors</option>
                      {vendors.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {/* Per-vendor toggle */}
              <button
                type="button"
                onClick={() => setShowVendors((v) => !v)}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                  showVendors
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                <Building2 className="w-3 h-3" />
                By Vendor
              </button>
            </div>
          </div>

          {monthGroups.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              No data for selected filter.
            </div>
          ) : (
            <div className="space-y-2">
              {monthGroups.map((group) => (
                <MonthRow
                  key={group.key}
                  group={group}
                  isCurrentMonth={group.key === currentMonthKey}
                  showVendors={showVendors}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PR List ──────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {listView === "open" ? "Needs Action" : "Completed Purchases"}
          </h2>
          {/* Working-list split: Active = still needs something from you;
              Completed = receipt in and settled. Money stats above cover both. */}
          <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
            {(["open", "completed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setListView(v)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  listView === v
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "open" ? "Active" : "Completed"}
                <span className="ml-1 opacity-60">
                  {v === "open" ? openRequests.length : completedRequests.length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : listRequests.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            {listView === "completed" ? (
              <>
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium">No completed purchases yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A purchase lands here once its receipt comes in at or under the
                  submitted total.
                </p>
              </>
            ) : requests.length === 0 ? (
              <>
                <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium">No purchase requests yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tap the button above to create your first one.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-success opacity-60" />
                <p className="text-sm font-medium">Nothing needs action</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Every purchase request is settled. Nice.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {listRequests.map((pr) => {
              const meta = STATUS_FLOW[pr.status] ?? STATUS_FLOW.submitted;
              const StatusIcon = meta.icon;
              const NextIcon = meta.nextIcon;
              const showDownloadHint =
                pr.status !== "draft" && pr.status !== "received";
              const label = `${pr.vendor1_name || "this PR"} (${formatDate(pr.date_prepared)})`;
              const sowMeta =
                pr.attached_sow && pr.sow_status
                  ? STATUS_FLOW[pr.sow_status] ?? STATUS_FLOW.submitted
                  : null;
              const SowNextIcon = sowMeta?.nextIcon ?? null;
              // Reconciliation: variance once the receipt's actual cost is
              // recorded; "needs receipt" while a received PR still lacks it.
              const variance =
                pr.actual_amount != null
                  ? prVariance(
                      // Same source as the detail card — never two variances.
                      prSubmittedTotal(pr),
                      Number(pr.actual_amount),
                    )
                  : null;
              return (
                <li
                  key={pr.id}
                  className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                >
                  <Link
                    href={`/purchase-requests/view?id=${pr.id}`}
                    className="block p-3 active:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}
                      >
                        <StatusIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">
                            {formatDate(pr.date_prepared)}
                          </p>
                          {Number(pr.ige_amount) > 0 && (
                            <span className="text-sm font-medium shrink-0">
                              {formatMoney(Number(pr.ige_amount))}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {pr.vendor1_name || "Vendor TBD"}
                        </p>
                        {pr.justification && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {pr.justification}
                          </p>
                        )}
                      </div>
                      {showDownloadHint && (
                        <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    <PrStageTracker
                      status={pr.status}
                      completed={prIsComplete(pr)}
                      className="mt-3"
                    />
                    {prNeedsReceipt(pr) && (
                      <p className="mt-2 mr-2 inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                        <Receipt className="w-3 h-3" />
                        Needs receipt
                      </p>
                    )}
                    {variance && (
                      <p
                        className={`mt-2 mr-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${VARIANCE_BADGE_CLASSES[variance.tone]}`}
                      >
                        <Receipt className="w-3 h-3" />
                        {formatVariance(variance)}
                      </p>
                    )}
                    {sowMeta && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                        <FileSignature className="w-3 h-3" />
                        SOW · {sowMeta.label}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
                    {prNeedsReceipt(pr) && (
                      <Link
                        href={`/purchase-requests/view?id=${pr.id}#reconcile`}
                        aria-label="Upload receipt"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-warning-foreground bg-warning/15 hover:bg-warning/25 active:scale-[0.97] transition-all"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Upload receipt
                      </Link>
                    )}
                    {meta.next && NextIcon && meta.nextLabel && (
                      <button
                        type="button"
                        aria-label={`Advance PR — Mark as ${meta.nextLabel}`}
                        disabled={advancingId === `${pr.id}:status`}
                        onClick={() =>
                          handleAdvanceStatus(
                            pr.id,
                            label,
                            meta.next!,
                            meta.nextLabel!,
                            "status",
                            "PR",
                          )
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.97] transition-all disabled:opacity-50"
                      >
                        <NextIcon className="w-3.5 h-3.5" />
                        Mark {meta.nextLabel}
                      </button>
                    )}
                    {sowMeta?.next && SowNextIcon && sowMeta.nextLabel && (
                      <button
                        type="button"
                        aria-label={`Advance SOW — Mark as ${sowMeta.nextLabel}`}
                        disabled={advancingId === `${pr.id}:sow_status`}
                        onClick={() =>
                          handleAdvanceStatus(
                            pr.id,
                            label,
                            sowMeta.next!,
                            sowMeta.nextLabel!,
                            "sow_status",
                            "SOW",
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1.5 text-violet-700 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 active:scale-[0.97] transition-all disabled:opacity-50"
                      >
                        <SowNextIcon className="w-3.5 h-3.5" />
                        SOW
                      </button>
                    )}
                    <div className="flex-1" />
                    {meta.prev && meta.prevLabel && (
                      <button
                        type="button"
                        aria-label={`Revert PR — Back to ${meta.prevLabel}`}
                        title={`Back to ${meta.prevLabel}`}
                        disabled={advancingId === `${pr.id}:status`}
                        onClick={() =>
                          handleAdvanceStatus(
                            pr.id,
                            label,
                            meta.prev!,
                            meta.prevLabel!,
                            "status",
                            "PR",
                          )
                        }
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 active:scale-[0.97] transition-all disabled:opacity-50"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                    <Link
                      href={`/purchase-requests/new?from=${pr.id}`}
                      aria-label="Order again"
                      title="Order again"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97] transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      aria-label="Delete"
                      title="Delete"
                      disabled={deletingId === pr.id}
                      onClick={() => handleDelete(pr.id, label)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
