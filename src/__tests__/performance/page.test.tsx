import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { TextPiece } from "@/lib/pdf/text-lines";
import { parseBudgetReport } from "@/lib/sap/budget-report";
import { budgetLineRows } from "@/lib/sap/budget-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ role: "gm" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: { id: "u1", role: auth.role },
    loading: false,
    isFbManager: auth.role === "fb_manager",
  }),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});
// Charts are drawn by recharts in the browser; here they're stand-ins.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="chart" /> }));
vi.mock("@/lib/utils/date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/date")>("@/lib/utils/date");
  return { ...actual, todayLocal: () => "2026-10-06" };
});

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, filters: {} as Record<string, string[]> }));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectAll: async (table: string, opts: { filters?: string[] }) => {
    db.filters[table] = opts.filters ?? [];
    if (db.tables[table] === undefined && table.startsWith("sap_")) throw new Error(`relation "public.${table}" does not exist`);
    return db.tables[table] ?? [];
  },
}));

beforeEach(() => {
  auth.role = "gm";
  db.filters = {};
  db.tables = {
    restaurant_purchases: [
      { purchase_date: "2026-09-02", amount: 300, food_amount: 0, alcohol_amount: 300, supplies_amount: 0, bar_cogs_amount: 300, vendor: "Lakeshore Beverage" },
      { purchase_date: "2026-09-03", amount: 900, food_amount: 900, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0, vendor: "US Foods" },
    ],
    revenue_entries: [
      { entry_date: "2025-09-10", amount: 3000, category: "bar" },
      { entry_date: "2026-09-10", amount: 1500, category: "bar" },
      { entry_date: "2026-09-10", amount: 3000, category: "food_beverage" },
      { entry_date: "2026-09-12", amount: 2000, category: "pro_shop" },
    ],
    inventory_valuations: [],
    inventory_valuation_lines: [
      { description: "TWISTED TEA 16OZ", category: "SPECIAL", unit_cost: 1.65, inventory_valuations: { outlet: "bar", month_end: "2026-09-30" } },
      { description: "PRO V1", category: null, unit_cost: 12.06, inventory_valuations: { outlet: "pro_shop", month_end: "2026-09-30" } },
    ],
    sales_item_days: [
      { outlet: "bar", sale_date: "2026-09-10", description: "Twisted Tea", qty: 100, net: 650 },
      { outlet: "pro_shop", sale_date: "2026-09-12", description: "PRO V1", qty: 40, net: 600 },
    ],
    restaurant_purchase_lines: [
      { description: "CUT LEMON DROP", extended: 300, category: "alcohol", outlet: "bar", restaurant_purchases: { purchase_date: "2026-09-02" } },
    ],
  };
});

/** The cost-of-sales tile. */
const headline = () => screen.getByText("Cost of sales, last 12 months").closest(".gk-card")!.textContent;

async function renderPage() {
  const { default: Page } = await import("@/app/performance/page");
  return render(<Page />);
}

describe("Performance page", () => {
  it("shows the restaurant first, through the last full month, with its target", async () => {
    await renderPage();
    expect(await screen.findByText("What to do")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Restaurant · 35%", "Bar · 25%", "Pro shop · 65%"]);
    expect(headline()).toContain("30%"); // $900 of $3,000
    expect(screen.getByText("On target")).toBeTruthy();
    expect(screen.getByText("Through Sep 2026")).toBeTruthy();
    expect(db.filters.revenue_entries).toEqual(["category=in.(food_beverage,bar,pro_shop)", "entry_date=gte.2024-09-01"]);
  });

  it("shows the bar's prices, its trend, and the Cutwater that never sold", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Bar/ }));
    expect(headline()).toContain("20%"); // $300 of $1,500
    expect(screen.getByText(/-50% in the 1 month with reports both years/)).toBeTruthy();
    expect(screen.getByText("$300 bought that never shows up in bar sales by name")).toBeTruthy();
    // Twisted Tea at $6.50 costs $1.65: 25.4%, so $6.75.
    const row = within(screen.getByRole("table", { name: "Item prices" })).getByText("Twisted Tea").closest("tr")!;
    expect(row.textContent).toBe("Twisted Tea100$6.50$1.6525.4%$6.75$25");
  });

  it("costs the pro shop from its item costs", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Pro shop/ }));
    // PRO V1: 40 × $12.06 = $482.40 on $600 sold → 80.4%, filled across $2,000.
    expect(headline()).toContain("80.4%");
    expect(screen.getByText(/Pro shop cost comes from item costs/)).toBeTruthy();
  });

  it("shows the F&B Manager only the restaurant and the bar", async () => {
    auth.role = "fb_manager";
    await renderPage();
    await screen.findByText("What to do");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Restaurant · 35%", "Bar · 25%"]);
    expect(db.filters.revenue_entries[0]).toBe("category=in.(food_beverage,bar)");
    expect(db.filters.sales_item_days).toContain("outlet=in.(restaurant,bar)");
  });

  it("works without the SAP tables, and shows the official numbers once a report is saved", async () => {
    // Without them (database update not run): no SAP tile, no error.
    await renderPage();
    await screen.findByText("What to do");
    expect(screen.queryByText(/Official \(SAP\)/)).toBeNull();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it("puts SAP's official cost of goods beside the worked-out one", async () => {
    const pages = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "sap", "budget-pages.json"), "utf8")) as TextPiece[][];
    db.tables.sap_budget_reports = [{ id: "r1", fiscal_year: 2026, period: 12, period_name: "September", run_date: "2026-10-06", source_file: null }];
    db.tables.sap_budget_lines = budgetLineRows(parseBudgetReport(pages)!, "r1");
    await renderPage();
    await screen.findByText("What to do");
    expect(db.filters.sap_budget_lines).toEqual(["report_id=eq.r1", "cost_center=in.(20091,20086)"]);
    const official = screen.getByText("Official (SAP), FY26 through September").closest(".gk-card")!.textContent;
    expect(official).toContain("59.4%");
    expect(official).toContain("$22,791 cost on $38,394 sales");
    // $3,000 of restaurant sales here against SAP's $38,394.
    expect(screen.getByText("SAP has $35,394 more food sales than the reports here")).toBeTruthy();
    expect(screen.getByText("Official food cost of goods is 59.4%, target 35%")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Pro shop/ }));
    expect(screen.getByText("Official (SAP), FY26 through September").closest(".gk-card")!.textContent).toContain("53.1%");
  });
});
