// Opening a RecTrac sales entry on Revenue shows what was sold that day.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { soldItems } from "@/app/revenue/sale-day-items";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/revenue",
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, profile: { id: "u1", role: "gm" }, loading: false, isFbManager: false }),
}));
vi.mock("@/lib/api/client", () => ({ callApi: vi.fn() }));

const entries = [
  {
    id: "e1",
    entry_date: "2026-09-30",
    category: "pro_shop",
    amount: 330,
    description: "RecTrac Pro shop sales (17 items)",
    rounds_count: null,
    notes: null,
    created_by: null,
    created_at: "2026-10-06T00:00:00Z",
    sales_report_id: "r1",
  },
  {
    id: "e2",
    entry_date: "2026-09-30",
    category: "greens_fees",
    amount: 163,
    description: "Typed in",
    rounds_count: 4,
    notes: null,
    created_by: null,
    created_at: "2026-10-06T00:00:00Z",
    sales_report_id: null,
  },
];

// One client for the whole test, like the app's (a new one each render would reload forever).
const client = vi.hoisted(() => ({
  from: () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain,
      order: chain,
      limit: chain,
      gte: chain,
      eq: chain,
      in: chain,
      then: (resolve: (v: unknown) => void) => resolve({ data: entriesRef.rows, error: null }),
    });
    return q;
  },
}));
const entriesRef = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));


entriesRef.rows = entries;

const reads = vi.hoisted(() => ({ filters: [] as string[][] }));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async (table: string, opts: { filters: string[] }) => {
    reads.filters.push([table, ...opts.filters]);
    return [
      { inventory_code: "MA7009-16-204-4", description: "Got Booted T-shirt", qty: 4, gross: 72, discount: 0, net: 72 },
      { inventory_code: "MA7009-16-204-4", description: "MENS T SHIRT RAISE", qty: 3, gross: 66, discount: 0, net: 66 },
      { inventory_code: "MA7009-16-209-0", description: "SYLO 1980400181 GL", qty: 1, gross: 34, discount: 0, net: 34 },
      { inventory_code: "MA7009-16-207-0", description: "PRO V1", qty: 9, gross: 158, discount: 0, net: 158 },
    ];
  },
}));

describe("sold items for a day", () => {
  it("adds the same item together and puts the biggest sellers first", () => {
    expect(
      soldItems([
        { inventory_code: "A", description: "Soda", qty: 2, gross: 5, discount: 0, net: 5 },
        { inventory_code: "B", description: "Burger", qty: 1, gross: 9.5, discount: 0, net: 9.5 },
        { inventory_code: "A", description: "SODA ", qty: 1, gross: 2.5, discount: 0, net: 2.5 },
        { inventory_code: "C", description: "Refunded hat", qty: -1, gross: -20, discount: 0, net: -20 },
        { inventory_code: "D", description: "Voided", qty: 0, gross: 0, discount: 0, net: 0 },
      ]),
    ).toEqual([
      { description: "Burger", qty: 1, discount: 0, net: 9.5 },
      { description: "Soda", qty: 3, discount: 0, net: 7.5 },
      { description: "Refunded hat", qty: -1, discount: 0, net: -20 },
    ]);
  });

  it("opens a report entry to show that day's items, and leaves typed-in entries alone", async () => {
    const { default: Page } = await import("@/app/revenue/page");
    render(<Page />);
    const open = await screen.findByRole("button", { name: /Show what was sold: RecTrac Pro shop sales \(17 items\)/ });
    expect(screen.getByRole("button", { name: /Typed in/ })).toBeDisabled();

    fireEvent.click(open);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").map((r) => r.textContent);
    expect(rows[1]).toBe("PRO V19$158.00");
    expect(rows[2]).toBe("Got Booted T-shirt4$72.00");
    expect(rows.at(-1)).toBe("4 different items17$330.00");
    expect(reads.filters[0]).toEqual(["sales_item_days", "report_id=eq.r1", "sale_date=eq.2026-09-30"]);
    expect(screen.queryByText(/may have been changed by hand/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Hide what was sold/ }));
    expect(screen.queryByRole("table")).toBeNull();
  });
});
