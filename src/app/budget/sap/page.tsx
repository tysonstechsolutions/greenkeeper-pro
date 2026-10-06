"use client";

// SAP Report: the county's official profit and loss from the SAP Budget
// Performance Activity Report, one cost center at a time — revenue, expense,
// profit/loss and self-sufficiency against plan and last year, the official
// cost of goods % for food, bar, and merchandise, and every line.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, RefreshCw } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectAll, directSelectList } from "@/lib/supabase/rest";
import { fiscalYearLabel } from "@/lib/performance/performance";
import { costCenterLabel, type Amounts, type BudgetBlock, type BudgetLine } from "@/lib/sap/budget-report";
import {
  GOODS_LABELS,
  GOODS_TARGET,
  blocksFromRows,
  budgetSummary,
  mainBlocks,
  type StoredBudgetLine,
  type StoredBudgetReport,
} from "@/lib/sap/budget-store";
import { UploadSapReport } from "./upload-sap";

/** The F&B Manager sees Buckley's only. */
const FB_CENTERS = ["20091", "1353-5247"];

function money(n: number | null): string {
  if (n == null) return "—";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(n));
  return n < 0 ? `−${s}` : s;
}

function signed(n: number | null, unit: "$" | "pts" = "$"): string {
  if (n == null) return "—";
  if (unit === "pts") return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} pts`;
  return `${n > 0 ? "+" : ""}${money(n)}`;
}

const tone = (better: number | null) =>
  better == null || better === 0 ? "" : better > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";

// ── Pieces ─────────────────────────────────────────────────────────────────

/** "$252,449 under" / "6 pts over": how far above or below, in words. */
function overUnder(d: number | null, pct: boolean): string {
  if (d == null) return "—";
  if (d === 0) return "same";
  const size = pct ? `${Math.abs(d)} pts` : money(Math.abs(d));
  return `${size} ${d > 0 ? "over" : "under"}`;
}

function Tile({ label, a, pct = false, lowerIsBetter = false }: { label: string; a: Amounts; pct?: boolean; lowerIsBetter?: boolean }) {
  const fmt = (n: number | null) => (n == null ? "—" : pct ? `${n}%` : money(n));
  const vsPlan = a.actual != null && a.plan != null ? a.actual - a.plan : null;
  const vsPrior = a.actual != null && a.prior != null ? a.actual - a.prior : null;
  const better = (d: number | null) => (d == null ? null : lowerIsBetter ? -d : d);
  return (
    <div className="gk-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{fmt(a.actual)}</p>
      <dl className="mt-1 text-xs space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Plan {fmt(a.plan)}</dt>
          <dd className={`tabular-nums font-medium ${tone(better(vsPlan))}`}>{overUnder(vsPlan, pct)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Last year {fmt(a.prior)}</dt>
          <dd className={`tabular-nums font-medium ${tone(better(vsPrior))}`}>{overUnder(vsPrior, pct)}</dd>
        </div>
      </dl>
    </div>
  );
}

function GoodsCard({ block, when }: { block: BudgetBlock; when: "month" | "ytd" }) {
  const goods = budgetSummary(block, when).goods;
  if (!goods.length) return null;
  return (
    <section aria-labelledby="cogs">
      <h2 id="cogs" className="text-lg font-semibold mb-1">Cost of goods</h2>
      <p className="text-xs text-muted-foreground mb-2">
        What the food, drinks, or merchandise cost as a share of what they sold for (resale and catering). These are the official
        numbers; Performance works them out from receipts and sales reports.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {goods.map((g) => {
          const target = GOODS_TARGET[g.kind];
          const over = g.pct.actual != null && g.pct.actual > target;
          return (
            <div key={g.kind} className="gk-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{GOODS_LABELS[g.kind]}</p>
                {g.pct.actual != null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      over ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                    }`}
                  >
                    {over ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {over ? `${Math.round((g.pct.actual - target) * 10) / 10} pts over` : "On target"}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold tabular-nums mt-1">{g.pct.actual == null ? "—" : `${g.pct.actual}%`}</p>
              <p className="text-xs text-muted-foreground">
                {g.cogs.actual == null || g.cogs.actual <= 0 ? "No cost posted yet" : `${money(g.cogs.actual)} cost`} on {money(g.sales.actual)} sales · target {target}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Plan {g.pct.plan == null ? "—" : `${g.pct.plan}%`} · last year {g.pct.prior == null ? "—" : `${g.pct.prior}%`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const SECTION_TITLES: Record<BudgetLine["section"], string> = {
  revenue: "Money in",
  cost: "Money out",
  result: "Result",
};

function LineTable({ block, when }: { block: BudgetBlock; when: "month" | "ytd" }) {
  const [detail, setDetail] = useState(true);
  const lines = detail ? block.lines : block.lines.filter((l) => l.level >= 2 || l.section === "result");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm" role="group" aria-label="How much detail">
        {[true, false].map((d) => (
          <button
            key={String(d)}
            type="button"
            aria-pressed={detail === d}
            onClick={() => setDetail(d)}
            className={`px-3 py-1 rounded-full border ${detail === d ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
          >
            {d ? "Every line" : "Totals only"}
          </button>
        ))}
      </div>
      <div className="gk-card overflow-x-auto">
        <table className="w-full text-sm" aria-label="Report lines">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-3 py-2">Line</th>
              <th className="text-right font-medium px-2 py-2">Actual</th>
              <th className="text-right font-medium px-2 py-2">Plan</th>
              <th className="text-right font-medium px-2 py-2">vs plan</th>
              <th className="text-right font-medium px-3 py-2">Last year</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const a = l[when];
              const isPct = /%$/.test(l.label);
              const fmt = (n: number | null) => (n == null ? "—" : isPct ? `${n}%` : money(n));
              const head = i === 0 || l.section !== lines[i - 1].section;
              return [
                head && (
                  <tr key={`h${i}`} className="bg-muted/40">
                    <th colSpan={5} scope="colgroup" className="text-left text-xs uppercase tracking-wide text-muted-foreground font-semibold px-3 py-1.5">
                      {SECTION_TITLES[l.section]}
                    </th>
                  </tr>
                ),
                <tr key={i} className={`border-b border-border/40 last:border-0 ${l.level >= 3 ? "font-semibold" : l.level > 0 ? "font-medium" : ""}`}>
                  <td className="px-3 py-1.5" style={{ paddingLeft: l.level === 0 ? 28 : 12 }}>
                    {l.label}
                    {l.code && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{l.code}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(a.actual)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(a.plan)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${tone(a.variance)}`}>
                    {isPct ? signed(a.variance, "pts") : a.variance == null || a.variance === 0 ? "—" : signed(a.variance)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(a.prior)}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        &ldquo;vs plan&rdquo; is green when it helps: more money in, or less money out, than planned.
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function SapReportContent() {
  const { isFbManager } = useAuth();
  const [reports, setReports] = useState<StoredBudgetReport[] | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BudgetBlock[] | null>(null);
  const [center, setCenter] = useState<string | null>(null);
  const [when, setWhen] = useState<"month" | "ytd">("ytd");
  const [error, setError] = useState<string | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  // Only the latest request's lines are shown when reports are switched quickly.
  const request = useRef(0);

  const showReport = useCallback(
    async (id: string | null) => {
      const mine = ++request.current;
      setReportId(id);
      if (!id) {
        setBlocks(null);
        return;
      }
      setLoadingLines(true);
      try {
        const rows = await directSelectAll<StoredBudgetLine>("sap_budget_lines", {
          columns: "cost_center,cost_center_name,activity,section,code,label,level,line_no,month_actual,month_plan,month_prior,ytd_actual,ytd_plan,ytd_prior",
          filters: [`report_id=eq.${id}`, ...(isFbManager ? [`cost_center=in.(${FB_CENTERS.join(",")})`] : [])],
          orderBy: [{ column: "line_no" }, { column: "id" }],
          pageSize: 1000,
          label: "sap.lines",
        });
        if (mine !== request.current) return;
        const main = mainBlocks(blocksFromRows(rows));
        setBlocks(main);
        setCenter((c) => (c && main.some((b) => b.costCenter === c) ? c : (main.find((b) => isFbManager && b.costCenter === "20091") ?? main[0])?.costCenter ?? null));
      } catch (e) {
        if (mine === request.current) setError(e instanceof Error ? e.message : String(e));
      }
      if (mine === request.current) setLoadingLines(false);
    },
    [isFbManager],
  );

  const loadReports = useCallback(
    async (select?: string) => {
      try {
        const list = await directSelectList<StoredBudgetReport>("sap_budget_reports", {
          columns: "id,fiscal_year,period,period_name,run_date,source_file,created_at",
          orderBy: [{ column: "fiscal_year", ascending: false }, { column: "period", ascending: false }],
          limit: 60,
          label: "sap.reports",
        });
        setError(null);
        setReports(list);
        await showReport(select ?? list[0]?.id ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setReports([]);
        setError(
          /sap_budget/.test(msg) || /exist|schema cache|not find/i.test(msg)
            ? "The database update for SAP reports hasn't been run yet (20261012120000_sap_budget_reports.sql)."
            : msg,
        );
      }
    },
    [showReport],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the database; state is set after the fetch
    void loadReports();
  }, [loadReports]);

  const block = useMemo(() => blocks?.find((b) => b.costCenter === center) ?? null, [blocks, center]);
  const report = reports?.find((r) => r.id === reportId) ?? null;
  const summary = block ? budgetSummary(block, when) : null;

  if (reports == null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {error}{" "}
            <Link href="/settings/system-health/" className="underline">System Health</Link>
          </span>
        </div>
      )}

      {!isFbManager && <UploadSapReport onSaved={(id) => void loadReports(id)} />}

      {reports.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No SAP reports saved yet. Add the latest one above.</p>
      )}

      {report && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor="sap-report">Report</label>
          <div className="relative">
            <select
              id="sap-report"
              value={report.id}
              onChange={(e) => void showReport(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-background pl-3 pr-8 py-1.5 text-sm"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period_name ?? `Period ${r.period}`} · {fiscalYearLabel(r.fiscal_year)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-sm" role="group" aria-label="Month or year to date">
            {(["ytd", "month"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={when === w}
                onClick={() => setWhen(w)}
                className={`px-3 py-1.5 ${when === w ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {w === "ytd" ? "Year to date" : (report.period_name ?? "Month")}
              </button>
            ))}
          </div>
          <button onClick={() => void loadReports(report.id)} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Reload">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {loadingLines && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loadingLines && blocks && blocks.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Cost center">
          {blocks.map((b) => (
            <button
              key={b.costCenter}
              role="tab"
              aria-selected={b.costCenter === center}
              onClick={() => setCenter(b.costCenter)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
                b.costCenter === center ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              {costCenterLabel(b.costCenter, b.costCenterName)}
            </button>
          ))}
        </div>
      )}

      {!loadingLines && block && summary && report && (
        <>
          <div>
            <h2 className="text-lg font-semibold">{costCenterLabel(block.costCenter, block.costCenterName)}</h2>
            <p className="text-xs text-muted-foreground">
              Cost center {block.costCenter} ({block.costCenterName}) ·{" "}
              {when === "ytd" ? `${fiscalYearLabel(report.fiscal_year)} through ${report.period_name ?? `period ${report.period}`}` : report.period_name}
              {report.run_date ? ` · run ${report.run_date}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Money in (revenue)" a={summary.revenue} />
            <Tile label="Money out (expense)" a={summary.expense} lowerIsBetter />
            <Tile label="Profit / loss" a={summary.profit} />
            <Tile label="Self-sufficiency" a={summary.selfSufficiency} pct />
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Self-sufficiency is money in as a share of money out: 100% pays for itself, under 100% needs other funds to cover it.
          </p>
          <GoodsCard block={block} when={when} />
          <section aria-labelledby="lines">
            <h2 id="lines" className="text-lg font-semibold mb-2">Every line</h2>
            <LineTable block={block} when={when} />
          </section>
        </>
      )}
    </div>
  );
}

export default function SapReportPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="gk-page mx-auto">
        <h1 className="mb-1">SAP Report</h1>
        <p className="text-sm text-muted-foreground mb-5">
          The official profit and loss from SAP (Budget Performance Activity Report), by cost center: what came in, what went
          out, and how that compares with the plan and last year.
        </p>
        <SapReportContent />
      </div>
    </RoleGuard>
  );
}
