/**
 * Revenue categories (revenue_entries.category) in one place. Buckley's is
 * split in two because the restaurant and the bar have separate COGS
 * targets: food_beverage is the restaurant, bar is the bar.
 */

export const REVENUE_CATEGORIES = [
  { value: "greens_fees", label: "Greens Fees" },
  { value: "cart_rentals", label: "Cart Rentals" },
  { value: "pro_shop", label: "Pro Shop" },
  { value: "food_beverage", label: "Buckley's Restaurant (F&B)" },
  { value: "bar", label: "Buckley's Bar" },
  { value: "events", label: "Events" },
  { value: "memberships", label: "Memberships" },
  { value: "driving_range", label: "Driving Range" },
  { value: "other", label: "Other" },
] as const;

export type RevenueCategoryKey = (typeof REVENUE_CATEGORIES)[number]["value"];

export const REVENUE_CATEGORY_KEYS = new Set<string>(REVENUE_CATEGORIES.map((c) => c.value));

export const REVENUE_LABELS: Record<string, string> = Object.fromEntries(
  REVENUE_CATEGORIES.map((c) => [c.value, c.label]),
);

/** The two Buckley's categories (what the F&B Manager sees and logs). */
export const BUCKLEYS_REVENUE_CATEGORIES: RevenueCategoryKey[] = ["food_beverage", "bar"];

/** Which RecTrac report a sales upload is. Each has its own report. */
export type ReportArea = "restaurant" | "bar" | "pro_shop" | "other";

export const REPORT_AREAS: { value: ReportArea; label: string; hint: string }[] = [
  { value: "restaurant", label: "Restaurant", hint: "Buckley's restaurant RecTrac report — every line counts as restaurant sales" },
  { value: "bar", label: "Bar", hint: "Buckley's bar RecTrac report — every line counts as bar sales" },
  { value: "pro_shop", label: "Pro Shop", hint: "Pro shop RecTrac report — greens fees, carts, merchandise, range" },
  { value: "other", label: "Other report", hint: "Anything else — check each line's category" },
];

/**
 * The category a report line lands in. A restaurant or bar report is all
 * that outlet's sales. On the pro shop report, food or drink rung up at the
 * counter stays restaurant sales; everything else keeps what was read.
 */
export function categoryForReportLine(area: ReportArea, readCategory: string): RevenueCategoryKey {
  if (area === "restaurant") return "food_beverage";
  if (area === "bar") return "bar";
  return REVENUE_CATEGORY_KEYS.has(readCategory) ? (readCategory as RevenueCategoryKey) : "other";
}
