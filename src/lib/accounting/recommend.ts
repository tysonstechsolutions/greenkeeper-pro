/**
 * Best-guess Site / Cost Center / G/L Account for something being bought or
 * someone being paid, with a short reason, so documents start out right and
 * a wrong pick is easy to spot.
 *
 * Deterministic keyword rules (no network), built from the cost-center
 * "answer keys" in PR Audit (migration 20260608) and the golf course's usual
 * G/L accounts. Always a suggestion: the person filling the form decides.
 */
import { COST_CENTER_CODES, GL_ACCOUNT_CODES, SITE_CODES } from "./official-codes";

export interface CodeSuggestion {
  code: string;
  /** Plain-English why, e.g. "Food bought to sell at Buckley's". */
  reason: string;
}

// ── The golf course's cost centers and sites ──────────────────────────────

export const CC = {
  proShopResale: "20086",
  courseProgram: "20087",
  range: "25224",
  rentals: "25229",
  maintenance: "25581",
  buckleys: "20091",
} as const;

export const SITE = {
  golfCourse: "7009",
  maintenance: "7010",
  buckleys: "7011",
} as const;

/** The codes this operation uses day to day, shown first in every picker. */
export const COMMON_SITES = [SITE.golfCourse, SITE.maintenance, SITE.buckleys];
export const COMMON_COST_CENTERS = [
  CC.proShopResale,
  CC.courseProgram,
  CC.buckleys,
  CC.range,
  CC.rentals,
  CC.maintenance,
];
export const COMMON_GL_ACCOUNTS = [
  "151110", // resale inventory food
  "151120", // resale inventory alcohol
  "151130", // resale inventory merchandise
  "641000", // utilities
  "681000", // r&m vehicles
  "683000", // r&m FF&E
  "684000", // r&m grounds
  "685000", // r&m bldg & fac
  "701000", // supplies
  "701003", // office supplies
  "701004", // linen towels
  "701005", // cleaning tools and supplies
  "701006", // uniforms
  "701011", // supplies chemicals
  "781000", // advertising & promotion
  "782001", // training
  "783000", // contract services
];

/** "20091 — GLK BUCKLEY'S F & B". */
export function codeLabel(kind: "site" | "cost_center" | "gl_account", code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "";
  const list: { code: string; label: string }[] =
    kind === "site" ? SITE_CODES : kind === "cost_center" ? COST_CENTER_CODES : GL_ACCOUNT_CODES;
  const hit = list.find((x) => x.code === c);
  return hit ? `${c} — ${hit.label}` : c;
}

export function isOfficialCode(kind: "site" | "cost_center" | "gl_account", code: string | null | undefined): boolean {
  const c = (code ?? "").trim();
  const list: { code: string }[] =
    kind === "site" ? SITE_CODES : kind === "cost_center" ? COST_CENTER_CODES : GL_ACCOUNT_CODES;
  return !!c && list.some((x) => x.code === c);
}

// ── Keyword rules ──────────────────────────────────────────────────────────

interface Rule {
  /** Whole-word-ish keywords (lowercase). A rule matches when any appears. */
  words: string[];
  code: string;
  reason: string;
}

function norm(text: string | null | undefined): string {
  return ` ${(text ?? "").toLowerCase().replace(/[^a-z0-9&]+/g, " ")} `;
}

/**
 * The longest keyword found, or null. Whole words and simple plurals
 * ("glove" finds "gloves"); a trailing * matches a word start ("aerat*"
 * finds "aeration").
 */
function matches(haystack: string, words: string[]): string | null {
  let best: string | null = null;
  for (const w of words) {
    const hit = w.endsWith("*")
      ? haystack.includes(` ${w.slice(0, -1)}`)
      : haystack.includes(` ${w} `) || haystack.includes(` ${w}s `) || haystack.includes(` ${w}es `);
    const shown = w.replace(/\*$/, "");
    if (hit && (!best || shown.length > best.length)) best = shown;
  }
  return best;
}

/** The rule whose keyword is most specific (longest); earlier rules win ties. */
function bestRule(haystack: string, rules: Rule[], allow: (r: Rule) => boolean = () => true): { rule: Rule; hit: string } | null {
  let best: { rule: Rule; hit: string } | null = null;
  for (const rule of rules) {
    if (!allow(rule)) continue;
    const hit = matches(haystack, rule.words);
    if (hit && (!best || hit.length > best.hit.length)) best = { rule, hit };
  }
  return best;
}

