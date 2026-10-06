/**
 * SAP budget reports in the database, and the few numbers that matter from
 * each cost center: revenue, expense, profit/loss, self-sufficiency, and the
 * official cost of goods % for food, bar, and merchandise.
 *
 * Pure: rows in, rows out. The page does the loading and saving.
 */
import { AREA_TARGET } from "@/lib/performance/performance";
import type { Amounts, BudgetBlock, BudgetLine, BudgetReport, BudgetSection } from "./budget-report";

/** A sap_budget_lines row. */
export type StoredBudgetLine = {
  cost_center: string;
  cost_center_name: string | null;
  activity: string;
  section: BudgetSection;
  code: string | null;
  label: string;
  level: number;
  line_no: number;
  month_actual: number | null;
  month_plan: number | null;
  month_prior: number | null;
  ytd_actual: number | null;
  ytd_plan: number | null;
  ytd_prior: number | null;
};

/** A sap_budget_reports row. */
export interface StoredBudgetReport {
  id: string;
  fiscal_year: number;
  period: number;
  period_name: string | null;
  run_date: string | null;
  source_file: string | null;
  created_at?: string;
}

/** The report row to save. */
export function budgetReportRow(report: BudgetReport, sourceFile: string | null) {
  return {
    fiscal_year: report.fiscalYear,
    period: report.period,
    period_name: report.periodName || null,
    run_date: report.runDate,
    source_file: sourceFile,
  };
}

/** Every printed line to save, in report order. */
export function budgetLineRows(report: BudgetReport, reportId: string): (StoredBudgetLine & { report_id: string })[] {
  const rows: (StoredBudgetLine & { report_id: string })[] = [];
  for (const b of report.blocks) {
    b.lines.forEach((l, i) => {
      rows.push({
        report_id: reportId,
        cost_center: b.costCenter,
        cost_center_name: b.costCenterName || null,
        activity: b.activity,
        section: l.section,
        code: l.code,
        label: l.label,
        level: l.level,
        line_no: i + 1,
        month_actual: l.month.actual,
        month_plan: l.month.plan,
        month_prior: l.month.prior,
        ytd_actual: l.ytd.actual,
        ytd_plan: l.ytd.plan,
        ytd_prior: l.ytd.prior,
      });
    });
  }
  return rows;
}

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** Better than plan is positive: more revenue or profit, less cost. */
function variance(section: BudgetSection, actual: number | null, plan: number | null): number | null {
  if (actual == null && plan == null) return null;
  const a = actual ?? 0;
  const p = plan ?? 0;
  return section === "cost" ? p - a : a - p;
}

function amounts(section: BudgetSection, actual: unknown, plan: unknown, prior: unknown): Amounts {
  const a = n(actual);
  const p = n(plan);
  const v = variance(section, a, p);
  return {
    actual: a,
    plan: p,
    variance: v,
    variancePct: v != null && p ? Math.round((v / Math.abs(p)) * 100) : null,
    prior: n(prior),
  };
}

/** Saved rows back into cost center blocks, in report order. */
export function blocksFromRows(rows: StoredBudgetLine[]): BudgetBlock[] {
  const blocks = new Map<string, BudgetBlock>();
  for (const r of [...rows].sort((a, b) => a.line_no - b.line_no)) {
    const key = `${r.cost_center}|${r.activity}`;
    let block = blocks.get(key);
    if (!block) {
      block = { costCenter: r.cost_center, costCenterName: r.cost_center_name ?? "", activity: r.activity, lines: [] };
      blocks.set(key, block);
    }
    const line: BudgetLine = {
      section: r.section,
      code: r.code,
      label: r.label,
      level: Number(r.level),
      month: amounts(r.section, r.month_actual, r.month_plan, r.month_prior),
      ytd: amounts(r.section, r.ytd_actual, r.ytd_plan, r.ytd_prior),
    };
    block.lines.push(line);
  }
  return [...blocks.values()];
}

/** One block per cost center: the "all activities" one (00..ZZ) when there is one. */
export function mainBlocks(blocks: BudgetBlock[]): BudgetBlock[] {
  const out = new Map<string, BudgetBlock>();
  for (const b of blocks) {
    const had = out.get(b.costCenter);
    if (!had || (b.activity === "00..ZZ" && had.activity !== "00..ZZ")) out.set(b.costCenter, b);
  }
  return [...out.values()];
}

