"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import { PR_COST_CENTERS } from "@/lib/pr-accounting-codes";
import type { CostCenterBudget } from "@/types/database";
import {
  currentFederalFiscalYear,
  fiscalYearShort,
  fiscalYearLabel,
} from "@/lib/pr-audit/fiscal-year";

function formatMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
}

interface BudgetEntry {
  /** Existing row id, if one exists for this FY + cost center. */
  id: string | null;
  amount: string; // raw input value
}

export default function PrAuditBudgetPage() {
  const { profile, loading: authLoading } = useAuth();
  const [fiscalYear, setFiscalYear] = useState(() => currentFederalFiscalYear());
  const [entries, setEntries] = useState<Record<string, BudgetEntry>>({});
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
    try {
      const rows = await directSelectList<CostCenterBudget>(
        "cost_center_budgets",
        {
          columns: "*",
          filters: [`fiscal_year=eq.${fiscalYear}`],
          limit: 100,
          label: "pr-audit.budget.fetch",
        },
      );
      const byCc = new Map(rows.map((r) => [r.cost_ctr, r]));
      const next: Record<string, BudgetEntry> = {};
      for (const cc of PR_COST_CENTERS) {
        const existing = byCc.get(cc.value);
        next[cc.value] = {
          id: existing?.id ?? null,
          amount: existing ? String(existing.annual_amount) : "",
        };
      }
      setEntries(next);
    } catch (err) {
      console.error("[pr-audit] budget fetch failed:", err);
      setError("Couldn't load budgets.");
    } finally {
      setLoading(false);
    }
  }, [fiscalYear]);

  useEffect(() => {
    if (!isAllowed) return;
    load();
  }, [isAllowed, load]);

  const handleAmountChange = (cc: string, amount: string) => {
    setSaved(false);
    setEntries((prev) => ({
      ...prev,
      [cc]: { ...prev[cc], amount },
    }));
  };

  const total = PR_COST_CENTERS.reduce(
    (s, cc) => s + (parseFloat(entries[cc.value]?.amount || "") || 0),
    0,
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const userId = getCachedUserId();
      for (const cc of PR_COST_CENTERS) {
        const entry = entries[cc.value];
        if (!entry) continue;
        const amount = parseFloat(entry.amount || "") || 0;
        if (entry.id) {
          await directPatchRow(
            "cost_center_budgets",
            "id",
            entry.id,
            { annual_amount: amount },
            "pr-audit.budget.update",
          );
        } else if (amount > 0) {
          // Only create a row when there's an actual amount to store.
          const inserted = await directInsertRow<CostCenterBudget>(
            "cost_center_budgets",
            {
              fiscal_year: fiscalYear,
              cost_ctr: cc.value,
              annual_amount: amount,
              created_by: userId,
            },
            "pr-audit.budget.insert",
          );
          setEntries((prev) => ({
            ...prev,
            [cc.value]: { id: inserted.id, amount: String(amount) },
          }));
        }
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save budgets.");
    } finally {
      setSaving(false);
    }
  }, [entries, fiscalYear]);

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
            Annual allocation per NAF account
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

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {PR_COST_CENTERS.map((cc) => {
              const label = cc.label.includes("—")
                ? cc.label.split("—")[1].trim()
                : cc.label;
              return (
                <div
                  key={cc.value}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {cc.value}
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
                        value={entries[cc.value]?.amount ?? ""}
                        onChange={(e) =>
                          handleAmountChange(cc.value, e.target.value)
                        }
                        placeholder="0"
                        className="w-36 text-sm text-right rounded-lg border border-border bg-background pl-6 pr-2 py-2"
                      />
                    </div>
                  </div>
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
