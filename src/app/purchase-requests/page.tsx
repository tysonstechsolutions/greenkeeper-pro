"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import {
  directDeleteRow,
  directPatchRow,
  directSelectList,
} from "@/lib/supabase/rest";
import type { PurchaseRequest } from "@/types/database";

function formatDate(iso: string): string {
  // The DB column is a DATE (yyyy-mm-dd). new Date("2026-05-04") parses
  // as 2026-05-04T00:00:00Z (UTC midnight); in any negative-UTC zone
  // (Central, Pacific, etc.) toLocaleDateString then shows the day BEFORE.
  // Anchoring at noon local keeps the calendar day correct everywhere
  // in the US.
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

// ── PR lifecycle ─────────────────────────────────────────────────────────────

type PrStatus = PurchaseRequest["status"];

interface StatusMeta {
  label: string;
  iconBg: string;     // bg + text classes for the row's left icon tile
  badge: string;      // bg + text classes for the inline badge
  icon: LucideIcon;   // icon shown on the row
  next: PrStatus | null;       // null = terminal state
  nextLabel: string | null;    // verb shown in the confirm prompt
  nextIcon: LucideIcon | null; // icon for the advance button
  nextHover: string | null;    // hover color for the advance button
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
  },
};

export default function PurchaseRequestsListPage() {
  const { profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const fetchRequests = useCallback(async () => {
    setLoading(true);
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
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    fetchRequests(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [isAllowed, fetchRequests]);

  // Re-fetch on tab focus / visibility change so navigating back from /new
  // or /view shows fresh data without a manual reload.
  useRefreshOnFocus(fetchRequests, isAllowed);

  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const handleAdvanceStatus = useCallback(
    async (id: string, label: string, next: PrStatus, nextLabel: string) => {
      if (
        !confirm(
          `Mark "${label}" as "${nextLabel}"?\n\nYou can still view and re-download the bundle afterward.`,
        )
      ) {
        return;
      }
      setAdvancingId(id);
      try {
        await directPatchRow(
          "purchase_requests",
          "id",
          id,
          { status: next },
          "purchase-requests.advanceStatus",
        );
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: next } : r)),
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
    async (id: string, label: string) => {
      if (!confirm(`Delete the purchase request for ${label}? This can't be undone.`)) {
        return;
      }
      setDeletingId(id);
      try {
        await directDeleteRow(
          "purchase_requests",
          "id",
          id,
          "purchase-requests.delete",
        );
      } catch (err) {
        setDeletingId(null);
        alert(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      setDeletingId(null);
      // Optimistic prune so the row vanishes without a round-trip.
      setRequests((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

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
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">No purchase requests yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the button above to create your first one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((pr) => {
              const meta = STATUS_FLOW[pr.status] ?? STATUS_FLOW.submitted;
              const StatusIcon = meta.icon;
              const NextIcon = meta.nextIcon;
              const showDownloadHint =
                pr.status !== "draft" && pr.status !== "received";
              const label = `${pr.vendor1_name || "this PR"} (${formatDate(pr.date_prepared)})`;
              return (
                <li
                  key={pr.id}
                  className="flex items-stretch gap-2 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors"
                >
                  <Link
                    href={`/purchase-requests/view?id=${pr.id}`}
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
                          {formatDate(pr.date_prepared)}
                        </p>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {pr.vendor1_name || "Vendor TBD"} &middot;{" "}
                        {formatMoney(Number(pr.ige_amount) || 0)}
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
                  </Link>
                  <Link
                    href={`/purchase-requests/new?from=${pr.id}`}
                    aria-label="Order again"
                    title="Order again"
                    className="flex items-center justify-center px-3 border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97] transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </Link>
                  {meta.next && NextIcon && meta.nextLabel && (
                    <button
                      type="button"
                      aria-label={`Mark as ${meta.nextLabel}`}
                      title={`Mark as ${meta.nextLabel}`}
                      disabled={advancingId === pr.id}
                      onClick={() =>
                        handleAdvanceStatus(pr.id, label, meta.next!, meta.nextLabel!)
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
                    disabled={deletingId === pr.id}
                    onClick={() => handleDelete(pr.id, label)}
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