export type GoodsKind = "food" | "bar" | "merchandise";
export const GOODS_LABELS: Record<GoodsKind, string> = { food: "Food", bar: "Bar", merchandise: "Merchandise" };
/** The same cost of goods targets as Performance: restaurant, bar, pro shop. */
export const GOODS_TARGET: Record<GoodsKind, number> = {
  food: AREA_TARGET.restaurant,
  bar: AREA_TARGET.bar,
  merchandise: AREA_TARGET.pro_shop,
};
const KIND_DIGIT: Record<string, GoodsKind> = { "1": "food", "2": "bar", "3": "merchandise" };

/**
 * Which goods an element is about: resale and catering revenue (3011x0,
 * 3022x0) and cost of goods sold (4011xx), by the fifth digit.
 */
export function goodsKind(code: string | null): { kind: GoodsKind; side: "sales" | "cogs" } | null {
  if (!code) return null;
  const sales = /^30(11|22)([123])0$/.exec(code);
  if (sales) return { kind: KIND_DIGIT[sales[2]], side: "sales" };
  const cogs = /^4011([123])\d$/.exec(code);
  if (cogs) return { kind: KIND_DIGIT[cogs[1]], side: "cogs" };
  return null;
}

export interface Pair {
  actual: number | null;
  plan: number | null;
  prior: number | null;
}

export interface GoodsCost {
  kind: GoodsKind;
  sales: Pair;
  cogs: Pair;
  /** Cost of goods as a % of sales (one decimal), null without sales. */
  pct: Pair;
}

export interface BudgetSummary {
  revenue: Amounts;
  expense: Amounts;
  profit: Amounts;
  selfSufficiency: Amounts;
  goods: GoodsCost[];
}

const empty = (): Amounts => ({ actual: null, plan: null, variance: null, variancePct: null, prior: null });

/** No % until cost is posted: zero, or only a credit, means it isn't in yet. */
const pct = (cost: number | null, sales: number | null): number | null =>
  sales && sales > 0 && cost != null && cost > 0 ? Math.round((cost / sales) * 1000) / 10 : null;

/** The headline numbers for one cost center, month or year to date. */
export function budgetSummary(block: BudgetBlock, when: "month" | "ytd"): BudgetSummary {
  const total = (re: RegExp, section: BudgetSection) =>
    block.lines.find((l) => l.section === section && l.level > 0 && re.test(l.label))?.[when] ?? empty();
  const goods = new Map<GoodsKind, { sales: Pair; cogs: Pair }>();
  const add = (p: Pair, a: Amounts) => {
    for (const k of ["actual", "plan", "prior"] as const) {
      if (a[k] != null) p[k] = (p[k] ?? 0) + a[k]!;
    }
  };
  for (const l of block.lines) {
    if (l.level !== 0) continue;
    const g = goodsKind(l.code);
    if (!g) continue;
    const entry = goods.get(g.kind) ?? { sales: { actual: null, plan: null, prior: null }, cogs: { actual: null, plan: null, prior: null } };
    add(entry[g.side], l[when]);
    goods.set(g.kind, entry);
  }
  // The printed COGS subtotals are the official figures (SAP rounds each
  // line, so adding the lines can be a dollar off).
  for (const l of block.lines) {
    if (l.section !== "cost" || l.level !== 1 || !/^COGS /.test(l.label)) continue;
    const kind: GoodsKind | null = /FOOD/.test(l.label) ? "food" : /BAR/.test(l.label) ? "bar" : /MERCH|MDSE/.test(l.label) ? "merchandise" : null;
    const entry = kind && goods.get(kind);
    if (entry) entry.cogs = { actual: l[when].actual, plan: l[when].plan, prior: l[when].prior };
  }
  return {
    revenue: total(/^REVENUE$/, "revenue"),
    expense: total(/^EXPENSE$/, "cost"),
    profit: total(/^PROFIT \/ LOSS$/, "result"),
    selfSufficiency: total(/^SELF SUFFICIENCY %$/, "result"),
    goods: (["food", "bar", "merchandise"] as GoodsKind[])
      .filter((k) => goods.has(k))
      .map((kind) => {
        const { sales, cogs } = goods.get(kind)!;
        return {
          kind,
          sales,
          cogs,
          pct: { actual: pct(cogs.actual, sales.actual), plan: pct(cogs.plan, sales.plan), prior: pct(cogs.prior, sales.prior) },
        };
      }),
  };
}

