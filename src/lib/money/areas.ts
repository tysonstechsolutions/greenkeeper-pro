// Per-area money mapping — the worksheet's hard rule: each part of the
// operation keeps SEPARATE finances. Revenue categories and the five NAF
// cost-center codes both map deterministically onto the same four areas
// (plus buckets for anything unmapped), so the P&L never guesses.

export type MoneyArea = "course" | "range" | "restaurant" | "pro_shop";

export const MONEY_AREAS: MoneyArea[] = ["course", "range", "restaurant", "pro_shop"];

export const AREA_LABELS: Record<MoneyArea | "unassigned", string> = {
  course: "Golf Course",
  range: "Driving Range",
  restaurant: "Restaurant",
  pro_shop: "Pro Shop",
  unassigned: "Unassigned",
};

/** revenue_entries.category → area. Every category maps — no unassigned. */
export const AREA_BY_REVENUE_CATEGORY: Record<string, MoneyArea> = {
  greens_fees: "course",
  cart_rentals: "course",
  memberships: "course",
  events: "restaurant", // party/room rentals & league food run through F&B
  food_beverage: "restaurant",
  driving_range: "range",
  pro_shop: "pro_shop",
  other: "course",
};

/**
 * NAF cost-center code → area (the five authorized PR codes, see
 * pr-accounting-codes.ts). Unknown codes fall to "unassigned" and are shown
 * as their own bucket rather than silently lumped somewhere.
 */
export const AREA_BY_COST_CENTER: Record<string, MoneyArea> = {
  "20086": "pro_shop", // GOLF MDSE RESALE
  "20087": "course", // GOLF COURSE PROGRAM
  "25224": "range", // GOLF RANGE PROG
  "25229": "course", // GC CLUB/CART RENTAL
  "25581": "course", // GC MAINTENANCE
};

export function areaForRevenueCategory(category: string): MoneyArea {
  return AREA_BY_REVENUE_CATEGORY[category] ?? "course";
}

export function areaForCostCenter(costCtr: string | null | undefined): MoneyArea | "unassigned" {
  if (!costCtr) return "unassigned";
  return AREA_BY_COST_CENTER[costCtr.trim()] ?? "unassigned";
}
