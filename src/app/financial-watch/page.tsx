"use client";

import { useMemo } from "react";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  Landmark,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { useFinancialWatch } from "@/lib/financial-watch/load";
import { categoryLabel, revenueCategoryLabel } from "@/lib/financial-watch/labels";
import type { LineStatus } from "@/lib/financial-watch/types";
import { FlagList } from "@/components/features/financial-watch/flag-list";
import { AdvisorChat } from "@/components/features/financial-watch/advisor-chat";
import {
  STATUS_STYLE,
  formatMoney,
  formatSignedPct,
} from "@/components/features/financial-watch/severity";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LINE_BAR: Record<LineStatus, string> = {
  over: "bg-red-500",
  watch: "bg-amber-500",
  ok: "bg-emerald-500",
};

export default function FinancialWatchPage() {
  const { watch, loading, error, reload } = useFinancialWatch();

  return (
    <div className="gk-page mx-auto max-w-3xl">
      <PageHeader
        title="Financial Watch"
        description="Budgets, spend pace, and revenue — watched for what's heading the wrong way."
        icon={Activity}
      >
        <button
          onClick={reload}
          disabled={loading}
          className="gk-card px-3 py-2 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageHeader>

      {loading && !watch && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Reading the books…
        </p>
      )}

      {error && !watch && (
        <div className="gk-card p-5 text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button onClick={reload} className="text-xs underline mt-2">
            Try again
          </button>
        </div>
      )}

      {watch && (
        <div className="space-y-6">
          {/* Headline */}
          <HeadlineStrip watch={watch} />

          {/* What needs attention */}
          <section>
            <p className="gk-section-label mb-2">What needs your attention</p>
            <FlagList flags={watch.flags} />
          </section>

          {/* Operating budget */}
          <LensSection
            icon={Wallet}
            title="Operating budget"
            subtitle={`${watch.operating.calendarYear} · ${Math.round(watch.operating.elapsedFraction * 100)}% through the year`}
            budgeted={watch.operating.totalBudgeted}
            spent={watch.operating.totalSpent}
            remaining={watch.operating.remaining}
            percentUsed={watch.operating.percentUsed}
            paceRatio={watch.operating.paceRatio}
            projected={watch.operating.projectedSpend}
            spentLabel="Spent"
          >
            <MonthlyChart values={watch.operating.monthlySpend} />
            <div className="mt-3 space-y-2">
              {watch.operating.byCategory.map((c) => (
                <BudgetLine
                  key={c.category}
                  name={categoryLabel(c.category)}
                  spent={c.spent}
                  budgeted={c.budgeted}
                  percentUsed={c.percentUsed}
                  status={c.status}
                />
              ))}
            </div>
          </LensSection>

          {/* Procurement */}
          <LensSection
            icon={ShoppingCart}
            title="Procurement (cost centers)"
            subtitle={`FY${String(watch.procurement.fiscalYear).slice(-2)} · ${Math.round(watch.procurement.elapsedFraction * 100)}% through the fiscal year`}
            budgeted={watch.procurement.totalBudget}
            spent={watch.procurement.totalSpent}
            remaining={watch.procurement.remaining}
            percentUsed={watch.procurement.percentUsed}
            paceRatio={watch.procurement.paceRatio}
            projected={watch.procurement.projectedSpend}
            spentLabel="Committed"
          >
            <div className="space-y-2">
              {watch.procurement.byCostCenter.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No cost-center activity yet this fiscal year.
                </p>
              )}
              {watch.procurement.byCostCenter.map((c) => (
                <BudgetLine
                  key={c.costCtr}
                  name={c.label}
                  spent={c.spent}
                  budgeted={c.budget}
                  percentUsed={c.percentUsed}
                  status={c.status}
                />
              ))}
            </div>
          </LensSection>

          {/* Revenue */}
          <RevenueSection watch={watch} />

          {/* Ask the analyst (Phase 2 — grounded in the snapshot above) */}
          <AdvisorChat watch={watch} />

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            Generated {new Date(watch.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Headline ─────────────────────────────────────────────────────────────────

function HeadlineStrip({ watch }: { watch: ReturnType<typeof useFinancialWatch>["watch"] }) {
  if (!watch) return null;
  const status = STATUS_STYLE[watch.headline.overallStatus];
  return (
    <div className={`gk-card p-4 border ${status.border}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {watch.headline.criticalCount} critical · {watch.headline.warningCount} warning
          </span>
        </div>
        {watch.headline.netPositionYtd != null && (
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground leading-none">
              Net position YTD
            </p>
            <p
              className={`text-lg font-bold leading-tight ${
                watch.headline.netPositionYtd >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatMoney(watch.headline.netPositionYtd)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-none">
              revenue − operating spend
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lens section shell ───────────────────────────────────────────────────────

function LensSection({
  icon: Icon,
  title,
  subtitle,
  budgeted,
  spent,
  remaining,
  percentUsed,
  paceRatio,
  projected,
  spentLabel,
  children,
}: {
  icon: typeof Wallet;
  title: string;
  subtitle: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  paceRatio: number | null;
  projected: number | null;
  spentLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="gk-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Budget" value={formatMoney(budgeted)} />
        <Stat label={spentLabel} value={formatMoney(spent)} />
        <Stat
          label="Remaining"
          value={formatMoney(remaining)}
          tone={remaining < 0 ? "bad" : "default"}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>{percentUsed}% used</span>
        {paceRatio != null && (
          <span className={paceRatio >= 1.1 ? "text-amber-600 dark:text-amber-400" : ""}>
            {paceRatio.toFixed(2)}× pace
          </span>
        )}
        {projected != null && <span>proj. {formatMoney(projected)}</span>}
      </div>

      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5">
      <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
      <p
        className={`text-sm font-bold mt-1 ${
          tone === "bad" ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ── A single budget / cost-center line with a usage bar ──────────────────────

function BudgetLine({
  name,
  spent,
  budgeted,
  percentUsed,
  status,
}: {
  name: string;
  spent: number;
  budgeted: number;
  percentUsed: number;
  status: LineStatus;
}) {
  const widthPct = Math.min(percentUsed, 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium truncate">{name}</span>
        <span className="text-muted-foreground shrink-0 ml-2">
          {formatMoney(spent)}
          {budgeted > 0 ? ` / ${formatMoney(budgeted)}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${LINE_BAR[status]}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

// ── Monthly spend bar sparkline ──────────────────────────────────────────────

function MonthlyChart({ values }: { values: number[] }) {
  const data = useMemo(
    () => values.map((v, i) => ({ month: MONTHS[i], value: v })),
    [values],
  );
  const hasData = values.some((v) => v !== 0);
  if (!hasData) return null;
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="#2D6A4F" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Revenue ──────────────────────────────────────────────────────────────────

function RevenueSection({ watch }: { watch: NonNullable<ReturnType<typeof useFinancialWatch>["watch"]> }) {
  const r = watch.revenue;
  return (
    <section className="gk-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Revenue</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {r.calendarYear} · year-to-date
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="YTD" value={formatMoney(r.ytdTotal)} />
        <Stat label="This month" value={formatMoney(r.mtdTotal)} />
        <Stat
          label="Rev / round"
          value={r.revenuePerRound != null ? formatMoney(r.revenuePerRound) : "—"}
        />
      </div>

      {r.yoyChange != null && (
        <div className="flex items-center gap-2 text-xs mb-3">
          {r.yoyChange >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
          )}
          <span
            className={
              r.yoyChange >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {formatSignedPct(r.yoyChange)} vs. same point last year
          </span>
          {r.priorYtdTotal != null && (
            <span className="text-muted-foreground">
              ({formatMoney(r.priorYtdTotal)} then)
            </span>
          )}
        </div>
      )}

      <MonthlyChart values={r.monthly} />

      {r.byCategory.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {r.byCategory.map((c) => (
            <div key={c.category} className="flex items-center justify-between text-xs">
              <span className="font-medium">{revenueCategoryLabel(c.category)}</span>
              <span className="text-muted-foreground">
                {formatMoney(c.amount)} · {Math.round(c.share * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
