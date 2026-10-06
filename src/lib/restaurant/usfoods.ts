/**
 * Read US Foods invoices, credit memos, and the base's Bulk Funding Order
 * cover sheets from their PDF text (see lib/pdf/text-lines.ts), so restaurant
 * purchases come in with every line item instead of a typed-in total.
 *
 * Pure: give it the PDF's lines (or a cover sheet's form fields) and it
 * returns what's on it. The import screen does the PDF reading and saving.
 */

export type PurchaseCategory = "food" | "alcohol" | "supplies";

export interface UsFoodsLine {
  section: string | null;
  productNumber: string;
  description: string;
  brand: string;
  packSize: string;
  /** Shipped quantity (negative on a credit). */
  qty: number;
  unit: string;
  unitPrice: number;
  /** Line total (negative on a credit). */
  extended: number;
  category: PurchaseCategory;
}

export interface UsFoodsDocument {
  kind: "invoice" | "credit";
  /** Invoice number, or the credit memo number for a credit. */
  documentNumber: string;
  /** The invoice a credit memo is against (same as documentNumber on an invoice). */
  invoiceNumber: string;
  /** yyyy-mm-dd: invoice date, or credit memo date. */
  date: string;
  orderNumber: string | null;
  /** What was actually owed: delivered amount, else product total. Negative for a credit. */
  total: number;
  lines: UsFoodsLine[];
}

const SECTIONS = /^(DRY|REFRIGERATED|FROZEN|PRODUCE|DAIRY|MEAT|SEAFOOD|BEVERAGE[S]?|CHEMICAL.*|JANITORIAL.*|DISPOSABLE.*|EQUIPMENT.*|SUPPLIES.*|PAPER.*)$/;

// [*SUB*] qty [shp [adj]] unit product# middle pricingUnit $unit $extended
const LINE =
  /^(\*SUB\*\s+)?(-?\d+)(?:\s+(-?\d+)(?:\s+(-?\d+))?)?\s+([A-Z]{2})\s+(\d{4,8})\s+(.+?)\s+([A-Z]{2})\s+\$([\d,]+\.\d+)\s+(\(?)-?\$?([\d,]+\.\d{2})\)?\s*$/;

