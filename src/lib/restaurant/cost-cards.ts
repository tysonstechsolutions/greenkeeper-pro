/**
 * Cost cards for Buckley's menu: each item's ingredients, the portion of
 * each, and what the plate costs at the latest US Foods price.
 *
 * Every ingredient names its US Foods product number and how many portion
 * units come in what's invoiced (a case of 30 patties, a pound of corned
 * beef). The price is the latest invoice line for that product; until one
 * is on file, the price the card was written with. Portions are the
 * proposed standards from the October 2026 COGS review.
 *
 * Pure: give it the latest invoice prices, get back plate costs.
 */

export interface Ingredient {
  label: string;
  /** US Foods product number; none for an allowance (fryer oil). */
  productNumber: string | null;
  /** The portion unit: oz, each, slice, chip. */
  unit: string;
  /** Portion units in one invoiced unit (30 patties in a case; 16 oz in a pound). */
  perPurchase: number;
  /** Price per invoiced unit the card was written with (Sept 2026 invoices). */
  fallbackPrice: number;
  /** What the invoiced unit is, for the reader: "case of 30". */
  purchase: string;
}

const I = (label: string, productNumber: string | null, unit: string, perPurchase: number, fallbackPrice: number, purchase: string): Ingredient => ({
  label, productNumber, unit, perPurchase, fallbackPrice, purchase,
});

/** Every ingredient on the cards, by key. */
export const INGREDIENTS = {
  patty: I("Beef patty 80/20, 5.33 oz", "1560796", "each", 30, 51.86, "case of 30"),
  bun: I("Hamburger bun 4\"", "2178427", "each", 96, 28.35, "case of 96"),
  american: I("American cheese, .5 oz slice", "3340817", "slice", 160, 11.15, "5 lb, 160 slices"),
  cheddarSlice: I("Cheddar, .75 oz slice", "6772032", "slice", 213, 28.93, "case, 10 lb"),
  lettuce: I("Lettuce, burger leaf", "7779093", "oz", 160, 30.48, "case, 10 lb"),
  tomato: I("Tomato", "7333024", "oz", 160, 21.6, "case, 10 lb"),
  redOnion: I("Red onion", "4326690", "oz", 400, 23.05, "bag, 25 lb"),
  pickle: I("Dill pickle chip", "6199833", "chip", 2250, 36.81, "5 gal, about 2,250"),
  ketchup: I("Ketchup", "4886669", "oz", 600, 44.74, "case, 30/20 oz"),
  mustard: I("Mustard", "9160516", "oz", 144, 20.15, "case, 16/9 oz"),
  mayo: I("Mayonnaise", "1328152", "oz", 512, 55.25, "case, 4/1 gal"),
  foil: I("Foil wrap sheet", "9328311", "each", 2400, 240.75, "case of 2,400"),
  tray3: I("Paper food tray, 3 lb", "6805857", "each", 500, 29.65, "case of 500"),
  tray5: I("Paper food tray, 5 lb", "6805923", "each", 500, 46.54, "case of 500"),
  container: I("Clear container 6x6", "5865282", "each", 500, 60.82, "case of 500"),
  fries: I("Fries 5/16\" battered", "5990518", "oz", 480, 53.34, "case, 30 lb"),
  oil: I("Fryer oil allowance", null, "portion", 1, 0.1, "per fried portion"),
  hotDog: I("Hot dog 6:1, 6\"", "3330099", "each", 60, 40.58, "case, 10 lb (60)"),
  hotDogBun: I("Hot dog bun 6\"", "1054265", "each", 96, 26.4, "case of 96"),
  brat: I("Bratwurst, 3 oz", "8270068", "each", 53, 43.9, "case, 10 lb (about 53)"),
  tenders: I("Chicken tenders, battered", "2953834", "oz", 160, 28.8, "case, 10 lb"),
  chickenBreast: I("Chicken breast, 4 oz", "5874870", "each", 48, 38.51, "case, 12 lb (48)"),
  chickenFritter: I("Chicken breast fritter, panko", "7781784", "oz", 160, 44.68, "case, 10 lb"),
  wings: I("Breaded wings, hot & spicy", "1033752", "oz", 240, 41.94, "case, 15 lb"),
  curds: I("Breaded cheese curds", "6105884", "oz", 160, 54.27, "case, 10 lb"),
  rings: I("Onion rings, breaded", "4332292", "oz", 256, 55.39, "case, 16 lb"),
  cod: I("Beer-battered cod", "9791229", "oz", 160, 95.87, "case, 10 lb"),
  shrimp: I("Panko shrimp 16-20", "8723942", "each", 216, 80.16, "case, 12 lb (about 216)"),
  ranch: I("Ranch dressing", "43992", "oz", 512, 43.17, "case, 4/1 gal"),
  blueCheese: I("Blue cheese dressing", "7328537", "oz", 128, 20.45, "1 gal"),
  caesar: I("Caesar dressing", "1016283", "oz", 128, 18.56, "1 gal"),
  thousand: I("Thousand Island", "5328083", "oz", 128, 12.83, "1 gal"),
  buffalo: I("Buffalo sauce", "5175377", "oz", 512, 34.06, "case, 4/1 gal"),
  salsa: I("Salsa", "1017425", "oz", 552, 58.63, "case, 4/138 oz"),
  sourCream: I("Sour cream cup, 1 oz", "2761791", "each", 100, 12.1, "case of 100"),
  tortilla12: I("Flour tortilla 12\"", "3593294", "each", 144, 46.53, "case of 144"),
  cornTortilla: I("Corn tortilla 6\"", "1597296", "each", 360, 32.39, "case of 360"),
  bread: I("Bread slice", "9327602", "slice", 232, 38.51, "case, 8 loaves"),
  swiss: I("Swiss, .75 oz slice", "1419514", "slice", 192, 29.64, "case, 9 lb"),
  cornedBeef: I("Corned beef, cooked (65% yield)", "6863981", "oz", 10.4, 8.85, "per lb raw"),
  kraut: I("Sauerkraut", "9330077", "oz", 600, 48.31, "case, 6 #10 cans"),
  butter: I("Butter", "899807", "oz", 576, 86.11, "case, 36 lb"),
  bacon: I("Bacon slice", "8335937", "slice", 240, 61.7, "case, 15 lb (about 240)"),
  ham: I("Ham, sliced", "1176528", "oz", 192, 49.0, "case, 12 lb"),
  turkey: I("Turkey breast, sliced", "8117129", "oz", 192, 45.36, "case, 12 lb"),
  saladMix: I("Salad mix", "6545800", "oz", 192, 41.17, "case, 12 lb"),
  romaine: I("Romaine", "5326418", "oz", 480, 33.85, "case of 24 heads"),
  cucumber: I("Cucumber", "3379038", "oz", 240, 12.05, "case of 24"),
  shreddedCheddar: I("Shredded cheddar", "1332642", "oz", 80, 11.69, "5 lb bag"),
  chihuahua: I("Shredded chihuahua cheese", "2276434", "oz", 80, 24.38, "5 lb bag"),
  parmesan: I("Grated parmesan", "3585031", "oz", 80, 24.93, "5 lb bag"),
  croutons: I("Croutons", "1805379", "oz", 160, 24.91, "case, 10 lb"),
  groundBeef: I("Ground beef 81/19", "5996541", "oz", 16, 4.53, "per lb"),
  tacoSeasoning: I("Taco seasoning", "1510080", "oz", 54, 14.61, "case, 6/9 oz"),
} as const;

