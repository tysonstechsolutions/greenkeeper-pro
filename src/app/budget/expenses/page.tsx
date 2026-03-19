"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Filter,
  Download,
  Check,
  X,
  ChevronDown,
  Receipt,
  Calendar,
  DollarSign,
  Building2,
  AlertCircle,
  Loader2,
  Eye,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  expenseStatusLabels,
  expenseStatusColors,
  type ExpenseWithDetails,
} from "@/lib/hooks/useBudget";
import { useAuth } from "@/lib/hooks/useAuth";
import type { BudgetCategory, ExpenseStatus } from "@/types/database";

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ExpensesListPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    expenses,
    fetchExpenses,
    approveExpense,
    denyExpense,
    loading,
    error,
  } = useBudget();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<BudgetCategory | "all">(
    "all"
  );
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "year">(
    "month"
  );

  // UI state
  const [selectedExpense, setSelectedExpense] =
    useState<ExpenseWithDetails | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDenyDialog, setShowDenyDialog] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  // Permission check
  const canApprove = user?.role === "super";

  // Calculate date range filters
  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo.toISOString().split("T")[0];
      case "month":
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo.toISOString().split("T")[0];
      case "year":
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        return yearAgo.toISOString().split("T")[0];
      default:
        return undefined;
    }
  };

  // Load expenses on mount and when filters change
  useEffect(() => {
    const startDate = getDateFilter();
    fetchExpenses({
      status: statusFilter !== "all" ? statusFilter : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      startDate,
    });
  }, [fetchExpenses, statusFilter, categoryFilter, dateRange]);

  // Filter expenses by search query
  const filteredExpenses = useMemo(() => {
    if (!searchQuery.trim()) return expenses;

    const query = searchQuery.toLowerCase();
    return expenses.filter(
      (expense) =>
        expense.description.toLowerCase().includes(query) ||
        expense.vendor?.toLowerCase().includes(query) ||
        expense.budget_item?.category.toLowerCase().includes(query)
    );
  }, [expenses, searchQuery]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredExpenses.reduce(
      (acc, expense) => {
        acc.total += expense.amount;
        if (expense.status === "pending") acc.pending += expense.amount;
        if (expense.status === "approved") acc.approved += expense.amount;
        if (expense.status === "paid") acc.paid += expense.amount;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, paid: 0 }
    );
  }, [filteredExpenses]);

  // Handle approve
  const handleApprove = async () => {
    if (!selectedExpense) return;
    setProcessing(selectedExpense.id);
    const success = await approveExpense(selectedExpense.id);
    if (success) {
      setShowApproveDialog(false);
      setSelectedExpense(null);
    }
    setProcessing(null);
  };

  // Handle deny
  const handleDeny = async () => {
    if (!selectedExpense) return;
    setProcessing(selectedExpense.id);
    const success = await denyExpense(selectedExpense.id);
    if (success) {
      setShowDenyDialog(false);
      setSelectedExpense(null);
    }
    setProcessing(null);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      "Date",
      "Description",
      "Category",
      "Vendor",
      "Amount",
      "Status",
      "Notes",
    ];
    const rows = filteredExpenses.map((expense) => [
      expense.expense_date,
      expense.description,
      expense.budget_item?.category
        ? budgetCategoryLabels[expense.budget_item.category]
        : "Uncategorized",
      expense.vendor || "",
      expense.amount.toFixed(2),
      expenseStatusLabels[expense.status],
      expense.notes || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `expenses_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  // Get status badge variant
  const getStatusBadgeVariant = (
    status: ExpenseStatus
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "approved":
        return "default";
      case "pending":
        return "secondary";
      case "denied":
        return "destructive";
      case "paid":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            View and manage all expenses
          </p>
        </div>
        <Button onClick={() => router.push("/budget/expense/new")}>
          <Plus className="w-4 h-4 mr-2" />
          Log Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-xl font-semibold">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: expenseStatusColors.pending }}
              />
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <p className="text-xl font-semibold">
              {formatCurrency(totals.pending)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: expenseStatusColors.approved }}
              />
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
            <p className="text-xl font-semibold">
              {formatCurrency(totals.approved)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: expenseStatusColors.paid }}
              />
              <p className="text-sm text-muted-foreground">Paid</p>
            </div>
            <p className="text-xl font-semibold">{formatCurrency(totals.paid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as ExpenseStatus | "all")
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select
          value={categoryFilter}
          onValueChange={(value) =>
            setCategoryFilter(value as BudgetCategory | "all")
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(budgetCategoryLabels) as BudgetCategory[]).map(
              (cat) => (
                <SelectItem key={cat} value={cat}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: budgetCategoryColors[cat] }}
                    />
                    {budgetCategoryLabels[cat]}
                  </div>
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        {/* Date Range Filter */}
        <Select
          value={dateRange}
          onValueChange={(value) =>
            setDateRange(value as "all" | "week" | "month" | "year")
          }
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        {/* Export Button */}
        <Button variant="outline" onClick={exportToCSV}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Expense List */}
      {!loading && filteredExpenses.length === 0 ? (
        <div className="text-center py-12">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium mb-2">No Expenses Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery || statusFilter !== "all" || categoryFilter !== "all"
              ? "Try adjusting your filters"
              : "Start by logging your first expense"}
          </p>
          <Button onClick={() => router.push("/budget/expense/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Log Expense
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => (
            <Card key={expense.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    {/* Category & Date */}
                    <div className="flex items-center gap-2 mb-1">
                      {expense.budget_item && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor:
                              budgetCategoryColors[expense.budget_item.category],
                            color:
                              budgetCategoryColors[expense.budget_item.category],
                          }}
                        >
                          {budgetCategoryLabels[expense.budget_item.category]}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(expense.expense_date)}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="font-medium truncate">{expense.description}</p>

                    {/* Vendor & Submitter */}
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {expense.vendor && (
                        <span className="flex items-center gap-1 truncate">
                          <Building2 className="w-3 h-3" />
                          {expense.vendor}
                        </span>
                      )}
                      {expense.submitted_by_profile && (
                        <span className="truncate">
                          by {expense.submitted_by_profile.full_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount & Status */}
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-lg font-semibold">
                      {formatCurrency(expense.amount)}
                    </p>
                    <Badge variant={getStatusBadgeVariant(expense.status)}>
                      {expenseStatusLabels[expense.status]}
                    </Badge>
                  </div>
                </div>

                {/* Actions for pending expenses */}
                {expense.status === "pending" && canApprove && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => {
                        setSelectedExpense(expense);
                        setShowApproveDialog(true);
                      }}
                      disabled={processing === expense.id}
                    >
                      {processing === expense.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setSelectedExpense(expense);
                        setShowDenyDialog(true);
                      }}
                      disabled={processing === expense.id}
                    >
                      {processing === expense.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <X className="w-4 h-4 mr-2" />
                      )}
                      Deny
                    </Button>
                  </div>
                )}

                {/* Notes */}
                {expense.notes && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground">{expense.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Expense</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedExpense && (
                <>
                  Are you sure you want to approve this expense?
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="font-medium">{selectedExpense.description}</p>
                    <p className="text-lg font-semibold mt-1">
                      {formatCurrency(selectedExpense.amount)}
                    </p>
                    {selectedExpense.vendor && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Vendor: {selectedExpense.vendor}
                      </p>
                    )}
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deny Dialog */}
      <AlertDialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny Expense</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedExpense && (
                <>
                  Are you sure you want to deny this expense?
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="font-medium">{selectedExpense.description}</p>
                    <p className="text-lg font-semibold mt-1">
                      {formatCurrency(selectedExpense.amount)}
                    </p>
                    {selectedExpense.vendor && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Vendor: {selectedExpense.vendor}
                      </p>
                    )}
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeny}
              className="bg-destructive hover:bg-destructive/90"
            >
              <X className="w-4 h-4 mr-2" />
              Deny
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
