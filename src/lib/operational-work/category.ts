import type { OperationalWorkItem } from "./types";

export type OperationalCategory = "restaurant" | "pro_shop" | "grounds" | "admin";

export const OPERATIONAL_CATEGORY_ORDER: OperationalCategory[] = [
  "restaurant", "pro_shop", "grounds", "admin",
];

export const OPERATIONAL_CATEGORY_LABELS: Record<OperationalCategory, string> = {
  restaurant: "Restaurant",
  pro_shop: "Pro Shop",
  grounds: "Grounds & Equipment",
  admin: "Admin & Money",
};

/**
 * Coarse business-area bucket. Every item maps to exactly one category so
 * nothing is ever hidden — anything that is not clearly Restaurant, Pro Shop,
 * or Grounds falls through to Admin & Money.
 *
 * Department values produced by the adapters: "food_and_beverage", "pro_shop",
 * "maintenance", and "administration". "golf_operations" is handled defensively
 * in case a future source emits it.
 */
export function categoryOf(item: OperationalWorkItem): OperationalCategory {
  if (item.department === "food_and_beverage") return "restaurant";
  if (item.department === "pro_shop" || item.department === "golf_operations") return "pro_shop";
  if (item.department === "maintenance" || item.sourceType === "equipment") return "grounds";
  return "admin";
}
