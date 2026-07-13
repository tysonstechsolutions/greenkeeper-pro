"use client";

// Duty / cleaning log — the compliance trail behind the Today check-offs:
// who completed which standing duty on which day, grouped by month, with an
// area filter and a print button (health inspectors like paper).

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { directSelectList } from "@/lib/supabase/rest";
import type { DutyArea, DutyCompletion, OperationDuty } from "@/lib/operations/types";

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

interface CompletionRow extends DutyCompletion {
  profiles?: { full_name: string | null } | null;
}

export default function DutyLogPage() {
  const [duties, setDuties] = useState<OperationDuty[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState<DutyArea | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dutyRows, completionRows] = await Promise.all([
          // Include retired duties — history must keep its labels.
          directSelectList<OperationDuty>("operation_duties", {
            columns: "*",
            limit: 500,
            label: "dutyLog.duties",
          }),
          directSelectList<CompletionRow>("duty_completions", {
            columns: "*,profiles:completed_by(full_name)",
            orderBy: [{ column: "duty_date", ascending: false }],
            limit: 1000,
            label: "dutyLog.completions",
          }),
        ]);
        if (cancelled) return;
        setDuties(dutyRows);
        setCompletions(completionRows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dutyById = useMemo(() => new Map(duties.map((d) => [d.id, d])), [duties]);

  const months = useMemo(() => {
    const filtered = completions.filter((c) => {
      if (area === "all") return true;
      return dutyById.get(c.duty_id)?.area === area;
    });
    const groups = new Map<string, CompletionRow[]>();
    for (const c of filtered) {
      const key = c.duty_date.slice(0, 7); // YYYY-MM
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [completions, area, dutyById]);

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="gk-page mx-auto">
      <div className="flex items-start justify-between gap-2 mb-1 print:hidden">
        <h1>Duty & Cleaning Log</h1>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors shrink-0"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>
      <h1 className="hidden print:block mb-1">Duty & Cleaning Log — {AREA_LABELS[area]}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Every checked-off standing duty, with who and when — the paper trail for
        cleaning routines and inspections.
      </p>

      {/* Area filter */}
      <div className="flex gap-2 mb-5 print:hidden">
        {(Object.keys(AREA_LABELS) as (DutyArea | "all")[]).map((key) => (
          <button
            key={key}
            onClick={() => setArea(key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              area === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-muted",
            )}
          >
            {AREA_LABELS[key]}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : months.length === 0 ? (
        <div className="gk-card p-6 text-center text-sm text-muted-foreground">
          Nothing logged yet — duties checked off on Today (or a workspace page)
          show up here automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(([key, rows]) => (
            <section key={key}>
              <p className="gk-section-label mb-2">
                {monthLabel(key)} · {rows.length} check-off{rows.length === 1 ? "" : "s"}
              </p>
              <div className="gk-card divide-y divide-border/50">
                {rows.map((c) => {
                  const duty = dutyById.get(c.duty_id);
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                        {c.duty_date}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {duty?.title ?? "(deleted duty)"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {duty ? AREA_LABELS[duty.area] : ""}
                        {c.profiles?.full_name ? ` · ${c.profiles.full_name}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
