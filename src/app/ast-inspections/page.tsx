"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  FileCheck,
  AlertTriangle,
  Calendar,
  Download,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import { createClient } from "@/lib/supabase/client";
import { resolveAccessToken } from "@/lib/api/client";
import { AST_INSPECTION_ITEMS, isNonConforming } from "@/lib/ast-inspection-items";
import type { AstInspection } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(anchored);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function monthsBetween(fromIso: string, toIso: string): number {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  return (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
}

function nonConformingCount(items: AstInspection["items"]): number {
  let n = 0;
  for (const def of AST_INSPECTION_ITEMS) {
    const entry = items?.[String(def.number)];
    if (isNonConforming(def, entry?.status ?? null)) n++;
  }
  return n;
}

export default function AstInspectionsListPage() {
  const { profile, loading: authLoading } = useAuth();
  const [inspections, setInspections] = useState<AstInspection[]>([]);
  const [loading, setLoading] = useState(true);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // Raw REST instead of supabase.from() — see useProfiles / vendor list
  // for the why. Avoids supabase-js's auth path that has been observed
  // to wedge mid-session, leaving the list stuck at "Loading...".
  const fetchInspections = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const token = await resolveAccessToken(supabase, supabaseUrl, anonKey);
      const url = `${supabaseUrl}/rest/v1/ast_inspections?select=*&order=inspection_date.desc`;
      const res = await fetch(url, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error(
          "[ast-inspections] list fetch failed:",
          res.status,
          res.statusText,
        );
        setInspections([]);
        return;
      }
      const data = (await res.json()) as AstInspection[];
      setInspections(data || []);
    } catch (err) {
      console.error("[ast-inspections] list fetch error:", err);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    fetchInspections(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [isAllowed, fetchInspections]);

  useRefreshOnFocus(fetchInspections, isAllowed);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="p-4 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/environmental" className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">AST Inspections</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, and directors can manage AST inspections.
          </p>
        </div>
      </div>
    );
  }

  // Detect overdue: most recent completed inspection > 31 days old.
  const mostRecent = inspections.find((i) => i.status === "completed");
  const today = todayLocal();
  const monthsSinceLast = mostRecent
    ? monthsBetween(mostRecent.inspection_date, today)
    : null;
  const overdue = monthsSinceLast === null || monthsSinceLast >= 1;

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/environmental"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">AST Inspections</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            STI SP001 monthly visual inspection
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div
        className={`mt-4 rounded-2xl border p-4 ${
          overdue
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-green-500/30 bg-green-500/10"
        }`}
      >
        <div className="flex items-start gap-3">
          {overdue ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <FileCheck className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            {mostRecent ? (
              <>
                <p className="text-sm font-semibold">
                  {overdue
                    ? "Inspection due this month"
                    : "On schedule"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last completed {formatDate(mostRecent.inspection_date)} by{" "}
                  {mostRecent.inspector_name}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">No inspections recorded yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  SP001 requires a monthly visual inspection of each AST.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action button */}
      <Link
        href="/ast-inspections/new"
        className="mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
      >
        <Plus className="w-5 h-5" /> New Monthly Inspection
      </Link>

      {/* Inspection history */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Inspection History
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : inspections.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">No inspections yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the button above to record your first inspection.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {inspections.map((inspection) => {
              const issues = nonConformingCount(inspection.items);
              const isDraft = inspection.status === "draft";
              return (
                <li key={inspection.id}>
                  <Link
                    href={`/ast-inspections/view?id=${inspection.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors active:scale-[0.99]"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isDraft
                          ? "bg-muted text-muted-foreground"
                          : issues > 0
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-green-500/15 text-green-700 dark:text-green-400"
                      }`}
                    >
                      {isDraft ? (
                        <Calendar className="w-5 h-5" />
                      ) : issues > 0 ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <FileCheck className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          {formatDate(inspection.inspection_date)}
                        </p>
                        {isDraft && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Draft
                          </span>
                        )}
                        {!isDraft && issues > 0 && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
                            {issues} non-conforming
                          </span>
                        )}
                        {!isDraft && issues === 0 && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400">
                            Pass
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {inspection.tank_ids} &middot; {inspection.inspector_name}
                      </p>
                    </div>
                    {!isDraft && (
                      <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* SP001 reference footer */}
      <div className="mt-8 text-center">
        <p className="text-[11px] text-muted-foreground">
          Per STI SP001, retain each completed checklist for at least 36 months.
        </p>
      </div>
    </div>
  );
}
