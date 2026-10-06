/**
 * Delivery invoices from vendors other than US Foods: the beer distributors
 * (Lakeshore Beverage, Kloss Distributing), the MWR Central Warehouse (sodas,
 * some alcohol, supplies), and mess requisitions from other MWR outlets.
 * They're saved the same way as US Foods invoices — a purchase with its line
 * items, each line food / alcohol / supplies, restaurant or bar, coded to its
 * cost center and G/L — so food cost and bar cost see them.
 *
 * Pure. The purchases page reads a photo with AI (lib/pr/receipt-extract),
 * the person checks the lines, and planVendorInvoice makes what's saved.
 */
import type { ExtractedReceipt } from "@/lib/pr/receipt-extract";
import { barCogs, codeLine, type Outlet } from "./coding";
import { classifyUsFoodsLine, type PurchaseCategory } from "./usfoods";

export interface VendorProfile {
  key: string;
  name: string;
  /** Put in front of the vendor's item numbers so they never collide with US Foods'. */
  prefix: string;
  /** What most lines on its invoices are. */
  category: PurchaseCategory;
  hint: string;
}

export const VENDORS: VendorProfile[] = [
  { key: "lakeshore", name: "Lakeshore Beverage", prefix: "LSB-", category: "alcohol", hint: "Beer, Cutwater, seltzers" },
  { key: "kloss", name: "Kloss Distributing", prefix: "KLS-", category: "alcohol", hint: "Beer, Twisted Tea, White Claw" },
  { key: "warehouse", name: "MWR Central Warehouse", prefix: "WH-", category: "food", hint: "Sodas, Gatorade, water, supplies" },
  { key: "requisition", name: "Mess requisition", prefix: "REQ-", category: "food", hint: "Transfers from another MWR outlet" },
  { key: "other", name: "", prefix: "", category: "food", hint: "Any other vendor" },
];

export function vendorProfile(name: string): VendorProfile {
  const n = name.trim().toLowerCase();
  return (
    VENDORS.find((v) => v.name && v.name.toLowerCase() === n) ??
    VENDORS.find((v) => v.key !== "other" && n.includes(v.key)) ??
    { ...VENDORS[VENDORS.length - 1], name: name.trim() }
  );
}

/** Words that make a line alcohol on any vendor's invoice. */
const ALCOHOL_WORDS =
  /\b(BEER|LAGER|ALE|IPA|PILSNER|STOUT|PORTER|BOCK|SHANDY|HARD SELTZER|VODKA SELTZER|HARD CIDER|WINE|VODKA|TEQUILA|RUM|GIN|WHISKE?Y|BOURBON|SCOTCH|LIQUEUR|SCHNAPPS|CUTWATER|TWISTED TEA|WHITE CLAW|CARBLISS|COORS|BUDWEISER|BUD LIGHT|MILLER|MICHELOB|MODELO|CORONA|PACIFICO|STELLA|GUINNESS|HEINEKEN|YUENGLING|BLUE MOON|SAM ADAMS|SIERRA NEVADA|SHINER|PABST|LEINENKUGEL|DOS EQUIS|GOOSE ISLAND|ANGRY ORCHARD|NUTRL|SUNCRUISER)\b/;
const NON_ALCOHOL =
  /\b(N\/A|NON[- ]?ALC\w*|0\.0|ZERO|RED ?BULL|SODA|PEPSI|COKE|SPRITE|GATORADE|WATER|JUICE|LEMONADE|LIPTON|BRISK|STARRY|MOUNTAIN DEW)\b/;
/** Supplies named anywhere in the description ("Enmotion 10" Paper Towel", "ECOLAB: APEX RINSE"). */
const SUPPLY_WORDS =
  /\b(TOWELS?|TISSUE|SOAP|CLEANER|DISINFECTANT|SANITIZER|SANITIZING|DEGREASER|DETERGENT|BLEACH|RINSE|ECOLAB|NAPKINS?|PLATES?|UTENSILS?|CUTLERY|PENS?|WIPES?|BAGS?|GLOVES?|LINERS?|PAPER|TRASH|CHEMICAL)\b/;
const CHARGE = /\b(SERVICE CHARGE|DELIVERY CHARGE|DELIVERY FEE|FUEL SURCHARGE|FREIGHT|SHIPPING)\b/;

/**
 * Food, alcohol, or supplies for a line. Supply nouns win (napkins, bags,
 * bleach…); then a beverage-vendor line is alcohol unless it's plainly not
 * (sodas, Red Bull, NA beer); other vendors' lines are alcohol only when the
 * description says so.
 */
export function classifyVendorLine(description: string, vendor: Pick<VendorProfile, "category">): PurchaseCategory {
  const d = description.toUpperCase().replace(/:/g, ",").trim();
  if (classifyUsFoodsLine(d) === "supplies" || SUPPLY_WORDS.test(d)) return "supplies";
  if (CHARGE.test(d)) return vendor.category;
  if (NON_ALCOHOL.test(d)) return "food";
  if (vendor.category === "alcohol") return "alcohol";
  return ALCOHOL_WORDS.test(d) ? "alcohol" : classifyUsFoodsLine(d);
}

/** A delivery or service charge line (it joins the invoice's main cost). */
export function isChargeLine(description: string): boolean {
  return CHARGE.test(description.toUpperCase());
}

