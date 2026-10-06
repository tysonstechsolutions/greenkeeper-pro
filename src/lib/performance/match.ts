/**
 * Match what RecTrac sold ("Coors Light", "CALLAWAY SUPERSO", "DOMESTIC BEER")
 * to what the month-end count sheets say each item costs ("COORS LIGHT 16OZ",
 * "CALLAWAY SUPERSOFT"), so every item gets a real cost per unit.
 *
 * Names are cut down to the words that identify the product (sizes, "can",
 * "bottle" and the like are dropped), RecTrac's 18-character cut-offs are
 * allowed for, and the old catch-all buttons (Domestic Beer, Import Beer,
 * Wine, Bottle Soda…) cover a family of items.
 *
 * Pure.
 */

export interface CostItem {
  description: string;
  /** Count-sheet category: BEER, SPECIAL, WINE, LIQUOR, BEVERAGES, SNACKS… */
  category: string | null;
  unitCost: number;
}

/** Words that never identify a product on their own. */
const FILLER = new Set([
  "OZ", "CAN", "CANS", "CN", "BTL", "BT", "BOTTLE", "BOTTLES", "CS", "CASE", "EA", "PK", "PACK", "THE", "OF", "AND",
  "ASST", "ASSORTED", "VARIETY", "ALBTL", "BULLET", "MINI", "LTR", "ML", "LITER", "W", "WITH", "BX", "CT",
]);

/** Spellings that mean the same thing. */
const SAME: Record<string, string> = {
  LITE: "LIGHT",
  LT: "LIGHT",
  MICHALOB: "MICHELOB",
  GUINESS: "GUINNESS",
  SUNCRUISER: "SUN CRUISER",
  BMOON: "BLUE MOON",
  NUTRIGAIN: "NUTRIGRAIN",
  CABARNET: "CABERNET",
  ZINFADEL: "ZINFANDEL",
  REV: "REVOLUTION",
  CUT: "CUTWATER",
  EXPRESSO: "ESPRESSO",
  LEINIE: "LEINENKUGEL",
  XX: "EQUIS",
  PBR: "PABST",
  CHIPS: "CHIP",
  PRETZELS: "PRETZEL",
  BARS: "BAR",
  SODAS: "SODA",
};

/**
 * Cutwater flavors as the invoices shorten them ("CUT LIME MARG", "CUT LONG
 * ISLAN", "CUT TIKI MAI T"), spelled out so they meet the count sheets and
 * the flavors rung up at the bar ("Lime Margarita", "Long Island").
 */
const CUTWATER_FLAVOR: Record<string, string> = {
  MARG: "MARGARITA",
  ISLAN: "ISLAND",
  STRAW: "STRAWBERRY",
  RUSS: "RUSSIAN",
  ESP: "ESPRESSO",
  MARTIN: "MARTINI",
  VOD: "VODKA",
  TRANS: "TRANSFUSION",
  PINE: "PINEAPPLE",
  PEPERMINT: "PEPPERMINT",
  T: "TAI",
};

/** Product words, in order, with sizes and filler removed. */
export function productWords(description: string): string[] {
  const cleaned = description
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const out: string[] = [];
  const raw = cleaned.split(/\s+/).filter(Boolean);
  for (let i = 0; i < raw.length; i++) {
    let w = raw[i];
    // Short brand codes at the front (Lakeshore, Kloss, and RecTrac names).
    const FRONT: Record<string, string[]> = {
      GI: ["GOOSE", "ISLAND"],
      SN: ["SIERRA", "NEVADA"],
      TH: ["TIGHTHEAD"],
      NH: ["NEW", "HOLLAND"],
    };
    if (i === 0 && FRONT[w]) {
      out.push(...FRONT[w]);
      continue;
    }
    // Sizes and pack counts: 16, 16OZ, 160Z, 24EA, 6/4…
    if (/^\d+(\.\d+)?$/.test(w) || /^\d+[A-Z]{1,3}$/.test(w) || /^\d+\/\d+/.test(w)) continue;
    if (FILLER.has(w)) continue;
    w = SAME[w] ?? w;
    if (out[0] === "CUTWATER") w = CUTWATER_FLAVOR[w] ?? w;
    // Singular, so "Sprecher's" meets "SPRECHER" and "TENDERS" meets "TENDER".
    out.push(...w.split(" ").map((x) => (x.length > 4 && x.endsWith("S") && !x.endsWith("SS") ? x.slice(0, -1) : x)));
  }
  return out;
}