const PACK = /^[\d./#]+\s*(\/\s*[\d./#]+\s*)?(LB|OZ|EA|GA|GAL|CN|CT|QT|PT|DZ|PK|ML|L|KG|G|FT|IN|#)?\b.*$/i;

function money(s: string): number {
  return Number(s.replace(/[$,]/g, ""));
}

/** mm/dd/yyyy or yyyy/mm/dd → yyyy-mm-dd. */
function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

const SUPPLY_NOUNS = new Set([
  "CUP", "LID", "BAG", "FUEL", "NAPKIN", "FOIL", "FILM", "WRAP", "GLOVE", "CONTAINER", "TRAY", "BOWL", "PLATE",
  "FORK", "SPOON", "KNIFE", "CUTLERY", "STRAW", "LINER", "TOWEL", "TISSUE", "CLEANER", "DEGREASER", "SANITIZER",
  "SOAP", "DETERGENT", "BLEACH", "BOX", "CLAMSHELL", "PICK", "SKEWER", "STIRRER", "BOAT", "LABEL", "TAPE", "MOP",
  "SPONGE", "SCRUBBER", "LIGHTER", "CANDLE", "PAPER", "TOOTHPICK", "CHOPSTICK", "APRON", "HAIRNET", "SHEET",
  "DISH", "PAN", "BUCKET", "BROOM", "BRUSH", "THERMOMETER", "SCOOP", "TONG", "LADLE", "WHISK", "SPATULA",
]);
const ALCOHOL_WORDS = /\b(BEER|WINE|LIQUOR|SPIRITS?|VODKA|WHISKE?Y|BOURBON|RUM|TEQUILA|GIN|LAGER|ALE|IPA|SELTZER HARD|HARD SELTZER|CHAMPAGNE|PROSECCO)\b/;

/**
 * Food (counts toward food cost), alcohol (beverage cost), or supplies
 * (disposables, cleaning, kitchen tools). US Foods descriptions lead with the
 * noun ("CUP, PET PLST…"), which decides it.
 */
export function classifyUsFoodsLine(description: string, section?: string | null): PurchaseCategory {
  const d = description.toUpperCase();
  if (section && /CHEMICAL|JANITORIAL|DISPOSABLE|EQUIPMENT|SUPPLIES|PAPER/.test(section)) return "supplies";
  if (ALCOHOL_WORDS.test(d)) return "alcohol";
  const noun = d.split(/[,\s]/)[0]?.replace(/S$/, "") ?? "";
  if (SUPPLY_NOUNS.has(noun) || SUPPLY_NOUNS.has(d.split(/[,\s]/)[0] ?? "")) return "supplies";
  return "food";
}

const CREDIT_TYPES = /\s*\b(Arrived Late|Damaged|Out of Stock|Mispick|Mis-pick|Refused|Shorted|Short|Quality|Customer Return|Wrong Item|Not Ordered|Duplicate)\b\s*/;

/** Split the middle columns: description, brand, (credit type), pack size, … */
function splitMiddle(middle: string, isCredit: boolean): { description: string; brand: string; packSize: string } {
  // A credit memo has a "credit type" column (Arrived Late, Damaged, …),
  // sometimes only one space away from the brand. Turn it into a column gap.
  const m = isCredit ? middle.replace(CREDIT_TYPES, "   ") : middle;
  const cols = m.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  const description = cols[0] ?? m.trim();
  const rest = cols.slice(1);
  const packIdx = rest.findIndex((c) => PACK.test(c) && /\d/.test(c));
  const brand = packIdx > 0 ? rest.slice(0, packIdx).join(" ") : packIdx === -1 ? (rest[0] ?? "") : "";
  const packSize = packIdx >= 0 ? rest[packIdx] : "";
  return { description, brand, packSize };
}

/** Page, header, and summary lines that never belong to an item. */
const NOT_ITEM_TEXT =
  /^(INVOICE|CREDIT MEMO|VENDOR SHIP|DELIVERY SUMMARY|IMPORTANT NOTICE|CUSTOMER ACCEPTANCE|ACCOUNT NUMBER|FREIGHT TERMS|QUANTITY|ORD\b|UNIT\b|BILL TO|SHIPPED|TOTAL|PRODUCT TOTAL|AS SHIPPED|READY TO EAT|REFER TO|PAGE \d)/i;

/** A short wrapped piece of the description on the line under an item. */
function isContinuation(line: string): boolean {
  const t = line.trim();
  return (
    !!t &&
    t.length <= 30 &&
    !/\$/.test(t) &&
    /^[A-Z][A-Z0-9 .,'"#/&%:-]*$/.test(t) &&
    !SECTIONS.test(t) &&
    !NOT_ITEM_TEXT.test(t)
  );
}

/** Read one US Foods invoice / credit memo / vendor ship invoice. Null if it isn't one. */
export function parseUsFoodsDocument(lines: string[]): UsFoodsDocument | null {
  const trimmed = lines.map((l) => l.replace(/\s+$/, ""));
  const first = trimmed.find((l) => l.trim())?.trim() ?? "";
  const isCredit = /^CREDIT MEMO\b/.test(first);
  if (!isCredit && !/^(VENDOR SHIP )?INVOICE\b/.test(first)) return null;

  let documentNumber = "";
  let invoiceNumber = "";
  let date: string | null = null;
  let orderNumber: string | null = null;

  for (let i = 0; i < trimmed.length - 1; i++) {
    const head = trimmed[i];
    const values = trimmed[i + 1].trim().split(/\s+/);
    if (!documentNumber && /^ACCOUNT NUMBER\b/.test(head.trim())) {
      if (isCredit) {
        documentNumber = values[1] ?? "";
        invoiceNumber = values[2] ?? "";
        orderNumber = values[3] ?? null;
      } else {
        documentNumber = values[1] ?? "";
        invoiceNumber = documentNumber;
        date = isoDate(values.find((v) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)));
      }
    }
    if (isCredit && !date && /CREDIT MEMO DATE/.test(head)) {
      date = isoDate(values.find((v) => /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) ?? values.find((v) => /\//.test(v)));
    }
    if (!isCredit && !orderNumber && /^FREIGHT TERMS\b/.test(head.trim())) {
      orderNumber = values.find((v) => /^\d{5,}$/.test(v)) ?? null;
    }
  }

  const parsed: UsFoodsLine[] = [];
  let section: string | null = null;
  // Wrapped description lines only ever sit right under their item.
  let wrapLinesLeft = 0;
  for (const raw of trimmed) {
    const line = raw.trim();
    if (SECTIONS.test(line)) {
      section = line;
      wrapLinesLeft = 0;
      continue;
    }
    const m = line.match(LINE);
    if (m) {
      const [, sub, q1, q2, , unit, productNumber, middle, , unitPrice, paren, extended] = m;
      // A substitute line has no ordered column: its first number is shipped.
      const qty = Number(sub ? q1 : (q2 ?? q1));
      const credit = isCredit || paren === "(" || qty < 0;
      const { description, brand, packSize } = splitMiddle(middle, isCredit);
      const ext = money(extended);
      // Ordered but not shipped (a substitute line usually follows): nothing was bought.
      if (qty === 0 && ext === 0) {
        wrapLinesLeft = 0;
        continue;
      }
      parsed.push({
        section,
        productNumber,
        description,
        brand,
        packSize,
        qty: credit ? -Math.abs(qty) : qty,
        unit,
        unitPrice: money(unitPrice),
        extended: credit ? -Math.abs(ext) : ext,
        category: classifyUsFoodsLine(description, section),
      });
      wrapLinesLeft = 2;
      continue;
    }
    const last = parsed[parsed.length - 1];
    if (last && wrapLinesLeft > 0 && isContinuation(line)) {
      last.description = `${last.description} ${line}`.replace(/\s+/g, " ");
      last.category = classifyUsFoodsLine(last.description, last.section);
      wrapLinesLeft--;
    } else {
      wrapLinesLeft = 0;
    }
  }

  const text = trimmed.join("\n");
  const pick = (re: RegExp) => {
    const m = text.match(re);
    return m ? money(m[1]) : null;
  };
  const delivered = pick(/DELIVERED AMOUNT\s+-?\$([\d,]+\.\d{2})/);
  const productTotal = pick(/Product Total\s+-?\$([\d,]+\.\d{2})/);
  const sumLines = Math.round(parsed.reduce((s, l) => s + l.extended, 0) * 100) / 100;
  let total = delivered ?? productTotal ?? Math.abs(sumLines);
  if (isCredit) total = -Math.abs(total);

  if (!documentNumber || !date) return null;
  return {
    kind: isCredit ? "credit" : "invoice",
    documentNumber,
    invoiceNumber: invoiceNumber || documentNumber,
    date,
    orderNumber,
    total,
    lines: parsed,
  };
}

export interface BulkFundingOrder {
  invoiceNumber: string;
  deliveryOrder: string;
  site: string | null;
  date: string | null;
}

/** Read a Bulk Funding Order cover sheet from its form fields. Null if it isn't one. */
export function parseBulkFundingOrder(fields: Record<string, string>): BulkFundingOrder | null {
  const get = (re: RegExp) => Object.entries(fields).find(([k]) => re.test(k))?.[1]?.trim() ?? "";
  const invoiceNumber = get(/INVOICE NO/i);
  const deliveryOrder = get(/DELIVERY ORDER/i);
  if (!invoiceNumber || !deliveryOrder) return null;
  return {
    invoiceNumber,
    deliveryOrder,
    site: get(/SITE NO/i).match(/^\d{4}/)?.[0] ?? null,
    date: isoDate(get(/^DATE$/i)),
  };
}

/** Totals by category; lines that don't add up to the document total go to food. */
export function categoryTotals(doc: Pick<UsFoodsDocument, "lines" | "total">): Record<PurchaseCategory, number> {
  const t: Record<PurchaseCategory, number> = { food: 0, alcohol: 0, supplies: 0 };
  for (const l of doc.lines) t[l.category] += l.extended;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const unassigned = r2(doc.total - (t.food + t.alcohol + t.supplies));
  t.food = r2(t.food + unassigned);
  t.alcohol = r2(t.alcohol);
  t.supplies = r2(t.supplies);
  return t;
}
