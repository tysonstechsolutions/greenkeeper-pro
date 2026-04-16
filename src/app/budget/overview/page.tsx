"use client";

import { useState, useEffect } from "react";
import { Loader2, DollarSign, TrendingDown, TrendingUp, PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DetailPageHeader } from "@/components/ui/back-button";
import {
  useBudget,
  budgetCategoryLabels,
  budgetCategoryColors,
  type BudgetSummary,
  type MonthlySpend,
} from "@/lib/hooks/useBudget";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import { createClient } from "@/lib/supabase/client";
import type { BudgetCategory } from "@/types/database";

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Recent expense type
interface RecentExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  vendor: string | null;
  category: string | null;
}

export default function BudgetOverviewPage() {
  const { fetchBudgetSummary, fetchMonthlySpend } = useBudget();

  const currentYear = new Date().getFullYear();
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [monthlySpend, setMonthlySpend] = useState<MonthlySpend[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const [summaryData, monthlyData] = await Promise.all([
          fetchBudgetSummary(currentYear),
          fetchMonthlySpend(currentYear),
        ]);

        setSummary(summaryData);
        setMonthlySpend(monthlyData);

        // Fetch recent expenses with budget item category info
        const fiscalYearStart = `${currentYear}-01-01`;
        const fiscalYearEnd = `${currentYear}-12-31`;
        const { data: expensesData } = await supabase
          .from("expenses")
          .select("id, description, amount, expense_date, vendor, budget_item_id")
          .gte("expense_date", fiscalYearStart)
          .lte("expense_date", fiscalYearEnd)
          .order("expense_date", { ascending: false })
          .limit(10);

        if (expensesData && expensesData.length > 0) {
          // Fetch budget item categories for these expenses
          const budgetItemIds = [
            ...new Set(
              expensesData
                .map((e: { budget_item_id: string | null }) => e.budget_item_id)
                .filter(Boolean)
            ),
          ] as string[];

          const categoryMap = new Map<string, string>();
          if (budgetItemIds.length > 0) {
            const { data: items } = await supabase
              .from("budget_items")
              .select("id, category")
              .in("id", budgetItemIds);

            (items || []).forEach((item: { id: string; category: string }) => {
              categoryMap.set(item.id, item.category);
            });
          }

          setRecentExpenses(
            expensesData.map(
              (e: {
                id: string;
                description: string;
                amount: number;
                expense_date: string;
                vendor: string | null;
                budget_item_id: string | null;
              }) => ({
                id: e.id,
                description: e.description,
                amount: e.amount,
                expense_date: e.expense_date,
                vendor: e.vendor,
                category: e.budget_item_id
                  ? categoryMap.get(e.budget_item_id) || null
                  : null,
              })
            )
          );
        }
      } catch (err) {
        console.error("Error loading budget overview:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentYear, fetchBudgetSummary, fetchMonthlySpend]);

  // Determine % used color
  const percentUsed = summary?.percent_used || 0;
  const percentColor =
    percentUsed > 90
      ? "text-red-600"
      : percentUsed > 75
        ? "text-yellow-600"
        : "text-green-600";
  const percentBg =
    percentUsed > 90
      ? "bg-red-100 dark:bg-red-900/30"
      : percentUsed > 75
        ? "bg-yellow-100 dark:bg-yellow-900/30"
        : "bg-green-100 dark:bg-green-900/30";

  // Find the max monthly spend for bar scaling
  const maxMonthly = Math.max(...monthlySpend.map((m) => m.amount), 1);

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <div className="p-4 md:p-6 pb-24">
        <DetailPageHeader
          backHref="/budget"
          backLabel="Budget"
          title="Budget Overview"
          subtitle={`${currentYear} fiscal year at a glance`}
        />

        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm">Total Budget</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(summary?.total_budgeted || 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-sm">Total Spent</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(summary?.total_spent || 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">Remaining</span>
                  </div>
                  <p
                    className={`text-2xl font-bold ${
                      (summary?.remaining || 0) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(summary?.remaining || 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <PieChartIcon className="w-4 h-4" />
                    <span className="text-sm">% Used</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`text-2xl font-bold ${percentColor}`}>
                      {percentUsed}%
                    </p>
                    <Badge className={`${percentBg} ${percentColor} border-0`}>
                      {percentUsed > 90
                        ? "Over Budget"
                        : percentUsed > 75
                          ? "Caution"
                          : "On Track"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Category Breakdown */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {summary?.by_category && summary.by_category.length > 0 ? (
                  <div className="space-y-4">
                    {summary.by_category.map((cat) => {
                      const label =
                        budgetCategoryLabels[cat.category] || cat.category;
                      const color =
                        budgetCategoryColors[cat.category] || "#6b7280";
                      const pctColor =
                        cat.percent_used > 90
                          ? "text-red-600"
                          : cat.percent_used > 75
                            ? "text-yellow-600"
                            : "text-muted-foreground";

                      return (
                        <div key={cat.category}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-medium text-sm">
                                {label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">
                                {formatCurrency(cat.spent)} /{" "}
                                {formatCurrency(cat.budgeted)}
                              </span>
                              <span
                                className={`font-semibold min-w-[40px] text-right ${pctColor}`}
                              >
                                {cat.percent_used}%
                              </span>
                            </div>
                          </div>
                          <Progress
                            value={Math.min(cat.percent_used, 100)}
                            className={`h-2.5 ${
                              cat.percent_used > 90
                                ? "[&>div]:bg-red-500"
                                : cat.percent_used > 75
                                  ? "[&>div]:bg-yellow-500"
                                  : "[&>div]:bg-green-500"
                            }`}
                          />
                          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>Spent: {formatCurrency(cat.spent)}</span>
                            <span>
                              Remaining: {formatCurrency(cat.remaining)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No budget categories configured for {currentYear}.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Monthly Trend Table */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Monthly Spending</CardTitle>
              </CardHeader>
              <CardContent>
                {monthlySpend.some((m) => m.amount > 0) ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                            Month
                          </th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">
                            Spent
                          </th>
                          {monthlySpend.some((m) => m.budgeted) && (
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">
                              Budgeted
                            </th>
                          )}
                          <th className="py-2 pl-4 font-medium text-muted-foreground w-[40%]">
                            &nbsp;
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlySpend.map((m) => (
                          <tr
                            key={m.month}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="py-2.5 pr-4 font-medium">
                              {m.month_name.substring(0, 3)}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">
                              {m.amount > 0
                                ? formatCurrency(m.amount)
                                : "---"}
                            </td>
                            {monthlySpend.some((ms) => ms.budgeted) && (
                              <td className="py-2.5 px-4 text-right text-muted-foreground tabular-nums">
                                {m.budgeted
                                  ? formatCurrency(m.budgeted)
                                  : "---"}
                              </td>
                            )}
                            <td className="py-2.5 pl-4">
                              <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{
                                    width: `${(m.amount / maxMonthly) * 100}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2">
                          <td className="py-2.5 pr-4 font-bold">Total</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums">
                            {formatCurrency(
                              monthlySpend.reduce((s, m) => s + m.amount, 0)
                            )}
                          </td>
                          {monthlySpend.some((ms) => ms.budgeted) && (
                            <td className="py-2.5 px-4 text-right font-bold text-muted-foreground tabular-nums">
                              {formatCurrency(
                                monthlySpend.reduce(
                                  (s, m) => s + (m.budgeted || 0),
                                  0
                                )
                              )}
                            </td>
                          )}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No monthly spending data for {currentYear}.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentExpenses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">
                            Description
                          </th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">
                            Category
                          </th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentExpenses.map((expense) => {
                          const catLabel = expense.category
                            ? budgetCategoryLabels[
                                expense.category as BudgetCategory
                              ] || expense.category
                            : "Uncategorized";
                          const catColor = expense.category
                            ? budgetCategoryColors[
                                expense.category as BudgetCategory
                              ] || "#6b7280"
                            : "#6b7280";

                          return (
                            <tr
                              key={expense.id}
                              className="border-b last:border-0 hover:bg-muted/30"
                            >
                              <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
                                {new Date(
                                  expense.expense_date
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="font-medium">
                                  {expense.description}
                                </div>
                                {expense.vendor && (
                                  <div className="text-xs text-muted-foreground">
                                    {expense.vendor}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: catColor }}
                                  />
                                  <span className="text-muted-foreground text-xs">
                                    {catLabel}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 pl-4 text-right font-medium tabular-nums">
                                {formatCurrency(expense.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No recent transactions for {currentYear}.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