const FOOD = [
  "food", "hot dog", "hotdog", "bun", "burger", "patty", "patties", "chicken", "wing", "pizza", "fries", "cheese",
  "bread", "produce", "lettuce", "tomato", "onion", "meat", "beef", "pork", "bacon", "egg", "sauce", "condiment",
  "ketchup", "mustard", "mayo", "chip", "snack", "candy", "soda", "pop", "water bottle", "coffee", "tea", "juice",
  "ice cream", "us foods", "usfoods", "sysco", "gordon food", "taco", "tortilla", "sandwich", "deli", "pretzel",
];
const ALCOHOL = ["beer", "wine", "liquor", "alcohol", "keg", "spirits", "vodka", "whiskey", "bourbon", "rum", "tequila", "seltzer", "ipa", "lager"];
const RESALE_MERCH = [
  "golf ball", "glove", "hat", "cap", "visor", "apparel", "polo", "shirt for resale", "headcover", "towel for resale",
  "tee", "tees", "ball marker", "divot tool", "golf bag", "umbrella", "sunscreen", "merchandise", "resale",
];
const RANGE = ["range ball", "range balls", "range basket", "hitting mat", "range mat", "tee divider", "ball picker", "picker", "range net", "netting", "driving range", "ball washer", "ball dispenser"];
const RENTALS = ["rental club", "rental clubs", "club set", "cart battery", "cart batteries", "golf cart", "cart tire", "cart part", "cart seat"];
const TURF = [
  "fertilizer", "seed", "sod", "sand", "topdress", "topdressing", "mulch", "soil", "turf", "irrigation", "sprinkler",
  "rotor", "valve box", "aerat*", "aerifier", "tine", "flag", "flagstick", "hole cup", "tee marker", "bunker",
  "herbicide", "fungicide", "insecticide", "pesticide", "wetting agent", "chemical", "grass", "greens", "fairway",
  "mower", "reel", "bedknife", "blade", "spray", "sprayer",
];
const CLEANING = ["cleaning", "cleaner", "soap", "sanitizer", "disinfectant", "bleach", "trash bag", "garbage bag", "can liner", "mop", "broom", "paper towel", "toilet paper", "janitorial", "degreaser", "glove nitrile", "nitrile"];
const OFFICE = ["office", "paper", "toner", "ink", "printer paper", "pen", "pencil", "stapler", "folder", "binder", "envelope", "label", "post it", "clipboard", "notebook"];
const UNIFORM = ["uniform", "staff shirt", "work shirt", "polo for staff", "apron", "chef coat", "work boot", "safety vest", "rain gear"];
const LINEN = ["linen", "tablecloth", "napkin cloth", "bar towel", "kitchen towel"];
const VEHICLE = [
  "truck", "utility vehicle", "workman", "gator", "vehicle", "trailer", "tire", "oil change",
  "golf cart", "cart battery", "cart batteries", "cart tire", "cart part", "cart seat",
];
const EQUIPMENT_REPAIR = ["engine", "belt", "filter", "spark plug", "hydraulic", "bearing", "repair part", "parts", "part", "battery", "equipment repair", "fryer repair", "cooler repair", "freezer repair", "compressor"];
const BUILDING = ["hvac", "plumbing", "electrical", "light bulb", "bulb", "paint", "door", "lock", "roof", "window", "drywall", "faucet", "toilet", "building", "furnace", "water heater", "fixture"];
const CHEM_SUPPLY = ["chlorine", "ice melt", "salt"];
const MARKETING = ["advertis*", "flyer", "poster", "banner", "promotion", "promotional", "marketing", "sign printing", "print ad", "social media"];
const TRAINING = ["training", "class", "course fee", "certification", "license renewal", "conference", "seminar", "cpr", "servsafe"];
const CONTRACT = ["contract", "contractor", "pest control", "labor", "installation", "inspection", "repair service", "lease"];
const UTILITIES = ["electric bill", "utility", "utilities", "natural gas", "water bill", "propane"];
const SOFTWARE = ["software", "subscription", "license key", "app subscription"];
const COMPUTER = ["computer", "laptop", "tablet", "ipad", "monitor", "keyboard", "mouse", "printer", "router", "hard drive"];
const AWARDS = ["trophy", "trophies", "award", "prize", "plaque", "gift card"];
const FREIGHT = ["freight", "shipping", "delivery fee"];
const SMALLWARES = ["smallwares", "pan", "pot", "utensil", "tongs", "ladle", "cutting board", "container", "to go", "to-go", "cup lid", "lids", "straw", "napkin", "plate", "fork", "spoon", "knife"];

/**
 * Supplies that belong to whoever uses them (cleaning, office, uniforms…):
 * when one of these is the most specific word, the cost center comes from
 * context instead of, say, "gloves" sounding like pro shop merchandise.
 */
const FOLLOWS_CONTEXT = [...CLEANING, ...OFFICE, ...UNIFORM, ...LINEN, ...BUILDING, ...TRAINING, ...COMPUTER, ...SOFTWARE, ...UTILITIES];

