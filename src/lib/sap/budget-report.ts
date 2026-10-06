/**
 * Read an SAP "BUDGET PERFORMANCE ACTIVITY REPORT" (ZVK/ZC01B): the official
 * profit and loss by cost center — every revenue and cost element (G/L)
 * with this month's actual, plan, and last year, and the same for the year
 * to date, then profit/loss and self-sufficiency.
 *
 * The PDF leaves columns blank when there's nothing in them, so values are
 * placed by where they sit on the page (under ACTUAL, PLAN, VAR, VAR %,
 * PRIOR YEAR), not by counting. Each cost center is checked against itself:
 * revenue − expense must equal the printed profit/loss.
 *
 * Pure: give it the positioned text from lib/pdf/text-lines (pdfTextPages).
 */
import type { TextPiece } from "@/lib/pdf/text-lines";

export interface Amounts {
  actual: number | null;
  plan: number | null;
  variance: number | null;
  variancePct: number | null;
  prior: number | null;
}

export type BudgetSection = "revenue" | "cost" | "result";

export interface BudgetLine {
  section: BudgetSection;
  /** G/L element (301110) — null on subtotals. */
  code: string | null;
  label: string;
  /** Subtotal depth: 0 for an element, 1–4 for *, **, ***, ****. */
  level: number;
  month: Amounts;
  ytd: Amounts;
}

export interface BudgetBlock {
  costCenter: string;
  costCenterName: string;
  /** RAMCAS activity: "00..ZZ" (all) or e.g. "40 GOLF PROGRAM". */
  activity: string;
  lines: BudgetLine[];
}

export interface BudgetReport {
  fiscalYear: number;
  period: number;
  /** "September" */
  periodName: string;
  /** yyyy-mm-dd the report was run. */
  runDate: string | null;
  blocks: BudgetBlock[];
  /** Problems found checking each block against itself. Empty = exact. */
  mismatches: string[];
}

const NUMBER = /^-?[\d,]+(\.\d+)?-?$/;
const STARS = /^(\*{1,4})\s*(.*)$/;

function num(s: string): number {
  const neg = s.endsWith("-") || s.startsWith("-");
  const n = Number(s.replace(/[-,]/g, ""));
  return neg ? -n : n;
}

interface Row {
  y: number;
  pieces: TextPiece[];
  text: string;
}

function rowsOf(pieces: TextPiece[]): Row[] {
  const rows: Row[] = [];
  for (const p of pieces) {
    if (!p.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - p.y) <= 2.5);
    if (row) row.pieces.push(p);
    else rows.push({ y: p.y, pieces: [p], text: "" });
  }
  for (const r of rows) {
    r.pieces.sort((a, b) => a.x - b.x);
    r.text = r.pieces.map((p) => p.str.trim()).join(" ");
  }
  return rows.sort((a, b) => b.y - a.y);
}

/** Header words close together become one column title ("VAR" + "%"). Returns right edges. */
function columnEdges(pieces: TextPiece[]): number[] {
  const groups: { left: number; right: number }[] = [];
  for (const p of [...pieces].sort((a, b) => a.x - b.x)) {
    const last = groups[groups.length - 1];
    if (last && p.x - last.right < 8) last.right = Math.max(last.right, p.x + p.width);
    else groups.push({ left: p.x, right: p.x + p.width });
  }
  return groups.map((g) => g.right);
}

const EMPTY = (): Amounts => ({ actual: null, plan: null, variance: null, variancePct: null, prior: null });
const ORDER: (keyof Amounts)[] = ["actual", "plan", "variance", "variancePct", "prior"];

export function isBudgetReport(pages: TextPiece[][]): boolean {
  return pages.some((p) => p.some((x) => /BUDGET PERFORMANCE ACTIVITY REPORT/i.test(x.str)));
}

