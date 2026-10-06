"use client";

// Two charts for one area: sales by month (this year beside the year before)
// and cost % by month against the target. One axis each.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthName, type AreaMonth } from "@/lib/performance/performance";

const THIS_YEAR = "#2D6A4F";
const YEAR_BEFORE = "#A3B1BF";
const UNDER = "#2F855A";
const OVER = "#C53030";
const TARGET = "#475569";
/** Cost % bars stop here so one odd month doesn't flatten the rest. */
const PCT_CAP = 200;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const axis = { fontSize: 11, fill: "currentColor" };

export function SalesChart({ months }: { months: AreaMonth[] }) {
  const data = months.map((m) => ({
    month: monthName(m.key, false),
    full: monthName(m.key),
    thisYear: m.sales,
    yearBefore: m.lastYearSales,
  }));
  return (
    <div className="h-56 text-muted-foreground" role="img" aria-label="Sales by month, this year and the year before">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${Math.round(Number(v) / 100) / 10}k`} />
          <Tooltip
            labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
            formatter={(v, name) => [v == null ? "no report" : money(Number(v)), name]}
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="thisYear" name="This year" fill={THIS_YEAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="yearBefore" name="Year before" fill={YEAR_BEFORE} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostPctChart({ months, target }: { months: AreaMonth[]; target: number }) {
  const data = months.map((m) => ({
    month: monthName(m.key, false),
    full: monthName(m.key),
    pct: m.pct == null ? null : Math.min(PCT_CAP, Math.max(0, m.pct)),
    actual: m.pct,
  }));
  return (
    <div className="h-64 text-muted-foreground flex flex-col" role="img" aria-label={`Cost as a percent of sales by month, against the ${target}% target`}>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={40} domain={[0, (max: number) => Math.ceil(Math.max(target * 1.5, max) / 25) * 25]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
            formatter={(_, __, p) => {
              const actual = (p?.payload as { actual: number | null })?.actual;
              return [actual == null ? "no cost or sales" : `${actual}% (target ${target}%)`, "Cost of sales"];
            }}
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <ReferenceLine y={target} stroke={TARGET} strokeDasharray="4 3" strokeWidth={2} ifOverflow="extendDomain" />
          <Bar dataKey="pct" name="Cost of sales" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.month + d.full} fill={(d.actual ?? 0) > target ? OVER : UNDER} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-4 text-xs mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: UNDER }} /> At or under target</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: OVER }} /> Over target</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: TARGET }} /> Target {target}%</span>
      </div>
    </div>
  );
}

export const CHART_KEY = { UNDER, OVER, PCT_CAP };
