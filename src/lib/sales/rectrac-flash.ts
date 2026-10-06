/**
 * Read a RecTrac "Flash Report Part 1 - Sales Statistics" (PDF, as text
 * lines from lib/pdf/text-lines): every item rung up, by date and receipt,
 * with a subtotal per day and a grand total. Exact, no AI: every day is
 * checked against the report's own subtotal and the whole against the
 * grand total.
 *
 * Pure. lib/sales/import.ts turns the result into daily sales and item sales.
 */

export interface FlashSale {
  /** yyyy-mm-dd */
  date: string;
  receipt: string | null;
  user: string;
  inventoryCode: string;
  description: string;
  qty: number;
  fee: number;
  discount: number;
  tax: number;
  net: number;
}

export interface FlashReport {
  title: string;
  /** "Golf Bar", etc. (Inventory Item Category in the report's criteria). */
  category: string | null;
  begin: string | null;
  end: string | null;
  sales: FlashSale[];
  /** The report's own subtotal for each day (yyyy-mm-dd → net). */
  dayTotals: Map<string, number>;
  grandTotal: number | null;
  transactions: number | null;
  /** Problems found when checking the report against itself. Empty = exact. */
  mismatches: string[];
}

const MONEY = String.raw`-?[\d,]+\.\d{2}`;
const SALE = new RegExp(
  String.raw`^(?:(\d{2}/\d{2}/\d{4})\s+)?(?:(\d{4,})\s+)?([A-Z]{2}\d{3,})\s+([A-Za-z0-9]+-[\d-]+)\s+(.+?)\s+(-?\d+(?:\.\d+)?)\s+(${MONEY})\s+(${MONEY})\s+(${MONEY})\s+(${MONEY})$`,
);
/** "46 252 0.00 0.00   252.00" — count, fees, discounts, tax, net for the day. */
const DAY_TOTAL = new RegExp(String.raw`^-?\d+\s+-?[\d,]+(?:\.\d+)?\s+(${MONEY})\s+(${MONEY})\s+(${MONEY})$`);
const PAGE_LINE = /^(Veterans? Memorial Golf|Flash Report Part|Date Receipt #|Report Summary Totals)/i;

const money = (s: string) => Number(s.replace(/,/g, ""));
const r2 = (n: number) => Math.round(n * 100) / 100;

function iso(mdY: string): string {
  const [m, d, y] = mdY.split("/");
  return `${y}-${m}-${d}`;
}

/** Is this text a RecTrac flash sales report? */
export function isFlashReport(lines: string[]): boolean {
  return lines.slice(0, 8).some((l) => /Flash Report Part 1\s*-\s*Sales Statistics/i.test(l));
}

export function parseFlashReport(lines: string[]): FlashReport | null {
  if (!isFlashReport(lines)) return null;
  const titleLine = lines.find((l) => /^Custom Title:/i.test(l.trim()));
  const title =
    titleLine?.replace(/^Custom Title:\s*/i, "").trim() ??
    lines.slice(0, 4).find((l) => !/Page:|Flash Report/i.test(l))?.trim() ??
    "RecTrac report";
  const category = lines.find((l) => /^Inventory Item Category:/i.test(l.trim()))?.replace(/^.*?:\s*/, "").trim() ?? null;
  const pickDate = (re: RegExp) => {
    const m = lines.find((l) => re.test(l))?.match(/(\d{2}\/\d{2}\/\d{4})/);
    return m ? iso(m[1]) : null;
  };

  const sales: FlashSale[] = [];
  const dayTotals = new Map<string, number>();
  let date: string | null = null;
  let receipt: string | null = null;
  let grandTotal: number | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_LINE.test(line)) continue;
    if (/^Report Grand Totals/i.test(line)) {
      const nums = line.match(new RegExp(MONEY, "g"));
      grandTotal = nums ? money(nums[nums.length - 1]) : null;
      continue;
    }
    const m = line.match(SALE);
    if (m) {
      if (m[1]) date = iso(m[1]);
      if (m[2]) receipt = m[2];
      if (!date) continue;
      sales.push({
        date,
        receipt,
        user: m[3],
        // Some lines were keyed in lower case ("ma7009-16-101-0").
        inventoryCode: m[4].toUpperCase(),
        description: m[5].trim(),
        qty: Number(m[6]),
        fee: money(m[7]),
        discount: money(m[8]),
        tax: money(m[9]),
        net: money(m[10]),
      });
      continue;
    }
    const t = line.match(DAY_TOTAL);
    // A day's subtotal closes that day (later pages repeat the date on the first line).
    if (t && date && !dayTotals.has(date)) dayTotals.set(date, money(t[3]));
  }

  const transactions = Number(lines.find((l) => /^Total Transactions:/i.test(l.trim()))?.match(/\d+/)?.[0] ?? NaN);

  // Check the report against itself.
  const mismatches: string[] = [];
  const byDay = new Map<string, number>();
  for (const s of sales) byDay.set(s.date, r2((byDay.get(s.date) ?? 0) + s.net));
  for (const [d, total] of dayTotals) {
    const got = byDay.get(d) ?? 0;
    if (Math.abs(got - total) > 0.005) mismatches.push(`${d}: items add to ${got.toFixed(2)}, the report's day total is ${total.toFixed(2)}`);
  }
  for (const d of byDay.keys()) if (!dayTotals.has(d)) mismatches.push(`${d}: no day total on the report`);
  const sum = r2(sales.reduce((s, x) => s + x.net, 0));
  if (grandTotal != null && Math.abs(sum - grandTotal) > 0.005) {
    mismatches.push(`Items add to ${sum.toFixed(2)}, the report's grand total is ${grandTotal.toFixed(2)}`);
  }

  return {
    title,
    category,
    begin: pickDate(/Begin Transaction Date/i) ?? ([...byDay.keys()].sort()[0] ?? null),
    end: pickDate(/End Transaction Date/i) ?? ([...byDay.keys()].sort().at(-1) ?? null),
    sales,
    dayTotals,
    grandTotal,
    transactions: Number.isFinite(transactions) ? transactions : null,
    mismatches,
  };
}

/**
 * Bar, restaurant, or pro shop from the report's category (Golf Bar, Golf
 * Food, Golf Resale), else its title. The category wins: the custom title is
 * often copied from another report ("Buckleys Restaurant" on pro shop sales).
 */
export function flashReportArea(r: Pick<FlashReport, "category" | "title">): "bar" | "restaurant" | "pro_shop" | null {
  const c = r.category?.toUpperCase() ?? "";
  if (/\bBAR\b/.test(c)) return "bar";
  if (/PRO ?SHOP|MERCH|RETAIL|RESALE|GOLF SHOP/.test(c)) return "pro_shop";
  if (/FOOD|RESTAURANT|GRILL|KITCHEN/.test(c)) return "restaurant";
  const t = r.title.toUpperCase();
  if (/\bBAR\b/.test(t)) return "bar";
  if (/RESTAURANT|BUCKLEY|FOOD|GRILL|KITCHEN/.test(t)) return "restaurant";
  if (/PRO ?SHOP|MERCH|RETAIL/.test(t)) return "pro_shop";
  return null;
}
