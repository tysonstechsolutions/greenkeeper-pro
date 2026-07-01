"use client";

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
import type { MonthlySpend } from "@/lib/hooks/useBudget";

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

export interface BudgetBarDatum {
  category: string;
  shortCategory: string;
  budgeted: number;
  actual: number;
  overBudget: boolean;
}

export interface BudgetPieDatum {
  name: string;
  value: number;
  color: string;
}

export function BudgetVsActualChart({ data }: { data: BudgetBarDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
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
  );
}

export function SpendingByCategoryChart({ data }: { data: BudgetPieDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
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
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(typeof value === "number" ? value : 0)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MonthlySpendChart({ data }: { data: MonthlySpend[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart
        data={data}
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
        {data.some((m) => m.budgeted) && (
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
  );
}
