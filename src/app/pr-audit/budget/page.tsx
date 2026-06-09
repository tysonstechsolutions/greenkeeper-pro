"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectList,
  directDeleteByFilter,
  directInsertRows,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { CostCenterBudget } from "@/types/database";
import { usePrCodes } from "@/lib/hooks/usePrCodes";
import {
  currentFederalFiscalYear,
  fiscalYearShort,
  fiscalYearLabel,
  FISCAL_MONTH_LABELS,
} from "@/lib/pr-audit/fiscal-year";
import {
  splitAnnualToMonths,
  buildMonthlyBudgetRows,
  monthlyFromRows,
} from "@/lib/pr-audit/budget-entry";

function formatMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sumMonths(months: string[]): number {
  return round2(months.reduce((s, m) => s + parseNum(m), 0));
}

/** Trim the code prefix and the "GLK VMGC" boilerplate for a tidy label. */
function shortLabel(rawLabel: string, code: string): string {
  const base = (rawLabel || code).replace(/^GLK VMGC\s*/i, "").trim();
  return base || code;
}

interface CcEntry {
  /** 12 monthly amounts (fiscal order, Oct→Sep) as input strings. Source of truth. */
  months: string[];
  /** Transient text in the Annual box (lets the user type freely). */
  annualText: string;
  expanded: boolean;
}