/** A product number for a line: the vendor's item number, or one made from the description. */
export function vendorProductNumber(prefix: string, item: string | null | undefined, description: string): string {
  const it = (item ?? "").trim();
  if (it) return `${prefix}${it}`.toUpperCase();
  const slug = description
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}${slug || "ITEM"}`;
}

export interface VendorLineInput {
  item?: string | null;
  description: string;
  pack_size?: string | null;
  qty: number;
  unit_price: number;
  /** What the line costs after its discount (negative on a credit). */
  extended: number;
  category: PurchaseCategory;
  /** Alcohol is always bar; otherwise restaurant unless marked bar. */
  outlet?: Outlet | null;
}

export interface VendorInvoiceInput {
  vendor: string;
  kind: "invoice" | "credit";
  document_number: string;
  purchase_date: string;
  lines: VendorLineInput[];
  /** The bottom line printed on the invoice (negative for a credit). */
  total: number;
  notes?: string | null;
  site?: string | null;
}

export interface PlannedVendorInvoice {
  row: {
    purchase_date: string;
    vendor: string;
    amount: number;
    kind: "invoice" | "credit";
    document_number: string;
    against_invoice: null;
    order_number: null;
    delivery_order: null;
    site: string | null;
    food_amount: number;
    alcohol_amount: number;
    supplies_amount: number;
    bar_cogs_amount: number;
    notes: string;
  };
  lines: {
    line_no: number;
    section: null;
    product_number: string;
    description: string;
    brand: null;
    pack_size: string | null;
    qty: number;
    unit: string;
    unit_price: number;
    extended: number;
    category: PurchaseCategory;
    outlet: Outlet;
    cost_ctr: string;
    gl_acct: string;
  }[];
  linesTotal: number;
  /** Printed total minus the lines. Zero when the invoice is read right. */
  difference: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What to save for a vendor invoice. Lines are coded the same way US Foods
 * lines are; the categories add up to the printed total (anything the lines
 * don't explain lands on the invoice's main category, and difference says so).
 */
export function planVendorInvoice(input: VendorInvoiceInput): PlannedVendorInvoice {
  const profile = vendorProfile(input.vendor);
  const sign = input.kind === "credit" ? -1 : 1;
  const lines = input.lines
    .filter((l) => l.description.trim() !== "" && (Number(l.extended) !== 0 || Number(l.qty) !== 0))
    .map((l, i) => {
      const extended = r2(sign * Math.abs(Number(l.extended)));
      const product_number = vendorProductNumber(profile.prefix, l.item, l.description);
      const coded = codeLine({ product_number, category: l.category, description: l.description }, new Map());
      const outlet: Outlet = l.category === "alcohol" ? "bar" : (l.outlet ?? coded.outlet);
      return {
        line_no: i + 1,
        section: null,
        product_number,
        description: l.description.trim(),
        brand: null,
        pack_size: l.pack_size?.trim() || null,
        qty: r2(Math.abs(Number(l.qty))),
        unit: "CS",
        unit_price: Math.abs(Number(l.unit_price)),
        extended,
        category: l.category,
        outlet,
        cost_ctr: coded.cost_ctr,
        gl_acct: coded.gl_acct,
      };
    });

  const totals: Record<PurchaseCategory, number> = { food: 0, alcohol: 0, supplies: 0 };
  for (const l of lines) totals[l.category] += l.extended;
  const linesTotal = r2(totals.food + totals.alcohol + totals.supplies);
  const total = r2(sign * Math.abs(Number(input.total)));
  const difference = r2(total - linesTotal);
  // What the lines don't explain goes with the invoice's main cost.
  const main: PurchaseCategory =
    totals.alcohol !== 0 && Math.abs(totals.alcohol) >= Math.abs(totals.food) ? "alcohol" : totals.food !== 0 ? "food" : profile.category;
  totals[main] += difference;

  const name = vendorProfile(input.vendor).name || input.vendor.trim();
  const label = input.kind === "credit" ? `Credit ${input.document_number}` : `Invoice ${input.document_number}`;
  const extra = input.notes?.trim() ? ` · ${input.notes.trim()}` : "";
  return {
    row: {
      purchase_date: input.purchase_date,
      vendor: name,
      amount: total,
      kind: input.kind,
      document_number: input.document_number.trim(),
      against_invoice: null,
      order_number: null,
      delivery_order: null,
      site: input.site ?? null,
      food_amount: r2(totals.food),
      alcohol_amount: r2(totals.alcohol),
      supplies_amount: r2(totals.supplies),
      // The bar's share: its lines, plus an unexplained difference on a bar invoice.
      bar_cogs_amount: r2(barCogs(lines) + (main === "alcohol" ? difference : 0)),
      notes: `${label} · ${lines.length} item${lines.length === 1 ? "" : "s"}${extra}`,
    },
    lines,
    linesTotal,
    difference,
  };
}

/** Editable lines from what the AI read off a photo of the invoice. */
export function linesFromReceipt(receipt: ExtractedReceipt, vendor: Pick<VendorProfile, "category">): VendorLineInput[] {
  return receipt.items.map((it) => {
    const category = classifyVendorLine(it.description, vendor);
    return {
      item: null,
      description: it.description.trim(),
      pack_size: null,
      qty: it.qty,
      unit_price: it.unit_price,
      extended: it.line_total,
      category,
      outlet: category === "alcohol" ? "bar" : null,
    };
  });
}