export function parseBudgetReport(pages: TextPiece[][]): BudgetReport | null {
  if (!isBudgetReport(pages)) return null;
  const report: BudgetReport = { fiscalYear: 0, period: 0, periodName: "", runDate: null, blocks: [], mismatches: [] };
  const blocks = new Map<string, BudgetBlock>();

  for (const page of pages) {
    const rows = rowsOf(page);
    let block: BudgetBlock | null = null;
    let section: BudgetSection | null = null;
    let monthEdges: number[] = [];
    let ytdEdges: number[] = [];
    let labelLeft = 0;
    let labelRight = 0;
    let costCenter = "";
    let costCenterName = "";

    for (const row of rows) {
      const t = row.text;
      const period = t.match(/Period\s+(\d+)\s+Ended\s+([A-Za-z]+)\s+FY\s+(\d{4})/);
      if (period) {
        report.period = Number(period[1]);
        report.periodName = period[2];
        report.fiscalYear = Number(period[3]);
      }
      const date = t.match(/Date:\s*(\d{2})\/(\d{2})\/(\d{4})/);
      if (date) report.runDate = `${date[3]}-${date[1]}-${date[2]}`;
      const cc = t.match(/^Cost Center or Group:\s*(\S+)\s+(.*)$/);
      if (cc) {
        costCenter = cc[1];
        costCenterName = cc[2].trim();
        continue;
      }
      const act = t.match(/^RAMCAS Activity:\s*(.+)$/);
      if (act && costCenter) {
        const activity = act[1].replace(/\s+/g, " ").trim();
        const key = `${costCenter}|${activity}`;
        block = blocks.get(key) ?? { costCenter, costCenterName, activity, lines: [] };
        blocks.set(key, block);
        continue;
      }
      // Column titles: where each column ends, and where the element names run.
      const elementsTitle = row.pieces.find((p) => /ELEMENTS/.test(p.str));
      if (elementsTitle && /ACTUAL/.test(t)) {
        section = /REVENUE \/ COST/.test(t) ? "result" : /COST ELEMENTS/.test(t) ? "cost" : "revenue";
        labelLeft = elementsTitle.x - 3;
        const actuals = row.pieces.filter((p) => p.str.trim() === "ACTUAL");
        labelRight = actuals.length > 1 ? actuals[1].x - 3 : Infinity;
        monthEdges = columnEdges(row.pieces.filter((p) => p.x + p.width <= labelLeft));
        ytdEdges = columnEdges(row.pieces.filter((p) => p.x >= labelRight));
        continue;
      }
      if (!block || !section || monthEdges.length !== 5 || ytdEdges.length !== 5) continue;
      if (/^(Report:|Name:|CURRENT)/.test(t)) continue;

      const line: BudgetLine = { section, code: null, label: "", level: 0, month: EMPTY(), ytd: EMPTY() };
      const words: string[] = [];
      let any = false;
      for (const p of row.pieces) {
        const s = p.str.trim();
        const right = p.x + p.width;
        const inLabel = p.x >= labelLeft && p.x < labelRight;
        if (!inLabel && NUMBER.test(s)) {
          const edges = right <= labelLeft + 2 ? monthEdges : ytdEdges;
          const target = right <= labelLeft + 2 ? line.month : line.ytd;
          let best = 0;
          for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - right) < Math.abs(edges[best] - right)) best = i;
          target[ORDER[best]] = num(s);
          any = true;
        } else if (inLabel) {
          words.push(s);
        }
      }
      if (!words.length) continue;
      let label = words.join(" ").replace(/\s+/g, " ").trim();
      const stars = label.match(STARS);
      if (stars) {
        line.level = stars[1].length;
        label = stars[2].trim();
      }
      const code = label.match(/^(\d{6})\s+(.*)$/);
      if (code) {
        line.code = code[1];
        label = code[2];
      }
      line.label = label;
      if (!any && !line.code && !line.level) continue;
      block.lines.push(line);
    }
  }

  report.blocks = [...blocks.values()].filter((b) => b.lines.length > 0);
  for (const b of report.blocks) {
    const find = (re: RegExp, section: BudgetSection) => b.lines.find((l) => l.section === section && l.level > 0 && re.test(l.label));
    const revenue = find(/^REVENUE$/, "revenue");
    const expense = find(/^EXPENSE$/, "cost");
    const pl = find(/^PROFIT \/ LOSS$/, "result");
    for (const k of ["month", "ytd"] as const) {
      const rev = revenue?.[k].actual ?? 0;
      const exp = expense?.[k].actual ?? 0;
      const got = pl?.[k].actual ?? 0;
      if (Math.abs(rev - exp - got) > 1.5) {
        report.mismatches.push(
          `${b.costCenter} (${b.activity}) ${k === "ytd" ? "year to date" : "month"}: revenue ${rev} − expense ${exp} isn't the profit/loss ${got}`,
        );
      }
    }
  }
  return report;
}

/** Plain names for the cost centers on the golf report. */
export const COST_CENTER_NAMES: Record<string, string> = {
  "1353-4659": "Golf course, everything",
  "1353-5246": "Golf (course, shop, range, carts, maintenance)",
  "1353-5247": "Buckley's (group)",
  "20091": "Buckley's food & bar",
  "20086": "Pro shop merchandise",
  "20087": "Golf program (fees, passes)",
  "25224": "Driving range",
  "25229": "Cart rentals",
  "25339": "UFM (category C)",
  "25581": "Course maintenance",
};

/** The cost center's plain name, else the report's own. */
export function costCenterLabel(code: string, reportName: string): string {
  return COST_CENTER_NAMES[code] ?? reportName.replace(/\s+1353$/, "");
}
