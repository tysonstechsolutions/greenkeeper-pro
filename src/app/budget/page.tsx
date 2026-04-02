"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  FileText,
  Calculator,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBudget,
  budgetCategoryLabels,
  budgetCategoryColors,
  type BudgetSummary,
  type MonthlySpend,
  type BudgetVsActual,
} from "@/lib/hooks/useBudget";
import { useAuth } from "@/lib/hooks/useAuth";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import type { BudgetCategory } from "@/types/database";

// Circular progress component for % used
function CircularProgress({
  value,
  size = 80,
  strokeWidth = 8,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const color = value > 90 ? "#ef4444" : value > 75 ? "#eab308" : "#22c55e";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-muted"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={color}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
    </div>
  );
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

// Custom tooltip for charts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3">
        <p className="font-medium">{label}</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function BudgetPage() {
  const router = useRouter();
  const { user, isSuper: isSuperRole } = useAuth();
  const {
    fetchBudgetSummary,
    fetchMonthlySpend,
    fetchBudgetVsActual,
    fetchCostPerHole,
    fetchCostPerAcre,
  } = useBudget();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [monthlySpend, setMonthlySpend] = useState<MonthlySpend[]>([]);
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual[]>([]);
  const [costPerHole, setCostPerHole] = useState(0);
  const [costPerAcre, setCostPerAcre] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  const isSuper = isSuperRole;

  // Fetch all budget data
  useEffect(() => {
    async function loadData() {
      setLoadingData(true);
      try {
        const [summaryData, monthlyData, budgetActualData, cphData, cpaData] =
          await Promise.all([
            fetchBudgetSummary(fiscalYear),
            fetchMonthlySpend(fiscalYear),
            fetchBudgetVsActual(fiscalYear),
            fetchCostPerHole(fiscalYear, 18),
            fetchCostPerAcre(fiscalYear, 150),
          ]);

        setSummary(summaryData);
        setMonthlySpend(monthlyData);
        setBudgetVsActual(budgetActualData);
        setCostPerHole(cphData);
        setCostPerAcre(cpaData);
      } catch (err) {
        console.error("Error loading budget data:", err);
      } finally {
        setLoadingData(false);
      }
    }
    loadData();
  }, [
    fiscalYear,
    fetchBudgetSummary,
    fetchMonthlySpend,
    fetchBudgetVsActual,
    fetchCostPerHole,
    fetchCostPerAcre,
  ]);

  // Prepare pie chart data
  const pieData = summary?.by_category.map((cat) => ({
    name: budgetCategoryLabels[cat.category],
    value: cat.spent,
    color: budgetCategoryColors[cat.category],
  })) || [];

  // Prepare bar chart data
  const barData = budgetVsActual.map((item) => ({
    category: budgetCategoryLabels[item.category],
    shortCategory: budgetCategoryLabels[item.category].substring(0, 8),
    budgeted: item.budgeted,
    actual: item.actual,
    overBudget: item.over_budget,
  }));

  // Handle row click for category filter
  const handleCategoryClick = (category: BudgetCategory) => {
    router.push(`/budget/expenses?category=${category}`);
  };

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      {loadingData ? (
        <div className="p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            Budget
          </h1>
          <p className="text-sm text-muted-foreground">
            Track expenses and manage your budget
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFiscalYear((y) => y - 1)}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-lg min-w-[60px] text-center">
            {fiscalYear}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFiscalYear((y) => y + 1)}
            disabled={fiscalYear >= currentYear}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
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
                (summary?.remaining || 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(summary?.remaining || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <PieChartIcon className="w-4 h-4" />
                <span className="text-sm">% Used</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {summary?.percent_used || 0}% of budget
              </p>
            </div>
            <CircularProgress value={summary?.percent_used || 0} />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Button onClick={() => router.push("/budget/expense/new")}>
          <Plus className="w-4 h-4 mr-2" />
          Log Expense
        </Button>
        {isSuper && (
          <Button variant="outline" onClick={() => router.push("/budget/setup")}>
            <Settings className="w-4 h-4 mr-2" />
            Edit Budget
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push("/budget/expenses")}>
          <FileText className="w-4 h-4 mr-2" />
          View All Expenses
        </Button>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Budget vs Actual Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Budget vs Actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="shortCategory" width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="budgeted" name="Budgeted" fill="#3b82f6" />
                  <Bar dataKey="actual" name="Actual" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No budget data for {fiscalYear}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spending by Category Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="w-4 h-4" />
              Spending by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${(name || "").substring(0, 6)}.. ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(typeof value === "number" ? value : 0)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No spending data for {fiscalYear}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Spend Trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Monthly Spending Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlySpend.some((m) => m.amount > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart
                data={monthlySpend}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month_name"
                  tickFormatter={(v) => v.substring(0, 3)}
                />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name="Spent"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                {monthlySpend.some((m) => m.budgeted) && (
                  <Line
                    type="monotone"
                    dataKey="budgeted"
                    name="Budget"
                    stroke="#9ca3af"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No monthly spend data for {fiscalYear}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Breakdown Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="w-[150px]">% Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary?.by_category && summary.by_category.length > 0 ? (
                summary.by_category.map((cat) => (
                  <TableRow
                    key={cat.category}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleCategoryClick(cat.category)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: budgetCategoryColors[cat.category],
                          }}
                        />
                        {budgetCategoryLabels[cat.category]}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(cat.budgeted)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(cat.spent)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        cat.remaining < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {formatCurrency(cat.remaining)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(cat.percent_used, 100)}
                          className={`h-2 flex-1 ${
                            cat.percent_used > 90
                              ? "[&>div]:bg-red-500"
                              : cat.percent_used > 75
                              ? "[&>div]:bg-yellow-500"
                              : "[&>div]:bg-green-500"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium min-w-[40px] text-right ${
                            cat.percent_used > 90
                              ? "text-red-600"
                              : cat.percent_used > 75
                              ? "text-yellow-600"
                              : ""
                          }`}
                        >
                          {cat.percent_used}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No budget categories set up for {fiscalYear}
                    {isSuper && (
                      <Link
                        href="/budget/setup"
                        className="block mt-2 text-primary hover:underline"
                      >
                        Set up budget
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Cost Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                Cost Per Hole
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(costPerHole)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total / 18 holes
              </div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                Cost Per Acre
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(costPerAcre)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total / 150 acres
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
      )}
    </RoleGuard>
  );
}