/** The calendar month (yyyy-mm) a fiscal period ends in: period 1 is October. */
export function periodMonth(fiscalYear: number, period: number): string {
  const m = ((9 + period - 1) % 12) + 1;
  const y = fiscalYear - (m >= 10 ? 1 : 0);
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ── Performance: the official numbers beside the worked-out ones ─────────────

export type SalesArea = "restaurant" | "bar" | "pro_shop";

/** Where each Performance area's official numbers are on the SAP report. */
export const AREA_GOODS: Record<SalesArea, { center: string; kind: GoodsKind }> = {
  restaurant: { center: "20091", kind: "food" },
  bar: { center: "20091", kind: "bar" },
  pro_shop: { center: "20086", kind: "merchandise" },
};

export interface OfficialArea {
  kind: GoodsKind;
  fiscalYear: number;
  period: number;
  periodName: string;
  /** yyyy-mm the year to date runs through. */
  through: string;
  sales: number;
  cogs: number | null;
  pct: number | null;
  planPct: number | null;
  priorPct: number | null;
}

/** An area's official year-to-date sales and cost of goods, if the report has them. */
export function officialForArea(report: StoredBudgetReport, blocks: BudgetBlock[], area: SalesArea): OfficialArea | null {
  const { center, kind } = AREA_GOODS[area];
  const block = mainBlocks(blocks).find((b) => b.costCenter === center);
  const g = block && budgetSummary(block, "ytd").goods.find((x) => x.kind === kind);
  if (!g || g.sales.actual == null) return null;
  return {
    kind,
    fiscalYear: report.fiscal_year,
    period: report.period,
    periodName: report.period_name ?? `period ${report.period}`,
    through: periodMonth(report.fiscal_year, report.period),
    sales: g.sales.actual,
    cogs: g.cogs.actual,
    pct: g.pct.actual,
    planPct: g.pct.plan,
    priorPct: g.pct.prior,
  };
}

export interface OfficialNote {
  level: "act" | "watch" | "info";
  title: string;
  detail: string;
  dollars: number;
}

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * What the official numbers say that the worked-out ones can't: sales SAP
 * has that the reports here don't, and the official cost of goods % against
 * the target. `enteredSales` is what's entered here for the same months.
 */
export function officialNotes(o: OfficialArea, enteredSales: number, target: number, fyLabel: string): OfficialNote[] {
  const notes: OfficialNote[] = [];
  const what = o.kind === "merchandise" ? "merchandise" : o.kind;
  const missing = o.sales - enteredSales;
  if (missing > 500 && missing > o.sales * 0.1) {
    notes.push({
      level: "watch",
      title: `SAP has ${usd(missing)} more ${what} sales than the reports here`,
      detail:
        `SAP shows ${usd(o.sales)} of ${what} sales for ${fyLabel} through ${o.periodName}` +
        (o.kind === "merchandise" ? "" : " (resale and catering)") +
        `, the sales entered here for those months add up to ${usd(enteredSales)}. ` +
        "Cost % on this page reads high until the missing sales are uploaded (another register, catering, or days not uploaded). " +
        (o.pct != null ? `The official cost of goods is ${o.pct}%.` : ""),
      dollars: missing,
    });
  }
  if (o.pct != null && o.cogs != null && o.pct > target) {
    notes.push({
      level: "act",
      title: `Official ${what} cost of goods is ${o.pct}%, target ${target}%`,
      detail:
        `SAP: ${usd(o.cogs)} cost on ${usd(o.sales)} sales, ${fyLabel} through ${o.periodName}` +
        (o.planPct != null ? `, plan ${o.planPct}%` : "") +
        (o.priorPct != null ? `, last year ${o.priorPct}%` : "") +
        `. At ${target}% the cost would have been ${usd((o.sales * target) / 100)}.`,
      dollars: Math.round(o.cogs - (o.sales * target) / 100),
    });
  }
  return notes;
}
