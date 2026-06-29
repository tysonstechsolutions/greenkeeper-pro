/**
 * Human labels for the Financial Watch engine's category keys.
 *
 * Kept local to this feature (and pure — no React/hook imports) so the
 * deterministic engine can produce readable flag text without coupling to the
 * `use client` budget hook. Values mirror budgetCategoryLabels / the revenue
 * CATEGORIES list so the wording matches the rest of the app.
 */
import type { BudgetCategory } from "@/types/database";

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  labor: "Labor",
  chemicals: "Chemicals",
  fertilizer: "Fertilizer",
  seed: "Seed",
  equipment_purchase: "Equipment Purchase",
  equipment_repair: "Equipment Repair",
  fuel: "Fuel",
  irrigation: "Irrigation",
  supplies: "Supplies",
  capital_projects: "Capital Projects",
  training: "Training",
  other: "Other",
};

/** Revenue source keys (revenue_entries.category — no DB enum type exists). */
export type RevenueCategory =
  | "greens_fees"
  | "cart_rentals"
  | "pro_shop"
  | "food_beverage"
  | "events"
  | "memberships"
  | "driving_range"
  | "other";

export const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  greens_fees: "Greens Fees",
  cart_rentals: "Cart Rentals",
  pro_shop: "Pro Shop",
  food_beverage: "Food & Beverage",
  events: "Events",
  memberships: "Memberships",
  driving_range: "Driving Range",
  other: "Other",
};

/** Readable label for a budget category key (falls back to the raw key). */
export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key as BudgetCategory] ?? key;
}

/** Readable label for a revenue category key (falls back to the raw key). */
export function revenueCategoryLabel(key: string): string {
  return REVENUE_CATEGORY_LABELS[key as RevenueCategory] ?? key;
}
