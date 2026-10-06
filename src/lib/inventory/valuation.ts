/**
 * Read the month-end inventory valuation spreadsheets (the NAF count sheets):
 * Buckley's food (151110), Buckley's bar (151120), and the pro shop retail
 * (151130). Each has a header block (facility, site, cost center, account,
 * month ending, TOTAL) and, usually, one row per item with its count, unit
 * cost, and value. Older pro shop sheets carry only the total ("see attached
 * inventory valuation report").
 *
 * Pure: give it the sheets as rows of cell text (see sheetRows), get back
 * what was counted. Ending inventory is what makes COGS real:
 *   COGS = starting inventory + purchases − ending inventory.
 */

export type InventoryOutlet = "restaurant" | "bar" | "pro_shop";

export const OUTLET_BY_ACCOUNT: Record<string, InventoryOutlet> = {
  "151110": "restaurant",
  "151120": "bar",
  "151130": "pro_shop",
};

export const INVENTORY_OUTLET_LABELS: Record<InventoryOutlet, string> = {
  restaurant: "Buckley's food",
  bar: "Buckley's bar",
  pro_shop: "Pro shop retail",
};

export interface ValuationLine {
  description: string;
  category: string | null;
  unit: string | null;
  qty: number;
  unitCost: number;
  value: number;
  inventoryCode: string | null;
}

export interface Valuation {
  outlet: InventoryOutlet;
  account: string;
  costCenter: string | null;
  /** yyyy-mm-dd, the month-end the count is for. */
  monthEnd: string;
  /** The TOTAL printed at the top (null when the sheet shows "$-" or nothing). */
  statedTotal: number | null;
  /** Sum of the item rows (null on a total-only sheet). */
  linesTotal: number | null;
  /** What to use: the item rows when there are any, else the stated total. */
  total: number;
  lines: ValuationLine[];
  countedBy: string | null;
  /** Plain-English notes on anything off about the sheet. */
  notes: string[];
}

export type Rows = string[][];

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "$1,234.56", "1234.5", " - ", "$-" → number (blank or dash → null). */
export function cellNumber(text: unknown): number | null {
  const t = String(text ?? "").trim().replace(/[$,\s]/g, "");
  if (!t || /^-+$/.test(t)) return null;
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** "30-Sep-26", "9/30/2026", "2026-09-30" → yyyy-mm-dd. */
export function parseMonthEnd(text: unknown): string | null {
  const t = String(text ?? "").trim();
  let m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[2].toUpperCase()];
    if (!mo) return null;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${mo}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** The value in the cell under a header label in the top block ("ACCOUNT" → "151110"). */
function headerValue(rows: Rows, label: RegExp): string | null {
  for (let r = 0; r < Math.min(rows.length - 1, 12); r++) {
    const c = rows[r].findIndex((v) => label.test(norm(v)));
    if (c >= 0) {
      const below = String(rows[r + 1]?.[c] ?? "").trim();
      if (below) return below;
    }
  }
  return null;
}

/** The amount next to a "TOTAL:" label in the top block. */
function statedTotal(rows: Rows): number | null {
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r];
    const c = row.findIndex((v) => /^TOTAL:?$/.test(norm(v)));
    if (c < 0) continue;
    for (let k = c + 1; k < row.length; k++) {
      const v = String(row[k] ?? "").trim();
      if (!v) continue;
      return cellNumber(v);
    }
    return null;
  }
  return null;
}

/** "COUNTED BY:" name, when filled in. */
function countedBy(rows: Rows): string | null {
  for (const row of rows.slice(0, 10)) {
    const c = row.findIndex((v) => /^COUNTED BY/.test(norm(v)));
    if (c < 0) continue;
    const name = row.slice(c + 1).map((v) => String(v).trim()).find((v) => v && !/^DATE/i.test(v));
    return name ?? null;
  }
  return null;
}

interface Columns {
  description: number;
  category: number;
  unit: number;
  qty: number;
  cost: number;
  value: number;
  code: number;
}

/** Find the item table's header row and the columns that matter. */
function findColumns(rows: Rows): { header: number; cols: Columns } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r].map(norm);
    const description = row.findIndex((v) => v === "DESCRIPTION");
    const cost = row.findIndex((v) => v === "COST");
    if (description < 0 || cost < 0) continue;
    // Quantity: "Count Total", "Actual Total", or the "Total" just before COST.
    let qty = row.findIndex((v) => v === "COUNT TOTAL" || v === "ACTUAL TOTAL");
    if (qty < 0) qty = row.lastIndexOf("TOTAL", cost);
    // Value: the first TOTAL after COST.
    const value = row.findIndex((v, i) => i > cost && v === "TOTAL");
    return {
      header: r,
      cols: {
        description,
        category: row.findIndex((v) => v === "CATEGORY" || v === "TYPE"),
        unit: row.findIndex((v) => v === "UNIT" || v === "UNITS" || v === "UOM"),
        qty,
        cost,
        value,
        code: row.findIndex((v) => v === "INVENTORY CODE" || v === "STOCK #" || v === "PRODUCT NUMBER"),
      },
    };
  }
  return null;
}