const COST_CENTER_RULES: Rule[] = [
  { words: FOLLOWS_CONTEXT, code: "", reason: "" },
  { words: ALCOHOL, code: CC.buckleys, reason: "Alcohol is sold at Buckley's" },
  { words: FOOD, code: CC.buckleys, reason: "Food and drink are Buckley's" },
  { words: SMALLWARES, code: CC.buckleys, reason: "Kitchen and serving supplies are Buckley's" },
  { words: RANGE, code: CC.range, reason: "Driving range supplies" },
  { words: RENTALS, code: CC.rentals, reason: "Rental clubs and golf carts" },
  { words: RESALE_MERCH, code: CC.proShopResale, reason: "Merchandise bought to resell in the pro shop" },
  { words: TURF, code: CC.maintenance, reason: "Course maintenance (turf, irrigation, mowers)" },
];

const GL_RULES: Rule[] = [
  { words: ALCOHOL, code: "151120", reason: "Alcohol bought to resell" },
  { words: FOOD, code: "151110", reason: "Food and drink bought to resell" },
  { words: RESALE_MERCH, code: "151130", reason: "Merchandise bought to resell" },
  { words: UTILITIES, code: "641000", reason: "Utilities" },
  { words: TRAINING, code: "782001", reason: "Training and certifications" },
  { words: MARKETING, code: "781000", reason: "Advertising and promotion" },
  { words: AWARDS, code: "785000", reason: "Awards and prizes" },
  { words: SOFTWARE, code: "710000", reason: "Software and subscriptions" },
  { words: COMPUTER, code: "701300", reason: "Computer equipment" },
  { words: FREIGHT, code: "731000", reason: "Freight and shipping" },
  { words: UNIFORM, code: "701006", reason: "Staff uniforms" },
  { words: LINEN, code: "701004", reason: "Linens and towels" },
  { words: CLEANING, code: "701005", reason: "Cleaning supplies" },
  { words: OFFICE, code: "701003", reason: "Office supplies" },
  { words: CHEM_SUPPLY, code: "701011", reason: "Chemical supplies" },
  { words: BUILDING, code: "685000", reason: "Building and facility repairs" },
  { words: VEHICLE, code: "681000", reason: "Vehicle repairs" },
  { words: TURF, code: "684000", reason: "Grounds maintenance (turf, irrigation)" },
  { words: EQUIPMENT_REPAIR, code: "683000", reason: "Equipment repairs and parts" },
  { words: CONTRACT, code: "783000", reason: "Contracted services" },
  { words: SMALLWARES, code: "701000", reason: "Kitchen and serving supplies" },
];

/** Where the purchase is for, when nothing in the text decides it. */
export type AccountingContext = "golf" | "maintenance" | "buckleys" | "pro_shop";

const CONTEXT_COST_CENTER: Record<AccountingContext, CodeSuggestion> = {
  golf: { code: CC.courseProgram, reason: "General golf course program" },
  maintenance: { code: CC.maintenance, reason: "Course maintenance" },
  buckleys: { code: CC.buckleys, reason: "Buckley's" },
  pro_shop: { code: CC.proShopResale, reason: "Pro shop" },
};

/** Context from the person: the F&B Manager buys for Buckley's. */
export function contextForRole(role: string | null | undefined, department?: string | null): AccountingContext | null {
  if (role === "fb_manager" || department === "food_and_beverage") return "buckleys";
  if (department === "maintenance" || role === "mechanic" || role === "foreman") return "maintenance";
  if (role === "pro" || department === "pro_shop" || department === "golf_operations") return "golf";
  return null;
}

/** Cost center for an item description (and optional vendor), else from context. */
export function recommendCostCenter(
  text: string | null | undefined,
  context?: AccountingContext | null,
): CodeSuggestion | null {
  const h = norm(text);
  // At Buckley's everything is Buckley's, whatever the item.
  if (context === "buckleys") {
    const hit = matches(h, [...FOOD, ...ALCOHOL]);
    return { code: CC.buckleys, reason: hit ? `"${hit}" for Buckley's` : "Bought for Buckley's" };
  }
  const best = bestRule(h, COST_CENTER_RULES);
  if (best && best.rule.code) return { code: best.rule.code, reason: `${best.rule.reason} ("${best.hit}")` };
  return context ? CONTEXT_COST_CENTER[context] : null;
}