export type IngredientKey = keyof typeof INGREDIENTS;

export interface CostCard {
  name: string;
  /** How RecTrac names it on sales reports (it cuts names at 18 characters). */
  sales: string[];
  menuPrice: number;
  /** Ingredient and how many portion units go on the plate. */
  lines: [IngredientKey, number][];
  build: string[];
  /** Portions still to be confirmed (no build agreed yet). */
  estimated?: boolean;
}

const BURGER_TOPPINGS: [IngredientKey, number][] = [["lettuce", 0.5], ["tomato", 0.75], ["redOnion", 0.5], ["pickle", 3], ["ketchup", 0.5], ["mustard", 0.25], ["foil", 1]];
const FRIED_SIDE = (main: IngredientKey, oz: number, tray: IngredientKey, dip: IngredientKey = "ranch"): [IngredientKey, number][] => [
  [main, oz], ["oil", 1], [dip, 1.5], [tray, 1],
];

export const COST_CARDS: CostCard[] = [
  { name: "Cheeseburger", sales: ["CHEESEBURGER"], menuPrice: 8, lines: [["patty", 1], ["bun", 1], ["american", 1], ...BURGER_TOPPINGS],
    build: ["Grill the patty to 155°F; cheese for the last 30 seconds.", "Bottom bun, lettuce, tomato, patty, onion, pickles, top bun.", "Ketchup and mustard on the top bun. Wrap in foil."] },
  { name: "Double cheeseburger", sales: ["DOUBLE CHEESE BURGER", "DOUBLE CHEESE BU", "DOUBLE CHEESEBURGER"], menuPrice: 12, lines: [["patty", 2], ["bun", 1], ["american", 2], ...BURGER_TOPPINGS],
    build: ["Grill both patties to 155°F; a slice on each.", "Build as the cheeseburger, patties stacked. Wrap in foil."] },
  { name: "Wisconsin burger", sales: ["WISCONSIN BURGER"], menuPrice: 14, lines: [["patty", 1], ["bun", 1], ["cheddarSlice", 1], ["bacon", 2], ["curds", 2], ["oil", 1], ...BURGER_TOPPINGS],
    build: ["Fry 2 oz curds at 350°F.", "Grill the patty to 155°F; cheddar for the last 30 seconds.", "Patty, cheddar, bacon, curds, burger toppings. Wrap in foil."] },
  { name: "Add bacon", sales: ["ADD BACON"], menuPrice: 1.5, lines: [["bacon", 2]], build: ["2 slices."] },
  { name: "Hot dog", sales: ["HOT DOG"], menuPrice: 4, lines: [["hotDog", 1], ["hotDogBun", 1], ["ketchup", 0.5], ["mustard", 0.25], ["foil", 1]],
    build: ["Roller grill; hold at 135°F or above.", "In the bun, one line of ketchup and mustard. Wrap in foil."] },
  { name: "Brat", sales: ["BRAT"], menuPrice: 4.5, lines: [["brat", 1], ["hotDogBun", 1], ["mustard", 0.5], ["redOnion", 0.5], ["foil", 1]],
    build: ["Grill to 165°F.", "In the bun with mustard and onion. Wrap in foil."] },
  { name: "Side of fries", sales: ["SIDE OF FRIES"], menuPrice: 3, lines: [["fries", 5], ["oil", 1], ["ketchup", 1], ["tray3", 1]],
    build: ["Fill the scoop to the 5 oz line.", "Fry at 350°F; salt. 3 lb tray, 1 oz ketchup cup."] },
  { name: "Fries basket", sales: ["FRIES BASKET"], menuPrice: 5, lines: [["fries", 8], ["oil", 1], ["ketchup", 1.5], ["tray5", 1]],
    build: ["Fill the scoop to the 8 oz line.", "Fry at 350°F; salt. 5 lb tray, 1.5 oz ketchup cup."] },
  { name: "Chicken tenders", sales: ["CHICKEN TENDERS"], menuPrice: 7, lines: FRIED_SIDE("tenders", 6, "tray5"),
    build: ["6 oz, about 4 pieces.", "Fry to 165°F. 5 lb tray, 1.5 oz ranch."] },
  { name: "Buffalo chicken wrap", sales: ["BUFFALO CHICKEN WRAP", "BUFFALO CHICKEN W"], menuPrice: 7,
    lines: [["tenders", 4], ["oil", 1], ["buffalo", 1], ["tortilla12", 1], ["lettuce", 0.5], ["tomato", 0.75], ["ranch", 1], ["foil", 1]],
    build: ["Fry 4 oz tenders to 165°F; toss in 1 oz sauce.", "Roll in a warm tortilla with lettuce, tomato, ranch. Cut, foil."] },
  { name: "Chicken sandwich", sales: ["CHICKEN SANDWICH"], menuPrice: 7, estimated: true,
    lines: [["chickenFritter", 4], ["oil", 1], ["bun", 1], ["lettuce", 0.5], ["tomato", 0.75], ["mayo", 0.5], ["foil", 1]],
    build: ["Fry the fritter to 165°F.", "Bun, mayo, lettuce, tomato, chicken. Wrap in foil."] },
  { name: "Wings, 6 pc", sales: ["WINGS 6 PC"], menuPrice: 7, lines: FRIED_SIDE("wings", 8, "tray5", "blueCheese"),
    build: ["Count 6 pieces.", "Fry to 165°F. 5 lb tray, 1.5 oz blue cheese."] },
  { name: "Wings, 10 pc", sales: ["WINGS 10 PC"], menuPrice: 10, estimated: true, lines: FRIED_SIDE("wings", 13.33, "tray5", "blueCheese"),
    build: ["Count 10 pieces.", "Fry to 165°F. 5 lb tray, 1.5 oz blue cheese."] },
  { name: "Side of cheese curds", sales: ["SIDE OF CHEESE CURDS", "SIDE OF CHEESE CU"], menuPrice: 5, lines: FRIED_SIDE("curds", 6, "tray3"),
    build: ["Weigh 6 oz to mark the scoop.", "Fry at 350°F. 3 lb tray, 1.5 oz ranch."] },
  { name: "Cheese curds basket", sales: ["CHEESE CURDS BASKET", "CHEESE CURDS BAS"], menuPrice: 8, estimated: true, lines: FRIED_SIDE("curds", 10, "tray5"),
    build: ["10 oz curds.", "Fry at 350°F. 5 lb tray, 1.5 oz ranch."] },
  { name: "Side of onion rings", sales: ["SIDE OF ONION RINGS", "SIDE OF ONION RING"], menuPrice: 5, lines: FRIED_SIDE("rings", 5, "tray3"),
    build: ["5 oz, about 7 rings.", "Fry at 350°F. 3 lb tray, 1.5 oz ranch."] },
  { name: "Onion rings basket", sales: ["ONION RINGS BASKET", "ONION RINGS BASKE"], menuPrice: 8, estimated: true, lines: FRIED_SIDE("rings", 8, "tray5"),
    build: ["8 oz rings.", "Fry at 350°F. 5 lb tray, 1.5 oz ranch."] },
  { name: "Fish basket", sales: ["FISH BASKET"], menuPrice: 15, estimated: true, lines: [["cod", 6], ["fries", 5], ["oil", 1], ["ketchup", 1], ["tray5", 1]],
    build: ["6 oz cod (3 pieces) and 5 oz fries.", "Fry at 350°F, fish to 145°F. 5 lb tray."] },
  { name: "Shrimp basket", sales: ["SHRIMP BASKET"], menuPrice: 12, estimated: true, lines: [["shrimp", 7], ["fries", 5], ["oil", 1], ["ketchup", 1], ["tray5", 1]],
    build: ["7 shrimp and 5 oz fries.", "Fry at 350°F. 5 lb tray."] },
  { name: "Reuben", sales: ["REUBEN SANDWICH", "REUBEN"], menuPrice: 12,
    lines: [["cornedBeef", 4], ["bread", 2], ["swiss", 2], ["kraut", 2], ["thousand", 1], ["butter", 0.25], ["foil", 1]],
    build: ["Weigh 4 oz corned beef every time.", "Buttered bread, Swiss, beef, drained kraut, dressing, Swiss.", "Grill both sides until hot. Cut, foil."] },
  { name: "Ham & cheese", sales: ["HAM & CHEESE"], menuPrice: 7.5, estimated: true,
    lines: [["ham", 4], ["american", 2], ["bread", 2], ["lettuce", 0.5], ["tomato", 0.75], ["mayo", 0.5], ["foil", 1]],
    build: ["4 oz ham, 2 slices cheese, lettuce, tomato, mayo on 2 slices bread. Cut, foil."] },
  { name: "Turkey & cheese", sales: ["TURKEY & CHEESE"], menuPrice: 7.5, estimated: true,
    lines: [["turkey", 4], ["american", 2], ["bread", 2], ["lettuce", 0.5], ["tomato", 0.75], ["mayo", 0.5], ["foil", 1]],
    build: ["4 oz turkey, 2 slices cheese, lettuce, tomato, mayo on 2 slices bread. Cut, foil."] },
  { name: "Chicken caesar wrap", sales: ["CHICKEN CAESAR WRAP"], menuPrice: 7, estimated: true,
    lines: [["chickenBreast", 1], ["romaine", 2], ["parmesan", 0.5], ["caesar", 1.5], ["tortilla12", 1], ["foil", 1]],
    build: ["Grill a 4 oz breast to 165°F; slice.", "Toss 2 oz romaine with dressing and parmesan; roll with the chicken. Cut, foil."] },
  { name: "Quesadilla", sales: ["QUESADILLA"], menuPrice: 12, estimated: true,
    lines: [["tortilla12", 1], ["chickenBreast", 1], ["chihuahua", 3], ["salsa", 2], ["sourCream", 1], ["tray5", 1]],
    build: ["Grilled 4 oz chicken and 3 oz cheese in a 12\" tortilla; grill both sides.", "Cut in 4. 2 oz salsa and a sour cream cup."] },
  { name: "Taco Tuesday", sales: ["TACO TUESDAY"], menuPrice: 7, estimated: true,
    lines: [["cornTortilla", 3], ["groundBeef", 3], ["tacoSeasoning", 0.33], ["shreddedCheddar", 1], ["lettuce", 0.5], ["salsa", 1], ["sourCream", 1], ["tray5", 1]],
    build: ["3 tacos: 1 oz seasoned beef each, cheese, lettuce.", "Salsa and a sour cream cup."] },
  { name: "Garden salad", sales: ["GARDEN SALAD"], menuPrice: 7, estimated: true,
    lines: [["saladMix", 5], ["tomato", 1], ["cucumber", 1], ["shreddedCheddar", 1], ["croutons", 0.5], ["ranch", 1.5], ["container", 1]],
    build: ["5 oz greens, tomato, cucumber, cheese, croutons.", "1.5 oz dressing on the side."] },
  { name: "Side salad", sales: ["SIDE SALAD"], menuPrice: 4, estimated: true,
    lines: [["saladMix", 2.5], ["tomato", 0.5], ["shreddedCheddar", 0.5], ["croutons", 0.25], ["ranch", 1.5], ["container", 1]],
    build: ["2.5 oz greens, tomato, cheese, croutons.", "1.5 oz dressing on the side."] },
  { name: "Chicken salad", sales: ["CHICKEN SALAD"], menuPrice: 12, estimated: true,
    lines: [["chickenBreast", 1.25], ["saladMix", 5], ["tomato", 1], ["cucumber", 1], ["shreddedCheddar", 1], ["croutons", 0.5], ["ranch", 1.5], ["container", 1]],
    build: ["Garden salad with a grilled 5 oz chicken breast, sliced."] },
];

