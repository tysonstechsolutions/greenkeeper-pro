"use client";

// History tab of Duty Ownership (was the separate Duty & Cleaning Log page):
// who checked off which standing duty on which day, grouped by month, with
// an area filter, a time range, and a print button (inspectors like paper).

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { directSelectAll, directSelectList } from "@/lib/supabase/rest";
import { addDaysLocal, todayLocal } from "@/lib/utils/date";
import {
  groupDutyHistoryByMonth,
  mergeDutyHistory,
  type DutyHistoryLegacyRow,
  type DutyHistoryTaskRow,
} from "@/lib/operations/duty-history";
import type { DutyArea, OperationDuty } from "@/lib/operations/types";

const AREA_LABELS: Record<DutyArea | "all", string> = {
  all: "All areas",
  course: "Course & Range",
  restaurant: "Restaurant",
  pro_shop: "Pro Shop",
  golf_operations: "Golf Operations",
  administration: "Administration",
  external: "Contractors",
  unassigned: "Unassigned",
};

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

export function DutyHistory({
  duties,
  people,
}: {
  /** Every duty, active or retired — history keeps its labels. */
  duties: Pick<OperationDuty, "id" | "title" | "area">[];
  people: { id: string; full_name: string }[];
}) {
  const [tasks, setTasks] = useState<DutyHistoryTaskRow[]>([]);
  const [legacy, setLegacy] = useState<DutyHistoryLegacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState<DutyArea | "all">("all");
  const [rangeDays, setRangeDays] = useState<number>(90);

  useEffect(() => {
    let cancelled = false;
    const since = addDaysLocal(todayLocal(), -rangeDays);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [taskRows, legacyRows] = await Promise.all([
          directSelectAll<DutyHistoryTaskRow>("tasks", {
            columns: "id,duty_id,title,original_due_date,due_date,status,completed_at,completed_by,verified_at",
            filters: ["duty_id=not.is.null", "status=in.(completed,verified)", `due_date=gte.${since}`],
            orderBy: [{ column: "due_date", ascending: false }, { column: "id" }],
            label: "dutyHistory.tasks",
          }),
          // The original table stopped receiving rows in July 2026; it only
          // matters for the oldest history, so it is read best-effort.
          directSelectList<DutyHistoryLegacyRow>("duty_completions", {
            columns: "*,profiles:completed_by(full_name)",
            filters: [`duty_date=gte.${since}`],
            orderBy: [{ column: "duty_date", ascending: false }],
            limit: 2000,
            label: "dutyHistory.legacy",
          }).catch(() => [] as DutyHistoryLegacyRow[]),
        ]);
        if (cancelled) return;
        setTasks(taskRows);
        setLegacy(legacyRows);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const nameById = useMemo(() => new Map(people.map((person) => [person.id, person.full_name])), [people]);
  const entries = useMemo(
    () => mergeDutyHistory(tasks, legacy, duties, nameById),
    [tasks, legacy, duties, nameById],
  );
  const months = useMemo(
    () => groupDutyHistoryByMonth(area === "all" ? entries : entries.filter((entry) => entry.area === area)),
    [entries, area],
  );
  const areasPresent = useMemo(() => new Set(entries.map((entry) => entry.area).filter(Boolean)), [entries]);

  return (
    <section aria-label="Duty history" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <p className="max-w-xl text-sm text-muted-foreground">
          Every checked-off standing duty, with who and when — the paper trail for
          cleaning routines and inspections.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <Printer className="h-4 w-4" />Print
        </button>
      </div>
      <h2 className="mb-1 hidden print:block">Duty history — {AREA_LABELS[area]}</h2>

      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Time range">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            aria-pressed={rangeDays === range.days}
            onClick={() => setRangeDays(range.days)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              rangeDays === range.days ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            Last {range.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Area">
        {(Object.keys(AREA_LABELS) as (DutyArea | "all")[])
          .filter((key) => key === "all" || areasPresent.has(key) || area === key)
          .map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={area === key}
              onClick={() => setArea(key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                area === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {AREA_LABELS[key]}
            </button>
          ))}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading history</span>
        </div>
      ) : months.length === 0 ? (
        <div className="gk-card p-6 text-center text-sm text-muted-foreground">
          Nothing checked off in this range yet. Duties marked done in Operations
          (or on a workspace page) show up here automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {months.map((month) => (
            <section key={month.key}>
              <p className="gk-section-label mb-2">
                {month.label} · {month.entries.length} check-off{month.entries.length === 1 ? "" : "s"}
              </p>
              <div className="gk-card divide-y divide-border/50">
                {month.entries.map((entry) => (
                  <div key={entry.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-[5.5rem] shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{entry.date}</span>
                    {/* Details stack under the name so a phone never cuts the
                        duty name down to a few letters. */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{entry.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        {entry.area && <span>{AREA_LABELS[entry.area]}</span>}
                        {entry.completedBy && <span>· {entry.completedBy}</span>}
                        {entry.verified && (
                          <span className="flex items-center gap-1 font-medium text-success">
                            <ShieldCheck className="h-3.5 w-3.5" />Verified
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