export default function PrAuditBudgetPage() {
  const { profile, loading: authLoading } = useAuth();
  const { costCenters, loading: codesLoading } = usePrCodes();
  const [fiscalYear, setFiscalYear] = useState(() => currentFederalFiscalYear());
  const [entries, setEntries] = useState<Record<string, CcEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const rows = await directSelectList<CostCenterBudget>(
        "cost_center_budgets",
        {
          columns: "*",
          filters: [`fiscal_year=eq.${fiscalYear}`],
          limit: 400,
          label: "pr-audit.budget.fetch",
        },
      );
      const next: Record<string, CcEntry> = {};
      for (const cc of costCenters) {
        const monthsNum = monthlyFromRows(rows, cc.code);
        const annual = round2(monthsNum.reduce((s, v) => s + v, 0));
        next[cc.code] = {
          months: monthsNum.map((v) => (v ? String(v) : "")),
          annualText: annual ? String(annual) : "",
          expanded: false,
        };
      }
      setEntries(next);
    } catch (err) {
      console.error("[pr-audit] budget fetch failed:", err);
      setError("Couldn't load budgets.");
    } finally {
      setLoading(false);
    }
  }, [fiscalYear, costCenters]);

  useEffect(() => {
    if (!isAllowed || codesLoading) return;
    load();
  }, [isAllowed, codesLoading, load]);

  // Type in the Annual box → keep their text, re-split evenly across 12 months.
  const handleAnnualChange = useCallback((code: string, text: string) => {
    setSaved(false);
    setEntries((prev) => {
      const n = parseNum(text);
      const months =
        n > 0
          ? splitAnnualToMonths(n).map((v) => (v ? String(round2(v)) : ""))
          : new Array(12).fill("");
      return { ...prev, [code]: { ...prev[code], annualText: text, months } };
    });
  }, []);

  // Type in a Month box → set just that month; the annual reflects the new sum.
  const handleMonthChange = useCallback(
    (code: string, idx: number, text: string) => {
      setSaved(false);
      setEntries((prev) => {
        const entry = prev[code];
        if (!entry) return prev;
        const months = [...entry.months];
        months[idx] = text;
        const sum = sumMonths(months);
        return {
          ...prev,
          [code]: { ...entry, months, annualText: sum ? String(sum) : "" },
        };
      });
    },
    [],
  );

  const toggleExpand = useCallback((code: string) => {
    setEntries((prev) => {
      const entry = prev[code];
      if (!entry) return prev;
      return { ...prev, [code]: { ...entry, expanded: !entry.expanded } };
    });
  }, []);

  const total = useMemo(
    () =>
      round2(
        Object.values(entries).reduce((s, e) => s + sumMonths(e.months), 0),
      ),
    [entries],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const userId = getCachedUserId();
      for (const cc of costCenters) {
        const entry = entries[cc.code];
        if (!entry) continue;
        const monthly = entry.months.map(parseNum);
        const rows = buildMonthlyBudgetRows({
          fiscalYear,
          costCtr: cc.code,
          monthly,
          createdBy: userId,
        });
        // Replace this cost center's rows for the FY — clears any legacy
        // whole-year row and stale months, then writes the current ones.
        await directDeleteByFilter(
          "cost_center_budgets",
          [`fiscal_year=eq.${fiscalYear}`, `cost_ctr=eq.${encodeURIComponent(cc.code)}`],
          "pr-audit.budget.clear",
        );
        if (rows.length > 0) {
          await directInsertRows(
            "cost_center_budgets",
            rows as unknown as Record<string, unknown>[],
            "pr-audit.budget.insert",
          );
        }
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save budgets.");
    } finally {
      setSaving(false);
    }
  }, [entries, fiscalYear, costCenters]);

  const currentFy = currentFederalFiscalYear();
  const busy = loading || codesLoading;

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
          <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Cost Center Budgets</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-32 max-w-lg mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight flex items-center gap-1.5">
            <Wallet className="w-5 h-5" /> Cost Center Budgets
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Set the yearly amount — it splits across 12 months. Expand any to
            shape seasonal spending.
          </p>
        </div>
      </div>

      {/* FY selector */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 mb-4">
        <button
          type="button"
          aria-label="Previous fiscal year"
          onClick={() => setFiscalYear((y) => y - 1)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="font-semibold">{fiscalYearShort(fiscalYear)}</p>
          <p className="text-[11px] text-muted-foreground">
            {fiscalYearLabel(fiscalYear)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Next fiscal year"
          disabled={fiscalYear >= currentFy + 1}
          onClick={() => setFiscalYear((y) => Math.min(currentFy + 1, y + 1))}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {busy ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : costCenters.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No cost centers yet. Add some under{" "}
          <Link href="/pr-audit/codes" className="text-primary font-medium underline">
            Manage Lists
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {costCenters.map((cc) => {
              const entry =
                entries[cc.code] ?? {
                  months: new Array(12).fill(""),
                  annualText: "",
                  expanded: false,
                };
              return (
                <div
                  key={cc.code}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {shortLabel(cc.rawLabel, cc.code)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {cc.code}
                        {cc.category ? ` · ${cc.category}` : ""}
                      </p>
                    </div>
                    <div className="relative shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="100"
                        value={entry.annualText}
                        onChange={(e) =>
                          handleAnnualChange(cc.code, e.target.value)
                        }
                        placeholder="0"
                        className="w-36 text-sm text-right rounded-lg border border-border bg-background pl-6 pr-2 py-2"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(cc.code)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {entry.expanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Monthly breakdown
                  </button>

                  {entry.expanded && (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {FISCAL_MONTH_LABELS.map((label, idx) => (
                        <div key={label}>
                          <label className="text-[9px] text-muted-foreground block mb-0.5">
                            {label}
                          </label>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                              $
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              value={entry.months[idx] ?? ""}
                              onChange={(e) =>
                                handleMonthChange(cc.code, idx, e.target.value)
                              }
                              placeholder="0"
                              className="w-full text-xs text-right rounded-md border border-border bg-background pl-4 pr-1.5 py-1.5"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between px-3 py-3 mt-2">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Total {fiscalYearShort(fiscalYear)} budget
            </span>
            <span className="text-lg font-bold">{formatMoney(total)}</span>
          </div>

          {error && (
            <div className="mb-3 text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="w-5 h-5" /> Saved
              </>
            ) : (
              <>Save budgets</>
            )}
          </button>
        </>
      )}
    </div>
  );
}
