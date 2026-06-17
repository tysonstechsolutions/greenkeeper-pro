"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  FileText,
  Calendar,
  ChevronRight,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  Send,
  ClipboardList,
  Wrench as WrenchIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import {
  directDeleteRow,
  directPatchRow,
  directSelectList,
} from "@/lib/supabase/rest";
import { syncClubhouseIssueForWO } from "@/lib/work-orders/clubhouse-sync";
import { workOrderDisplayName } from "@/lib/reports/wo-naming";
import { NewWorkOrderForm } from "./new-work-order-form";

// ── Work order type (matches the DB columns we SELECT) ──────────────────────

interface WorkOrder {
  id: string;
  wo_sequence_number: number | null;
  date_submitted: string;
  nature_of_request: string | null;
  facility_bldg: string | null;
  description_of_work: string;
  work_type: string | null;
  status: "draft" | "submitted" | "sent" | "completed";
  created_by: string | null;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getMonthKey(iso: string): string {
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

// ── WO lifecycle ─────────────────────────────────────────────────────────────

type WoStatus = WorkOrder["status"];

interface StatusMeta {
  label: string;
  iconBg: string;
  badge: string;
  icon: LucideIcon;
  next: WoStatus | null;
  nextLabel: string | null;
  nextIcon: LucideIcon | null;
  nextHover: string | null;
}

const STATUS_FLOW: Record<WoStatus, StatusMeta> = {
  draft: {
    label: "Draft",
    iconBg: "bg-muted text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
    icon: FileText,
    next: "submitted",
    nextLabel: "Submitted",
    nextIcon: ClipboardList,
    nextHover: "hover:bg-amber-500/10 hover:text-amber-600",
  },
  submitted: {
    label: "Submitted",
    iconBg: "bg-amber-500/10 text-amber-600",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: ClipboardList,
    next: "sent",
    nextLabel: "Sent",
    nextIcon: Send,
    nextHover: "hover:bg-blue-500/10 hover:text-blue-600",
  },
  sent: {
    label: "Sent",
    iconBg: "bg-blue-500/10 text-blue-600",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    icon: Send,
    next: "completed",
    nextLabel: "Completed",
    nextIcon: CheckCircle2,
    nextHover: "hover:bg-green-500/10 hover:text-green-600",
  },
  completed: {
    label: "Completed",
    iconBg: "bg-green-600/10 text-green-700 dark:text-green-400",
    badge: "bg-green-600/10 text-green-700 dark:text-green-400",
    icon: CheckCircle2,
    next: null,
    nextLabel: null,
    nextIcon: null,
    nextHover: null,
  },
};

// ── Status summary cards ─────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  count: number;
  icon: LucideIcon;
  colorClass: string;
}

function StatCard({ label, count, icon: Icon, colorClass }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
          {label}
        </span>
      </div>
      <p className="text-lg font-bold leading-tight">{count}</p>
      <p className="text-[11px] text-muted-foreground">
        work order{count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ── Month group ──────────────────────────────────────────────────────────────

interface MonthGroup {
  key: string;
  label: string;
  orders: WorkOrder[];
}

function buildMonthGroups(orders: WorkOrder[]): MonthGroup[] {
  const map: Record<string, MonthGroup> = {};
  for (const wo of orders) {
    const key = getMonthKey(wo.date_submitted);
    if (!map[key]) {
      map[key] = { key, label: formatMonthLabel(key), orders: [] };
    }
    map[key].orders.push(wo);
  }
  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function MonthRow({
  group,
  isCurrentMonth,
}: {
  group: MonthGroup;
  isCurrentMonth: boolean;
}) {
  const [expanded, setExpanded] = useState(isCurrentMonth);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isCurrentMonth
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
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
            {group.orders.length} work order{group.orders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <span className="font-bold text-sm shrink-0">{group.orders.length}</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {group.orders
            .slice()
            .sort((a, b) => b.date_submitted.localeCompare(a.date_submitted))
            .map((wo) => {
              const meta = STATUS_FLOW[wo.status] ?? STATUS_FLOW.submitted;
              return (
                <Link
                  key={wo.id}
                  href={`/work-orders/view?id=${wo.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    {wo.facility_bldg || "No facility"} &middot;{" "}
                    {formatDate(wo.date_submitted)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    #{wo.wo_sequence_number?.toString().padStart(3, "0") ?? "—"}
                  </span>
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function WorkOrdersListPage() {
  const { profile, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm" ||
    profile?.role === "foreman";

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await directSelectList<WorkOrder>("work_orders", {
        columns:
          "id,wo_sequence_number,date_submitted,nature_of_request,facility_bldg,description_of_work,work_type,status,created_by,created_at",
        orderBy: [{ column: "date_submitted", ascending: false }],
        limit: 200,
        label: "work-orders.fetchList",
      });
      setOrders(data);
    } catch (err) {
      console.error("[work-orders] fetch failed:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    fetchOrders();
  }, [isAllowed, fetchOrders]);

  useRefreshOnFocus(fetchOrders, isAllowed);

  // ── Status counts ──────────────────────────────────────────────────────────

  const submitted = orders.filter((o) => o.status === "submitted").length;
  const sent = orders.filter((o) => o.status === "sent").length;
  const completed = orders.filter((o) => o.status === "completed").length;

  // ── Monthly groups ─────────────────────────────────────────────────────────

  const currentMonthKey = getMonthKey(new Date().toISOString().slice(0, 10));
  const activeOrders = orders.filter((o) => o.status !== "draft");
  const monthGroups = buildMonthGroups(activeOrders);

  // ── Actions ────────────────────────────────────────────────────────────────

  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const handleAdvanceStatus = useCallback(
    async (id: string, desc: string, next: WoStatus, nextLabel: string) => {
      if (!confirm(`Mark this work order as "${nextLabel}"?\n\n${desc}`)) return;
      setAdvancingId(id);
      try {
        await directPatchRow(
          "work_orders",
          "id",
          id,
          { status: next },
          "work-orders.advanceStatus",
        );
        // Mirror the status onto any linked clubhouse/facilities issue.
        await syncClubhouseIssueForWO(id, next);
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: next } : o)),
        );
      } catch (err) {
        alert(
          `Couldn't update status: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setAdvancingId(null);
      }
    },
    [],
  );

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = useCallback(
    async (id: string, desc: string) => {
      if (!confirm(`Delete this work order? This can't be undone.\n\n${desc}`))
        return;
      setDeletingId(id);
      try {
        await directDeleteRow("work_orders", "id", id, "work-orders.delete");
      } catch (err) {
        setDeletingId(null);
        alert(
          `Couldn't delete: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      setDeletingId(null);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
          <h1 className="text-lg font-bold">Work Orders</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, directors, GMs, and
            foremen can manage work orders.
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
          <h1 className="text-lg font-bold leading-tight">Work Orders</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            MWR Facilities Maintenance
          </p>
        </div>
      </div>

      <div className="mt-4">
        <NewWorkOrderForm onCreated={fetchOrders} />
      </div>

      {/* ── Status Summary ──────────────────────────────────────────────── */}
      {!loading && orders.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Status Tracker
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Submitted"
              count={submitted}
              icon={ClipboardList}
              colorClass="text-amber-600"
            />
            <StatCard
              label="Sent"
              count={sent}
              icon={Send}
              colorClass="text-blue-600"
            />
            <StatCard
              label="Completed"
              count={completed}
              icon={CheckCircle2}
              colorClass="text-green-700 dark:text-green-400"
            />
          </div>
        </div>
      )}

      {/* ── Monthly Groups ──────────────────────────────────────────────── */}
      {!loading && activeOrders.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            By Month
          </h2>
          <div className="space-y-2">
            {monthGroups.map((group) => (
              <MonthRow
                key={group.key}
                group={group}
                isCurrentMonth={group.key === currentMonthKey}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── History List ────────────────────────────────────────────────── */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          History
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <WrenchIcon className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">No work orders yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the button above to create your first one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.map((wo) => {
              const meta = STATUS_FLOW[wo.status] ?? STATUS_FLOW.submitted;
              const StatusIcon = meta.icon;
              const NextIcon = meta.nextIcon;
              const displayName = workOrderDisplayName(
                wo.wo_sequence_number,
                wo.date_submitted,
              );
              const shortDesc =
                wo.description_of_work.length > 100
                  ? wo.description_of_work.slice(0, 100) + "..."
                  : wo.description_of_work;

              return (
                <li
                  key={wo.id}
                  className="flex items-stretch gap-2 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors"
                >
                  <Link
                    href={`/work-orders/view?id=${wo.id}`}
                    className="flex items-center gap-3 p-3 flex-1 min-w-0 active:scale-[0.99]"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}
                    >
                      <StatusIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          {formatDate(wo.date_submitted)}
                        </p>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {wo.facility_bldg || "No facility"} &middot; #
                        {wo.wo_sequence_number
                          ?.toString()
                          .padStart(3, "0") ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {shortDesc}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                  {meta.next && NextIcon && meta.nextLabel && (
                    <button
                      type="button"
                      aria-label={`Advance — Mark as ${meta.nextLabel}`}
                      title={`Mark as ${meta.nextLabel}`}
                      disabled={advancingId === wo.id}
                      onClick={() =>
                        handleAdvanceStatus(
                          wo.id,
                          displayName,
                          meta.next!,
                          meta.nextLabel!,
                        )
                      }
                      className={`flex items-center justify-center px-3 border-l border-border text-muted-foreground active:scale-[0.97] transition-all disabled:opacity-50 ${meta.nextHover}`}
                    >
                      <NextIcon className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Delete"
                    title="Delete"
                    disabled={deletingId === wo.id}
                    onClick={() => handleDelete(wo.id, displayName)}
                    className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-600 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
