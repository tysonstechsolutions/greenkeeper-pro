"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  DollarSign,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useBudget,
  budgetCategoryLabels,
  budgetCategoryColors,
} from "@/lib/hooks/useBudget";
import { RoleGuard, ADMIN_ROLES } from "@/components/auth/role-guard";
import type { BudgetCategory } from "@/types/database";

// Month names
const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

interface BudgetLineItem {
  id?: string;
  category: BudgetCategory;
  annual_amount: number;
  monthly_breakdown: number[];
  use_monthly: boolean;
  plan_goal_id?: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BudgetSetupPage() {
  const router = useRouter();
  const {
    budgetItems,
    fetchBudget,
    createBudgetItem,
    updateBudgetItem,
  } = useBudget();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<BudgetCategory | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load existing budget data
  useEffect(() => {
    async function loadBudget() {
      await fetchBudget(fiscalYear);
    }
    loadBudget();
  }, [fiscalYear, fetchBudget]);

  // Convert budget items to line items format
  useEffect(() => {
    const categoryMap = new Map<BudgetCategory, BudgetLineItem>();

    // Initialize all categories
    (Object.keys(budgetCategoryLabels) as BudgetCategory[]).forEach((cat) => {
      categoryMap.set(cat, {
        category: cat,
        annual_amount: 0,
        monthly_breakdown: Array(12).fill(0),
        use_monthly: false,
      });
    });

    // Process existing budget items
    budgetItems.forEach((item) => {
      const existing = categoryMap.get(item.category);
      if (existing) {
        if (item.month) {
          // Monthly item
          existing.use_monthly = true;
          existing.monthly_breakdown[item.month - 1] = item.budgeted_amount;
          existing.annual_amount = existing.monthly_breakdown.reduce((a, b) => a + b, 0);
        } else {
          // Annual item
          existing.id = item.id;
          existing.annual_amount = item.budgeted_amount;
          existing.plan_goal_id = item.plan_goal_id || undefined;
        }
      }
    });

    setLineItems(Array.from(categoryMap.values()));
    setHasChanges(false);
  }, [budgetItems]);

  // Handle annual amount change
  const handleAnnualChange = (category: BudgetCategory, value: string) => {
    const amount = parseFloat(value) || 0;
    setLineItems((prev) =>
      prev.map((item) =>
        item.category === category
          ? {
              ...item,
              annual_amount: amount,
              monthly_breakdown: item.use_monthly
                ? item.monthly_breakdown
                : Array(12).fill(amount / 12),
            }
          : item
      )
    );
    setHasChanges(true);
  };

  // Handle monthly amount change
  const handleMonthlyChange = (category: BudgetCategory, monthIndex: number, value: string) => {
    const amount = parseFloat(value) || 0;
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.category !== category) return item;
        const newBreakdown = [...item.monthly_breakdown];
        newBreakdown[monthIndex] = amount;
        return {
          ...item,
          monthly_breakdown: newBreakdown,
          annual_amount: newBreakdown.reduce((a, b) => a + b, 0),
        };
      })
    );
    setHasChanges(true);
  };

  // Toggle monthly breakdown
  const toggleMonthlyBreakdown = (category: BudgetCategory) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.category !== category) return item;
        if (item.use_monthly) {
          // Switching to annual - sum up monthly
          return {
            ...item,
            use_monthly: false,
            annual_amount: item.monthly_breakdown.reduce((a, b) => a + b, 0),
          };
        } else {
          // Switching to monthly - divide evenly
          const monthlyAmount = item.annual_amount / 12;
          return {
            ...item,
            use_monthly: true,
            monthly_breakdown: Array(12).fill(monthlyAmount),
          };
        }
      })
    );
    setHasChanges(true);
  };

  // Divide evenly across months
  const divideEvenly = (category: BudgetCategory) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.category !== category) return item;
        const monthlyAmount = item.annual_amount / 12;
        return {
          ...item,
          monthly_breakdown: Array(12).fill(monthlyAmount),
        };
      })
    );
    setHasChanges(true);
  };

  // Copy from previous year
  const handleCopyFromPreviousYear = async () => {
    await fetchBudget(fiscalYear - 1);
    // The effect will update lineItems
    setShowCopyDialog(false);
    setFiscalYear(fiscalYear); // Refresh current year
  };

  // Save budget
  const handleSave = async () => {
    setSaving(true);

    try {
      // Process each category
      for (const item of lineItems) {
        if (item.annual_amount <= 0) continue;

        if (item.use_monthly) {
          // Create/update monthly items
          for (let month = 1; month <= 12; month++) {
            const amount = item.monthly_breakdown[month - 1];
            if (amount > 0) {
              await createBudgetItem({
                fiscal_year: fiscalYear,
                category: item.category,
                budgeted_amount: amount,
                month,
              });
            }
          }
        } else {
          // Create/update annual item
          if (item.id) {
            await updateBudgetItem(item.id, {
              budgeted_amount: item.annual_amount,
            });
          } else {
            await createBudgetItem({
              fiscal_year: fiscalYear,
              category: item.category,
              budgeted_amount: item.annual_amount,
            });
          }
        }
      }

      setHasChanges(false);
      router.push("/budget");
    } catch (err) {
      console.error("Error saving budget:", err);
    } finally {
      setSaving(false);
    }
  };

  // Calculate total
  const totalBudget = lineItems.reduce((sum, item) => sum + item.annual_amount, 0);

  return (
    <RoleGuard allowedRoles={ADMIN_ROLES}>
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Budget Setup</h1>
          <p className="text-sm text-muted-foreground">
            Configure your annual budget by category
          </p>
        </div>
      </div>

      {/* Year Selector & Actions */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFiscalYear((y) => y - 1)}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-lg min-w-[80px] text-center">
            FY {fiscalYear}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFiscalYear((y) => y + 1)}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowCopyDialog(true)}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy from {fiscalYear - 1}
          </Button>
        </div>
      </div>

      {/* Total Budget Card */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Budget</p>
              <p className="text-3xl font-bold">{formatCurrency(totalBudget)}</p>
            </div>
            <DollarSign className="w-10 h-10 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Budget Categories */}
      <div className="space-y-4 mb-6">
        {lineItems.map((item) => (
          <Card key={item.category}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: budgetCategoryColors[item.category] }}
                  />
                  {budgetCategoryLabels[item.category]}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMonthlyBreakdown(item.category)}
                  >
                    {item.use_monthly ? "Use Annual" : "Monthly Breakdown"}
                  </Button>
                  {expandedCategory === item.category ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedCategory(null)}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedCategory(item.category)}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Annual Input */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Annual Budget
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="100"
                      value={item.annual_amount || ""}
                      onChange={(e) => handleAnnualChange(item.category, e.target.value)}
                      placeholder="0"
                      className="pl-9"
                      disabled={item.use_monthly}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Monthly Avg</p>
                  <p className="font-medium">
                    {formatCurrency(item.annual_amount / 12)}
                  </p>
                </div>
              </div>

              {/* Monthly Breakdown */}
              {(item.use_monthly || expandedCategory === item.category) && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">
                      Monthly Breakdown
                    </span>
                    {item.use_monthly && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => divideEvenly(item.category)}
                      >
                        Divide Evenly
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                    {monthNames.map((month, index) => (
                      <div key={month}>
                        <label className="text-xs text-muted-foreground block mb-1 text-center">
                          {month}
                        </label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="100"
                          value={item.monthly_breakdown[index] || ""}
                          onChange={(e) =>
                            handleMonthlyChange(item.category, index, e.target.value)
                          }
                          placeholder="0"
                          className="text-center text-sm px-1"
                          disabled={!item.use_monthly}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Budget
        </Button>
      </div>

      {/* Copy from Previous Year Dialog */}
      <AlertDialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy from Previous Year</AlertDialogTitle>
            <AlertDialogDescription>
              This will copy all budget amounts from FY {fiscalYear - 1} to FY{" "}
              {fiscalYear}. Any existing budget data for {fiscalYear} will be
              preserved, but you can modify the values before saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyFromPreviousYear}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </RoleGuard>
  );
}