export interface LatestPrice {
  unitPrice: number;
  /** yyyy-mm-dd of the invoice. */
  date: string;
}

export interface PricedLine {
  key: IngredientKey;
  label: string;
  qty: number;
  unit: string;
  unitCost: number;
  cost: number;
  /** Where the price came from: the latest invoice, or the card's own. */
  source: "invoice" | "card";
  priceDate: string | null;
  purchase: string;
  /** An invoice price far from the card's: probably invoiced in another unit, so the card's was used. */
  unitDiffers?: boolean;
}

export interface PricedCard {
  card: CostCard;
  lines: PricedLine[];
  cost: number;
  costPct: number;
  /** Lowest price at the standard, rounded up to a quarter. */
  priceAtStandard: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A price more than this many times off the card's is a different invoiced unit (a pack vs. a case). */
const UNIT_GAP = 2.5;

export function priceCard(card: CostCard, latest: Map<string, LatestPrice>, standard = 0.35): PricedCard {
  const lines = card.lines.map(([key, qty]): PricedLine => {
    const ing = INGREDIENTS[key];
    const live = ing.productNumber ? latest.get(ing.productNumber) : undefined;
    const off = live != null && (live.unitPrice > ing.fallbackPrice * UNIT_GAP || live.unitPrice < ing.fallbackPrice / UNIT_GAP);
    const price = live && !off ? live.unitPrice : ing.fallbackPrice;
    const unitCost = price / ing.perPurchase;
    return {
      key, label: ing.label, qty, unit: ing.unit, unitCost, cost: r2(unitCost * qty),
      source: live && !off ? "invoice" : "card", priceDate: live && !off ? live.date : null, purchase: ing.purchase,
      ...(off ? { unitDiffers: true } : {}),
    };
  });
  const cost = r2(lines.reduce((s, l) => s + l.unitCost * l.qty, 0));
  return {
    card, lines, cost,
    costPct: Math.round((cost / card.menuPrice) * 1000) / 10,
    priceAtStandard: Math.ceil((cost / standard) * 4 - 1e-9) / 4,
  };
}

/** Every product number the cards use, for loading their latest prices. */
export function cardProductNumbers(): string[] {
  return [...new Set(Object.values(INGREDIENTS).map((i) => i.productNumber).filter((p): p is string => !!p))];
}

/** The latest invoice price per product number (newest invoice wins). */
export function latestPrices(rows: { product_number: string; unit_price: number; date: string }[]): Map<string, LatestPrice> {
  const out = new Map<string, LatestPrice>();
  for (const r of rows) {
    const prev = out.get(r.product_number);
    if (Number(r.unit_price) > 0 && (!prev || r.date > prev.date)) out.set(r.product_number, { unitPrice: Number(r.unit_price), date: r.date });
  }
  return out;
}

/** A sold item's plate cost from its card, by the name RecTrac uses. */
export function cardCostFor(saleDescription: string, priced: PricedCard[]): PricedCard | null {
  const name = saleDescription.trim().toUpperCase();
  return priced.find((p) => p.card.sales.includes(name)) ?? null;
}
