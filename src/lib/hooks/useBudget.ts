"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  BudgetItem,
  Expense,
  BudgetCategory,
  ExpenseStatus,
  Profile,
} from "@/types/database";

// Budget category labels
export const budgetCategoryLabels: Record<BudgetCategory, string> = {
  labor: "Labor",
  chemicals: "Chemicals",
  fertilizer: "Fertilizer",
  seed: "Seed",
  equipment_purchase: "Equipment Purchase",
  equipment_repair: "Equipment Repair",
  fuel: "Fuel",
  irrigation: "Irrigation",
  supplies: "Supplies",
  capital_projects: "Capital Projects",
  training: "Training",
  other: "Other",
};

// Budget category colors for charts
export const budgetCategoryColors: Record<BudgetCategory, string> = {
  labor: "#3b82f6", // blue
  chemicals: "#ef4444", // red
  fertilizer: "#22c55e", // green
  seed: "#84cc16", // lime
  equipment_purchase: "#f97316", // orange
  equipment_repair: "#fb923c", // orange-light
  fuel: "#eab308", // yellow
  irrigation: "#06b6d4", // cyan
  supplies: "#8b5cf6", // purple
  capital_projects: "#ec4899", // pink
  training: "#14b8a6", // teal
  other: "#6b7280", // gray
};

// Expense status labels
export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  paid: "Paid",
};

// Expense status colors
export const expenseStatusColors: Record<ExpenseStatus, string> = {
  pending: "#eab308", // yellow
  approved: "#22c55e", // green
  denied: "#ef4444", // red
  paid: "#3b82f6", // blue
};

// Types
export interface BudgetItemWithSpent extends BudgetItem {
  spent: number;
  remaining: number;
  percent_used: number;
}

export interface ExpenseWithDetails extends Expense {
  budget_item?: BudgetItem;
  submitted_by_profile?: Profile;
  approved_by_profile?: Profile;
}

export interface BudgetSummary {
  total_budgeted: number;
  total_spent: number;
  remaining: number;
  percent_used: number;
  by_category: CategorySummary[];
}

export interface CategorySummary {
  category: BudgetCategory;
  budgeted: number;
  spent: number;
  remaining: number;
  percent_used: number;
}

export interface MonthlySpend {
  month: number;
  month_name: string;
  amount: number;
  budgeted?: number;
}

export interface ExpenseFilters {
  budgetItemId?: string;
  category?: BudgetCategory;
  startDate?: string;
  endDate?: string;
  vendor?: string;
  status?: ExpenseStatus;
  submittedBy?: string;
}

export interface CreateBudgetItemData {
  fiscal_year: number;
  category: BudgetCategory;
  description?: string;
  budgeted_amount: number;
  month?: number;
  plan_goal_id?: string;
}

export type UpdateBudgetItemData = Partial<CreateBudgetItemData>;

export interface CreateExpenseData {
  budget_item_id?: string;
  amount: number;
  description: string;
  vendor?: string;
  expense_date: string;
  receipt_photo_id?: string;
  notes?: string;
}

export interface UpdateExpenseData extends Partial<CreateExpenseData> {
  status?: ExpenseStatus;
}

export interface BudgetVsActual {
  category: BudgetCategory;
  budgeted: number;
  actual: number;
  variance: number;
  over_budget: boolean;
}

// Month names for display
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface UseBudgetReturn {
  budgetItems: BudgetItemWithSpent[];
  expenses: ExpenseWithDetails[];
  loading: boolean;
  error: string | null;
  fetchBudget: (fiscalYear: number) => Promise<void>;
  fetchBudgetSummary: (fiscalYear: number) => Promise<BudgetSummary>;
  fetchMonthlySpend: (fiscalYear: number) => Promise<MonthlySpend[]>;
  createBudgetItem: (data: CreateBudgetItemData) => Promise<BudgetItem | null>;
  updateBudgetItem: (id: string, data: UpdateBudgetItemData) => Promise<BudgetItem | null>;
  deleteBudgetItem: (id: string) => Promise<boolean>;
  fetchExpenses: (filters?: ExpenseFilters) => Promise<void>;
  createExpense: (data: CreateExpenseData) => Promise<Expense | null>;
  updateExpense: (id: string, data: UpdateExpenseData) => Promise<Expense | null>;
  approveExpense: (id: string) => Promise<boolean>;
  denyExpense: (id: string) => Promise<boolean>;
  fetchExpensesByCategory: (fiscalYear: number) => Promise<CategorySummary[]>;
  fetchBudgetVsActual: (fiscalYear: number) => Promise<BudgetVsActual[]>;
  fetchCostPerHole: (fiscalYear: number, holeCount?: number) => Promise<number>;
  fetchCostPerAcre: (fiscalYear: number, totalAcres: number) => Promise<number>;
}

