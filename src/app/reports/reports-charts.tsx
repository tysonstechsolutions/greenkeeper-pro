"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export function TaskStatusPieChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={80}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function StaffCompletionChart({
  data,
}: {
  data: { name: string; completed: number; total: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="completed" fill="#40916C" name="Completed" />
        <Bar dataKey="total" fill="#B7E4C7" name="Assigned" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EquipmentCostChart({
  data,
}: {
  data: { equipment_name: string; total_cost: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="equipment_name" width={150} />
        <Tooltip formatter={(value) => [`$${(typeof value === "number" ? value : 0).toLocaleString()}`, "Cost"]} />
        <Bar dataKey="total_cost" fill="#1B4332" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChemicalProductsChart({
  data,
}: {
  data: { product_name: string; total_amount: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip />
        {/* Field is total_amount (see useReports products_summary) — the old
            "total_applied" key matched nothing, so bars always rendered empty. */}
        <Bar dataKey="total_amount" fill="var(--chart-1)" name="Total Applied" />
      </BarChart>
    </ResponsiveContainer>
  );
}
