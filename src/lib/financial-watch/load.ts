"use client";

/**
 * Financial Watch — data loader.
 *
 * The bridge from the database to the pure engine. Fetches the raw rows for the
 * three lenses, coerces NUMERIC columns (PostgREST returns them as strings) so
 * the engine's arithmetic is real math, computes the trusted cost-center rollup,
 * then runs buildFinancialWatch. The engine stays pure; all I/O lives here.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectList } from "@/lib/supabase/rest";
import { buildCostCenterRollup } from "@/lib/pr-audit/rollup";
import { currentFederalFiscalYear } from "@/lib/pr-audit/fiscal-year";
import type { PrAudit, CostCenterBudget } from "@/types/database";
import { buildFinancialWatch } from "./engine";
import type {
  FinancialWatch,
  BudgetItemInput,
  ExpenseInput,
  RevenueEntryInput,
} from "./types";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface RawBudgetItem {
  id: string;
  fiscal_year: number | string;
  category: BudgetItemInput["category"];
  budgeted_amount: number | string;
  month: number | string | null;
}
interface RawExpense {
  amount: number | string;
  expense_date: string;
  status: ExpenseInput["status"];
  budget_item_id: string | null;
  vendor: string | null;
  description: string | null;
}
interface RawRevenue {
  entry_date: string;
  category: string;
  amount: number | string;
  rounds_count: number | string | null;
}

/** Fetch everything the engine needs and run it. Pure I/O — no analysis here. */
export async function loadFinancialWatch(now: Date): Promise<FinancialWatch> {
  const calendarYear = now.getFullYear();
  const fiscalYear = currentFederalFiscalYear(now);
  const priorYear = calendarYear - 1;

  const [rawBudgets, rawExpenses, rawRevenue, audits, ccBudgets] =
    await Promise.all([
      directSelectList<RawBudgetItem>("budget_items", {
        columns: "id,fiscal_year,category,budgeted_amount,month",
        filters: [`fiscal_year=eq.${calendarYear}`],
        limit: 2000,
        label: "financial-watch.budgetItems",
      }),
      directSelectList<RawExpense>("expenses", {
        columns: "amount,expense_date,status,budget_item_id,vendor,description",
        filters: [
          `expense_date=gte.${calendarYear}-01-01`,
          `expense_date=lte.${calendarYear}-12-31`,
        ],
        limit: 10000,
        label: "financial-watch.expenses",
      }),
      directSelectList<RawRevenue>("revenue_entries", {
        columns: "entry_date,category,amount,rounds_count",
        filters: [
          `entry_date=gte.${priorYear}-01-01`,
          `entry_date=lte.${calendarYear}-12-31`,
        ],
        limit: 20000,
        label: "financial-watch.revenue",
      }),
      directSelectList<PrAudit>("pr_audits", {
        columns: "*",
        orderBy: [{ column: "pr_date", ascending: false }],
        limit: 2000,
        label: "financial-watch.audits",
      }),
      directSelectList<CostCenterBudget>("cost_center_budgets", {
        columns: "*",
        limit: 600,
        label: "financial-watch.ccBudgets",
      }),
    ]);

  const budgetItems: BudgetItemInput[] = rawBudgets.map((b) => ({
    id: String(b.id),
    fiscal_year: num(b.fiscal_year),
    category: b.category,
    budgeted_amount: num(b.budgeted_amount),
    month: b.month == null ? null : num(b.month),
  }));

  const expenses: ExpenseInput[] = rawExpenses.map((e) => ({
    amount: num(e.amount),
    expense_date: e.expense_date,
    status: e.status,
    budget_item_id: e.budget_item_id,
    vendor: e.vendor,
    description: e.description ?? "",
  }));

  const revenueEntries: RevenueEntryInput[] = rawRevenue.map((r) => ({
    entry_date: r.entry_date,
    category: r.category,
    amount: num(r.amount),
    rounds_count: r.rounds_count == null ? null : num(r.rounds_count),
  }));

  // Trusted committed-spend math (federal FY, cost centers). buildCostCenterRollup
  // coerces its own JSONB line items; pass audits/budgets through as the PR Audit
  // page does.
  const procurement = buildCostCenterRollup(audits, ccBudgets, fiscalYear);

  return buildFinancialWatch({
    now,
    calendarYear,
    fiscalYear,
    budgetItems,
    expenses,
    revenueEntries,
    procurement,
  });
}

export interface UseFinancialWatch {
  watch: FinancialWatch | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** React hook: load + recompute the Financial Watch on mount and on reload(). */
export function useFinancialWatch(): UseFinancialWatch {
  const { session } = useAuth();
  // directFetch reads the session token from localStorage; firing before the
  // session is restored (e.g. right after auto-sign-in) throws "not signed in".
  // Wait for a token, like the other data pages do, so the first load succeeds.
  const ready = !!session?.access_token;

  const [watch, setWatch] = useState<FinancialWatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // reload() is an event handler, so the synchronous state reset is fine here;
  // bumping the nonce re-runs the fetch effect below.
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  // The effect itself never sets state synchronously (loading starts true) —
  // all writes happen in the async continuation, after the fetch resolves.
  useEffect(() => {
    if (!ready) return; // hold until the auth session is available
    let cancelled = false;
    loadFinancialWatch(new Date())
      .then((result) => {
        if (!cancelled) setWatch(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[financial-watch] load failed:", err);
        setError("Couldn't load financial data.");
        setWatch(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, nonce]);

  return { watch, loading, error, reload };
}