/** Read one sheet. Null when it isn't a valuation sheet. */
export function parseValuationSheet(rows: Rows, fileName = ""): Valuation | null {
  const accountText = headerValue(rows, /^ACCOUNT$/) ?? fileName.match(/1511[123]0/)?.[0] ?? null;
  const account = accountText?.match(/1511[123]0/)?.[0] ?? null;
  if (!account) return null;
  const outlet = OUTLET_BY_ACCOUNT[account];
  const monthEnd = parseMonthEnd(headerValue(rows, /^MONTH ENDING$/));
  if (!monthEnd) return null;
  const costCenter = headerValue(rows, /^COST CTR$/)?.match(/\d{5}/)?.[0] ?? null;

  const lines: ValuationLine[] = [];
  const found = findColumns(rows);
  if (found) {
    const { header, cols } = found;
    for (const row of rows.slice(header + 1)) {
      const description = String(row[cols.description] ?? "").trim();
      if (!description || /^-+$/.test(description)) continue;
      // A later "TOTAL" footer row ends the table.
      if (/^(GRAND )?TOTAL:?$/i.test(description)) break;
      const cost = cellNumber(row[cols.cost]);
      const qtyCell = cols.qty >= 0 ? cellNumber(row[cols.qty]) : null;
      const valueCell = cols.value >= 0 ? cellNumber(row[cols.value]) : null;
      if (cost == null && qtyCell == null && valueCell == null) continue;
      const qty = qtyCell ?? 0;
      const unitCost = cost ?? 0;
      lines.push({
        description,
        category: cols.category >= 0 ? String(row[cols.category] ?? "").trim() || null : null,
        unit: cols.unit >= 0 ? String(row[cols.unit] ?? "").trim() || null : null,
        qty,
        unitCost,
        value: r2(valueCell ?? qty * unitCost),
        inventoryCode: cols.code >= 0 ? String(row[cols.code] ?? "").trim() || null : null,
      });
    }
  }
  const stated = statedTotal(rows);
  const counted = lines.filter((l) => l.qty !== 0 || l.value !== 0);
  const linesTotal = counted.length ? r2(counted.reduce((s, l) => s + l.value, 0)) : null;
  const notes: string[] = [];
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (linesTotal == null && stated == null) {
    notes.push("Nothing counted on this sheet and no total.");
  } else if (linesTotal == null) {
    notes.push("Total only (no item rows). The item detail is on the attached valuation report.");
  } else if (stated == null) {
    notes.push(`The sheet's TOTAL is blank. The items add up to ${money(linesTotal)}.`);
  } else if (Math.abs(linesTotal - stated) > 0.1) {
    notes.push(
      `The items add up to ${money(linesTotal)} but the sheet's TOTAL shows ${money(stated)} (${linesTotal > stated ? "short" : "over"} by ${money(Math.abs(linesTotal - stated))}). Usually rows added below the TOTAL formula's range, a counted item with a blank value, or a TOTAL linked to another month's file. Using the items.`,
    );
  }
  return {
    outlet,
    account,
    costCenter,
    monthEnd,
    statedTotal: stated,
    linesTotal,
    total: linesTotal ?? stated ?? 0,
    lines: counted,
    countedBy: countedBy(rows),
    notes,
  };
}

/**
 * Read a workbook's sheets (name → rows). The count sheet is the first one
 * that reads as a valuation; helper sheets (VSI DATA, NOTES) are ignored.
 */
export function parseValuationWorkbook(sheets: { name: string; rows: Rows }[], fileName = ""): Valuation | null {
  let best: Valuation | null = null;
  for (const s of sheets) {
    const v = parseValuationSheet(s.rows, fileName);
    if (!v) continue;
    // Prefer the sheet with item detail; ties go to the first.
    if (!best || (v.lines.length > 0 && best.lines.length === 0)) best = v;
  }
  return best;
}

export interface ValuationFile {
  fileName: string;
  valuation: Valuation;
}

/**
 * One valuation per outlet and month. When a month has several files (a
 * "FINAL" and a working copy, or initials on a re-count), keep the file
 * marked FINAL, else the one with a total, else the most items; the rest
 * are reported as set aside.
 */
export function pickValuations(files: ValuationFile[]): { kept: ValuationFile[]; setAside: { fileName: string; reason: string }[] } {
  const groups = new Map<string, ValuationFile[]>();
  for (const f of files) {
    const k = `${f.valuation.outlet}|${f.valuation.monthEnd}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const kept: ValuationFile[] = [];
  const setAside: { fileName: string; reason: string }[] = [];
  const score = (f: ValuationFile) =>
    (/\bFINAL\b/i.test(f.fileName) ? 4 : 0) + (f.valuation.total > 0 ? 2 : 0) + f.valuation.lines.length / 10000;
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => score(b) - score(a) || a.fileName.localeCompare(b.fileName));
    kept.push(sorted[0]);
    for (const other of sorted.slice(1)) {
      setAside.push({ fileName: other.fileName, reason: `Another file for the same month was used: ${sorted[0].fileName}` });
    }
  }
  kept.sort((a, b) => a.valuation.monthEnd.localeCompare(b.valuation.monthEnd) || a.valuation.outlet.localeCompare(b.valuation.outlet));
  return { kept, setAside };
}