/** Old catch-all buttons and the count-sheet items each one covers. */
const FAMILIES: { sale: RegExp; covers: (c: CostItem) => boolean }[] = [
  {
    sale: /^DOMESTIC BEER$/i,
    covers: (c) =>
      /^BEER$/i.test(c.category ?? "") &&
      /\b(BUD|COORS|MILLER|MICHALOB|MICHELOB|PABST|YUENGLING|LEINENKUGEL|SUMMER SHANDY)\b/i.test(c.description),
  },
  {
    sale: /^IMPORT BEER$/i,
    covers: (c) =>
      /^BEER$/i.test(c.category ?? "") &&
      /\b(MODELO|CORONA|PACIFICO|STELLA|HEINEKEN|DOS EQUIS|GUIN+ESS|GUINESS)\b/i.test(c.description) &&
      !/0\.0/.test(c.description),
  },
  { sale: /^WINE$/i, covers: (c) => /^WINE$/i.test(c.category ?? "") && /SUTTER/i.test(c.description) },
  {
    sale: /^BOTTLE SODA$|^SODA$|^POP$/i,
    covers: (c) => /\b(SODA: VARIETY|PEPSI|MOUNTAIN DEW|DIET PEPSI)\b/i.test(c.description) && !/CLUB|\b2\s?L\b|\/2L/i.test(c.description),
  },
  { sale: /^BOTTLE WATER$|^WATER$/i, covers: (c) => /^WATER\b/i.test(c.description) },
  { sale: /^CHIPS\/PRETZELS$/i, covers: (c) => /^(CHIPS?|SNACK: PRETZELS)\b/i.test(c.description) },
];

export interface CostMatch {
  unitCost: number;
  /** The count-sheet items it came from. */
  from: string[];
}

/** When the same name has two costs (a sleeve and a dozen), the one the sale price fits. */
function pickForPrice(costs: number[], price: number | null): number {
  if (costs.length === 1 || price == null) return costs.reduce((s, c) => s + c, 0) / costs.length;
  const fits = costs.filter((c) => c <= price);
  return fits.length ? Math.max(...fits) : Math.min(...costs);
}

/**
 * The unit cost of a sold item, or null when nothing on the count sheets
 * matches. `price` (what it sold for, each) settles items counted two ways.
 */
export function matchCost(saleDescription: string, book: CostItem[], price: number | null = null): CostMatch | null {
  const family = FAMILIES.find((f) => f.sale.test(saleDescription.trim()));
  if (family) {
    const hits = book.filter(family.covers);
    if (!hits.length) return null;
    return { unitCost: avg(hits.map((h) => h.unitCost)), from: hits.map((h) => h.description) };
  }

  const sale = productWords(saleDescription);
  if (!sale.length) return null;
  const saleSet = new Set(sale);
  let best = 0;
  let hits: CostItem[] = [];
  for (const c of book) {
    const words = productWords(c.description);
    if (!words.length) continue;
    const set = new Set(words);
    // RecTrac cuts names at 18 characters: the last sold word may be a prefix.
    const has = (w: string, i: number) => set.has(w) || (i === sale.length - 1 && w.length >= 3 && words.some((x) => x.startsWith(w)));
    const saleInItem = sale.every(has);
    const itemInSale = words.every((w) => saleSet.has(w));
    if (!saleInItem && !itemInSale) continue;
    const shared = sale.filter(has).length;
    const score = shared / new Set([...sale, ...words]).size;
    if (score > best + 1e-9) {
      best = score;
      hits = [c];
    } else if (Math.abs(score - best) < 1e-9) {
      hits.push(c);
    }
  }
  if (!hits.length || best < 0.3) return null;
  // Same name twice (counted by the sleeve and by the dozen): keep them apart.
  const sameName = new Set(hits.map((h) => h.description.toUpperCase().trim())).size === 1;
  const unitCost = sameName ? pickForPrice(hits.map((h) => h.unitCost), price) : avg(hits.map((h) => h.unitCost));
  return { unitCost, from: [...new Set(hits.map((h) => h.description))] };
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