/** Site follows the cost center: maintenance shop, Buckley's, or the course. */
export function recommendSite(costCenter: string | null | undefined): CodeSuggestion | null {
  const cc = (costCenter ?? "").trim();
  if (!cc) return null;
  if (cc === CC.maintenance) return { code: SITE.maintenance, reason: "Maintenance shop (Bldg 3311)" };
  if (cc === CC.buckleys) return { code: SITE.buckleys, reason: "Buckley's (Bldg 8400)" };
  if (([CC.courseProgram, CC.proShopResale, CC.range, CC.rentals] as string[]).includes(cc)) {
    return { code: SITE.golfCourse, reason: "Golf course clubhouse (Bldg 8400)" };
  }
  return null;
}

/** G/L account for an item description, falling back to the cost center's usual account. */
export function recommendGlAccount(
  text: string | null | undefined,
  costCenter?: string | null,
): CodeSuggestion | null {
  const h = norm(text);
  const cc = (costCenter ?? "").trim();
  const best = bestRule(h, GL_RULES, (r) => {
    // Food and drink only count as resale inventory when they're for sale.
    if ((r.code === "151110" || r.code === "151120") && cc && cc !== CC.buckleys) return false;
    if (r.code === "151130" && cc && cc !== CC.proShopResale) return false;
    return true;
  });
  if (best) return { code: best.rule.code, reason: `${best.rule.reason} ("${best.hit}")` };
  if (cc === CC.buckleys) return { code: "151110", reason: "Buckley's purchases are usually food for resale" };
  if (cc === CC.proShopResale) return { code: "151130", reason: "Pro shop merchandise for resale" };
  if (cc === CC.maintenance) return { code: "684000", reason: "Course maintenance is usually grounds repairs" };
  if (cc === CC.rentals) return { code: "681000", reason: "Golf carts are vehicles" };
  if (cc) return { code: "701000", reason: "General supplies" };
  return null;
}

/** All three for one line, each following the one before. */
export function recommendLineCodes(
  text: string | null | undefined,
  context?: AccountingContext | null,
): { site: CodeSuggestion | null; costCenter: CodeSuggestion | null; glAccount: CodeSuggestion | null } {
  const costCenter = recommendCostCenter(text, context);
  return {
    costCenter,
    site: recommendSite(costCenter?.code),
    glAccount: recommendGlAccount(text, costCenter?.code),
  };
}

/** An employee's home cost center from their HR position / department. */
export function recommendHomeCostCenter(
  position: string | null | undefined,
  department?: string | null,
): CodeSuggestion | null {
  const p = norm(position);
  if (department === "food_and_beverage" || matches(p, ["cook", "food", "bartender", "server", "dishwasher", "f&b"])) {
    return { code: CC.buckleys, reason: "Food & Beverage staff are paid from Buckley's" };
  }
  if (department === "maintenance" || matches(p, ["laborer", "mechanic", "greenskeeper", "maintenance", "equipment operator", "gardener"])) {
    return { code: CC.maintenance, reason: "Course maintenance staff" };
  }
  if (matches(p, ["recreation aid", "golf operations", "golf course manager", "superintendent", "golf professional", "starter", "ranger"])) {
    return { code: CC.courseProgram, reason: "Golf course program staff" };
  }
  return department ? { code: CC.courseProgram, reason: "Golf course program staff" } : null;
}

const LOCATION_RULES: Rule[] = [
  { words: ["buckley", "buckleys", "kitchen", "bar", "restaurant", "dining", "walk in", "walk-in cooler", "fryer", "grill", "dish"], code: CC.buckleys, reason: "At Buckley's" },
  { words: ["maintenance shop", "maint shop", "3311", "pump house", "pumphouse", "irrigation", "shop bay", "chemical building", "fuel station"], code: CC.maintenance, reason: "Course maintenance area" },
  { words: ["driving range", "range"], code: CC.range, reason: "Driving range" },
  { words: ["cart barn", "cart storage", "cart shed"], code: CC.rentals, reason: "Cart barn (rental carts)" },
  { words: ["pro shop", "clubhouse", "8400", "starter", "restroom", "course", "hole", "tee box", "green"], code: CC.courseProgram, reason: "Golf course and clubhouse" },
];

/**
 * A work order's cost center: where the work is (Buckley's kitchen, the
 * maintenance shop, the range…) decides first, then what it is, then who's
 * asking. The clubhouse/course program is the fallback.
 */
export function recommendWorkOrderCostCenter(
  location: string | null | undefined,
  description: string | null | undefined,
  context?: AccountingContext | null,
): CodeSuggestion {
  const where = bestRule(norm(location), LOCATION_RULES);
  if (where) return { code: where.rule.code, reason: `${where.rule.reason} ("${where.hit}")` };
  const inText = bestRule(norm(description), LOCATION_RULES);
  if (inText) return { code: inText.rule.code, reason: `${inText.rule.reason} ("${inText.hit}")` };
  const what = recommendCostCenter(description, context);
  return what ?? { code: CC.courseProgram, reason: "Golf course and clubhouse" };
}