export function useBudget(): UseBudgetReturn {
  const [budgetItems, setBudgetItems] = useState<BudgetItemWithSpent[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  /**
   * Fetch all budget items for a fiscal year with spent amounts
   */
  const fetchBudget = useCallback(
    async (fiscalYear: number) => {
      setLoading(true);
      setError(null);

      try {
        // Fetch budget items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: items, error: itemsError } = await (supabase.from("budget_items") as any)
          .select("*")
          .eq("fiscal_year", fiscalYear)
          .order("category", { ascending: true })
          .order("month", { ascending: true, nullsFirst: true })
          .limit(100); // Limit budget items

        if (itemsError) {
          throw new Error(itemsError.message);
        }

        // For each item, calculate spent amount from expenses
        const itemsWithSpent: BudgetItemWithSpent[] = await Promise.all(
          (items || []).map(async (item: BudgetItem) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: expenseData } = await (supabase.from("expenses") as any)
              .select("amount")
              .eq("budget_item_id", item.id)
              .in("status", ["approved", "paid"]);

            const spent = expenseData?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0;
            const remaining = item.budgeted_amount - spent;
            const percent_used = item.budgeted_amount > 0
              ? Math.round((spent / item.budgeted_amount) * 100)
              : 0;

            return {
              ...item,
              spent,
              remaining,
              percent_used,
            };
          })
        );

        setBudgetItems(itemsWithSpent);
      } catch (err) {
        console.error("Error fetching budget:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch budget");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Fetch budget summary with totals by category
   */
  const fetchBudgetSummary = useCallback(
    async (fiscalYear: number): Promise<BudgetSummary> => {
      const defaultSummary: BudgetSummary = {
        total_budgeted: 0,
        total_spent: 0,
        remaining: 0,
        percent_used: 0,
        by_category: [],
      };

      try {
        // Fetch all budget items for the year
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: items, error: itemsError } = await (supabase.from("budget_items") as any)
          .select("*")
          .eq("fiscal_year", fiscalYear);

        if (itemsError) {
          console.error("Error fetching budget items:", itemsError);
          return defaultSummary;
        }

        // Fetch all approved/paid expenses for these items
        const itemIds = (items || []).map((i: BudgetItem) => i.id);
        let expenses: { budget_item_id: string; amount: number }[] = [];

        if (itemIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: expenseData } = await (supabase.from("expenses") as any)
            .select("budget_item_id, amount")
            .in("budget_item_id", itemIds)
            .in("status", ["approved", "paid"]);

          expenses = expenseData || [];
        }

        // Also fetch expenses without budget items (for the fiscal year date range)
        const fiscalYearStart = `${fiscalYear}-01-01`;
        const fiscalYearEnd = `${fiscalYear}-12-31`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: unbucketedExpenses } = await (supabase.from("expenses") as any)
          .select("amount")
          .is("budget_item_id", null)
          .gte("expense_date", fiscalYearStart)
          .lte("expense_date", fiscalYearEnd)
          .in("status", ["approved", "paid"]);

        const unbucketedTotal = unbucketedExpenses?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0;

        // Group by category
        const categoryMap = new Map<BudgetCategory, { budgeted: number; spent: number }>();

        // Initialize all categories
        (Object.keys(budgetCategoryLabels) as BudgetCategory[]).forEach((cat) => {
          categoryMap.set(cat, { budgeted: 0, spent: 0 });
        });

        // Sum budgeted amounts by category
        (items || []).forEach((item: BudgetItem) => {
          const current = categoryMap.get(item.category)!;
          current.budgeted += item.budgeted_amount;
        });

        // Sum spent amounts by category
        expenses.forEach((expense) => {
          const item = items?.find((i: BudgetItem) => i.id === expense.budget_item_id);
          if (item) {
            const current = categoryMap.get(item.category)!;
            current.spent += expense.amount;
          }
        });

        // Calculate totals
        let totalBudgeted = 0;
        let totalSpent = unbucketedTotal;

        const byCategory: CategorySummary[] = [];

        categoryMap.forEach((data, category) => {
          totalBudgeted += data.budgeted;
          totalSpent += data.spent;

          if (data.budgeted > 0 || data.spent > 0) {
            const remaining = data.budgeted - data.spent;
            const percent_used = data.budgeted > 0
              ? Math.round((data.spent / data.budgeted) * 100)
              : data.spent > 0 ? 100 : 0;

            byCategory.push({
              category,
              budgeted: data.budgeted,
              spent: data.spent,
              remaining,
              percent_used,
            });
          }
        });

        // Sort by budgeted amount descending
        byCategory.sort((a, b) => b.budgeted - a.budgeted);

        const remaining = totalBudgeted - totalSpent;
        const percent_used = totalBudgeted > 0
          ? Math.round((totalSpent / totalBudgeted) * 100)
          : 0;

        return {
          total_budgeted: totalBudgeted,
          total_spent: totalSpent,
          remaining,
          percent_used,
          by_category: byCategory,
        };
      } catch (err) {
        console.error("Error fetching budget summary:", err);
        return defaultSummary;
      }
    },
    [supabase]
  );

  /**
   * Fetch monthly spend totals for trending chart
   */
  const fetchMonthlySpend = useCallback(
    async (fiscalYear: number): Promise<MonthlySpend[]> => {
      try {
        const fiscalYearStart = `${fiscalYear}-01-01`;
        const fiscalYearEnd = `${fiscalYear}-12-31`;

        // Fetch all approved/paid expenses for the year
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: expenses, error: expenseError } = await (supabase.from("expenses") as any)
          .select("expense_date, amount")
          .gte("expense_date", fiscalYearStart)
          .lte("expense_date", fiscalYearEnd)
          .in("status", ["approved", "paid"]);

        if (expenseError) {
          console.error("Error fetching expenses:", expenseError);
          return [];
        }

        // Fetch monthly budget allocations if any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: monthlyBudgets } = await (supabase.from("budget_items") as any)
          .select("month, budgeted_amount")
          .eq("fiscal_year", fiscalYear)
          .not("month", "is", null);

        // Group expenses by month
        const monthlyTotals = new Map<number, number>();
        const monthlyBudgetTotals = new Map<number, number>();

        // Initialize all months
        for (let i = 1; i <= 12; i++) {
          monthlyTotals.set(i, 0);
          monthlyBudgetTotals.set(i, 0);
        }

        // Sum expenses by month
        (expenses || []).forEach((expense: { expense_date: string; amount: number }) => {
          const month = new Date(expense.expense_date).getMonth() + 1;
          const current = monthlyTotals.get(month) || 0;
          monthlyTotals.set(month, current + expense.amount);
        });

        // Sum budgets by month
        (monthlyBudgets || []).forEach((item: { month: number | null; budgeted_amount: number }) => {
          if (item.month) {
            const current = monthlyBudgetTotals.get(item.month) || 0;
            monthlyBudgetTotals.set(item.month, current + item.budgeted_amount);
          }
        });

        // Build result array
        const result: MonthlySpend[] = [];
        for (let i = 1; i <= 12; i++) {
          const budgeted = monthlyBudgetTotals.get(i) || 0;
          result.push({
            month: i,
            month_name: monthNames[i - 1],
            amount: monthlyTotals.get(i) || 0,
            budgeted: budgeted > 0 ? budgeted : undefined,
          });
        }

        return result;
      } catch (err) {
        console.error("Error fetching monthly spend:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Create a new budget item
   */
  const createBudgetItem = useCallback(
    async (data: CreateBudgetItemData): Promise<BudgetItem | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newItem, error: createError } = await (supabase.from("budget_items") as any)
          .insert(data)
          .select()
          .single();

        if (createError) {
          throw new Error(createError.message);
        }

        return newItem;
      } catch (err) {
        console.error("Error creating budget item:", err);
        setError(err instanceof Error ? err.message : "Failed to create budget item");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Update a budget item
   */
  const updateBudgetItem = useCallback(
    async (id: string, data: UpdateBudgetItemData): Promise<BudgetItem | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedItem, error: updateError } = await (supabase.from("budget_items") as any)
          .update(data)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setBudgetItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, ...updatedItem }
              : item
          )
        );

        return updatedItem;
      } catch (err) {
        console.error("Error updating budget item:", err);
        setError(err instanceof Error ? err.message : "Failed to update budget item");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Delete a budget item
   */
  const deleteBudgetItem = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // Check if there are linked expenses
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (supabase.from("expenses") as any)
          .select("*", { count: "exact", head: true })
          .eq("budget_item_id", id);

        if (count && count > 0) {
          setError("Cannot delete budget item with linked expenses");
          return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase.from("budget_items") as any)
          .delete()
          .eq("id", id);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Update local state
        setBudgetItems((prev) => prev.filter((item) => item.id !== id));

        return true;
      } catch (err) {
        console.error("Error deleting budget item:", err);
        setError(err instanceof Error ? err.message : "Failed to delete budget item");
        return false;
      }
    },
    [supabase]
  );

  /**
   * Fetch expenses with optional filters
   */
  const fetchExpenses = useCallback(
    async (filters?: ExpenseFilters) => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase.from("expenses") as any).select("*");

        // Apply filters
        if (filters?.budgetItemId) {
          query = query.eq("budget_item_id", filters.budgetItemId);
        }
        if (filters?.status) {
          query = query.eq("status", filters.status);
        }
        if (filters?.vendor) {
          query = query.ilike("vendor", `%${filters.vendor}%`);
        }
        if (filters?.startDate) {
          query = query.gte("expense_date", filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte("expense_date", filters.endDate);
        }
        if (filters?.submittedBy) {
          query = query.eq("submitted_by", filters.submittedBy);
        }

        query = query.order("expense_date", { ascending: false });
        query = query.limit(200); // Limit expenses list

        const { data, error: fetchError } = await query as { data: Expense[] | null; error: { message: string } | null };

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Fetch budget items for these expenses
        const budgetItemIds = [...new Set((data || [])
          .map((e) => e.budget_item_id)
          .filter(Boolean))] as string[];

        const budgetItemsMap = new Map<string, BudgetItem>();
        if (budgetItemIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: items } = await (supabase.from("budget_items") as any)
            .select("*")
            .in("id", budgetItemIds);

          (items || []).forEach((item: BudgetItem) => {
            budgetItemsMap.set(item.id, item);
          });
        }

        // Filter by category if specified (requires budget item lookup)
        let filteredData = data || [];
        if (filters?.category) {
          filteredData = filteredData.filter((expense) => {
            if (!expense.budget_item_id) return false;
            const item = budgetItemsMap.get(expense.budget_item_id);
            return item?.category === filters.category;
          });
        }

        // Fetch profile info for submitters
        const submitterIds = [...new Set(filteredData
          .map((e) => e.submitted_by)
          .filter(Boolean))] as string[];

        const profilesMap = new Map<string, Profile>();
        if (submitterIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: profiles } = await (supabase.from("profiles") as any)
            .select("*")
            .in("id", submitterIds);

          (profiles || []).forEach((profile: Profile) => {
            profilesMap.set(profile.id, profile);
          });
        }

        // Build expenses with details
        const expensesWithDetails: ExpenseWithDetails[] = filteredData.map((expense) => ({
          ...expense,
          budget_item: expense.budget_item_id
            ? budgetItemsMap.get(expense.budget_item_id)
            : undefined,
          submitted_by_profile: expense.submitted_by
            ? profilesMap.get(expense.submitted_by)
            : undefined,
        }));

        setExpenses(expensesWithDetails);
      } catch (err) {
        console.error("Error fetching expenses:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch expenses");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Create a new expense
   */
  const createExpense = useCallback(
    async (data: CreateExpenseData): Promise<Expense | null> => {
      setLoading(true);
      setError(null);

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Auto-approve if amount is <= $500, otherwise pending
        const status: ExpenseStatus = data.amount > 500 ? "pending" : "approved";

        const expenseData = {
          ...data,
          submitted_by: user?.id || null,
          status,
          approved_by: status === "approved" ? user?.id : null,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newExpense, error: createError } = await (supabase.from("expenses") as any)
          .insert(expenseData)
          .select()
          .single();

        if (createError) {
          throw new Error(createError.message);
        }

        return newExpense;
      } catch (err) {
        console.error("Error creating expense:", err);
        setError(err instanceof Error ? err.message : "Failed to create expense");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Update an expense
   */
  const updateExpense = useCallback(
    async (id: string, data: UpdateExpenseData): Promise<Expense | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedExpense, error: updateError } = await (supabase.from("expenses") as any)
          .update(data)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setExpenses((prev) =>
          prev.map((expense) =>
            expense.id === id
              ? { ...expense, ...updatedExpense }
              : expense
          )
        );

        return updatedExpense;
      } catch (err) {
        console.error("Error updating expense:", err);
        setError(err instanceof Error ? err.message : "Failed to update expense");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Approve an expense
   */
  const approveExpense = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from("expenses") as any)
          .update({
            status: "approved",
            approved_by: user?.id,
          })
          .eq("id", id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setExpenses((prev) =>
          prev.map((expense) =>
            expense.id === id
              ? { ...expense, status: "approved" as ExpenseStatus, approved_by: user?.id ?? null }
              : expense
          )
        );

        return true;
      } catch (err) {
        console.error("Error approving expense:", err);
        setError(err instanceof Error ? err.message : "Failed to approve expense");
        return false;
      }
    },
    [supabase]
  );

  /**
   * Deny an expense
   */
  const denyExpense = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from("expenses") as any)
          .update({
            status: "denied",
            approved_by: user?.id,
          })
          .eq("id", id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setExpenses((prev) =>
          prev.map((expense) =>
            expense.id === id
              ? { ...expense, status: "denied" as ExpenseStatus, approved_by: user?.id ?? null }
              : expense
          )
        );

        return true;
      } catch (err) {
        console.error("Error denying expense:", err);
        setError(err instanceof Error ? err.message : "Failed to deny expense");
        return false;
      }
    },
    [supabase]
  );

  /**
   * Fetch expenses grouped by category for pie chart
   */
  const fetchExpensesByCategory = useCallback(
    async (fiscalYear: number): Promise<CategorySummary[]> => {
      try {
        const summary = await fetchBudgetSummary(fiscalYear);
        return summary.by_category;
      } catch (err) {
        console.error("Error fetching expenses by category:", err);
        return [];
      }
    },
    [fetchBudgetSummary]
  );

  /**
   * Fetch budget vs actual for bar chart
   */
  const fetchBudgetVsActual = useCallback(
    async (fiscalYear: number): Promise<BudgetVsActual[]> => {
      try {
        const summary = await fetchBudgetSummary(fiscalYear);

        return summary.by_category.map((cat) => ({
          category: cat.category,
          budgeted: cat.budgeted,
          actual: cat.spent,
          variance: cat.budgeted - cat.spent,
          over_budget: cat.spent > cat.budgeted,
        }));
      } catch (err) {
        console.error("Error fetching budget vs actual:", err);
        return [];
      }
    },
    [fetchBudgetSummary]
  );

  /**
   * Calculate cost per hole
   */
  const fetchCostPerHole = useCallback(
    async (fiscalYear: number, holeCount: number = 18): Promise<number> => {
      try {
        const summary = await fetchBudgetSummary(fiscalYear);
        return summary.total_spent / holeCount;
      } catch (err) {
        console.error("Error calculating cost per hole:", err);
        return 0;
      }
    },
    [fetchBudgetSummary]
  );

  /**
   * Calculate cost per acre
   */
  const fetchCostPerAcre = useCallback(
    async (fiscalYear: number, totalAcres: number): Promise<number> => {
      try {
        if (totalAcres <= 0) return 0;
        const summary = await fetchBudgetSummary(fiscalYear);
        return summary.total_spent / totalAcres;
      } catch (err) {
        console.error("Error calculating cost per acre:", err);
        return 0;
      }
    },
    [fetchBudgetSummary]
  );

  return {
    budgetItems,
    expenses,
    loading,
    error,
    fetchBudget,
    fetchBudgetSummary,
    fetchMonthlySpend,
    createBudgetItem,
    updateBudgetItem,
    deleteBudgetItem,
    fetchExpenses,
    createExpense,
    updateExpense,
    approveExpense,
    denyExpense,
    fetchExpensesByCategory,
    fetchBudgetVsActual,
    fetchCostPerHole,
    fetchCostPerAcre,
  };
}
