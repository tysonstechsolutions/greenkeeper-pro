import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "../utils/test-utils";
import { parseUsFoodsDocument } from "@/lib/restaurant/usfoods";
import type { ReadResult } from "@/lib/restaurant/import";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/restaurant",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "fb1", full_name: "Brittany Flament", role: "fb_manager" }, user: { id: "fb1" } }),
}));

vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const db = vi.hoisted(() => ({
  purchases: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  sales: [] as Record<string, unknown>[],
  insertError: null as string | null,
  inserted: [] as Record<string, unknown>[],
  insertedLines: [] as Record<string, unknown>[],
  deleted: [] as string[],
  outlets: [] as Record<string, unknown>[],
  upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  patches: [] as { table: string; id: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async (table: string) =>
    table === "restaurant_purchases" ? db.purchases : table === "restaurant_product_outlets" ? db.outlets : db.lines,
  directSelectAll: async (table: string) =>
    table === "restaurant_purchases" ? db.purchases : table === "revenue_entries" ? db.sales : db.lines,
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    if (db.insertError) throw new Error(db.insertError);
    db.inserted.push(row);
    return { id: `p${db.inserted.length}` };
  },
  directInsertRows: async (_t: string, rows: Record<string, unknown>[]) => {
    db.insertedLines.push(...rows);
    return rows;
  },
  directDeleteRow: async (_t: string, _c: string, id: string) => {
    db.deleted.push(id);
  },
  directUpsertRows: async (table: string, rows: Record<string, unknown>[]) => {
    db.upserts.push({ table, rows });
  },
  directPatchRow: async (table: string, _c: string, id: string, patch: Record<string, unknown>) => {
    db.patches.push({ table, id, patch });
  },
  publicStorageUrl: () => "https://example.test/file.pdf",
}));

vi.mock("@/lib/supabase/storage", () => ({
  uploadPhoto: async () => ({ storagePath: "fb1/invoice.pdf" }),
}));

// PDF reading is covered in usfoods.test.ts; here it returns the parsed fixture.
const fixtureDoc = () => ({
  ...parseUsFoodsDocument(
    readFileSync(join(__dirname, "..", "fixtures", "usfoods", "invoice-1092941.txt"), "utf8").split("\n"),
  )!,
  fileName: "InvoiceDetails2.pdf",
  data: new Uint8Array([1, 2, 3]),
});
vi.mock("@/lib/restaurant/import", async () => {
  const actual = await vi.importActual<typeof import("@/lib/restaurant/import")>("@/lib/restaurant/import");
  return {
    ...actual,
    readUsFoodsFiles: async (): Promise<ReadResult> => ({
      documents: [fixtureDoc()],
      coverSheets: [{ invoiceNumber: "1092941", deliveryOrder: "N61463-26-F-0011", site: "7011", date: "2026-09-01", fileName: "cover.pdf" }],
      unreadable: ["notes.txt"],
    }),
  };
});

import RestaurantPurchasesPage from "@/app/restaurant/purchases/page";
import FoodCostPage from "@/app/restaurant/food-cost/page";
import OrderGuidePage from "@/app/restaurant/order-guide/page";

beforeEach(() => {
  db.purchases = [];
  db.lines = [];
  db.sales = [];
  db.insertError = null;
  db.inserted = [];
  db.insertedLines = [];
  db.deleted = [];
  db.outlets = [];
  db.upserts = [];
  db.patches = [];
  push.mockReset();
  sessionStorage.clear();
});

async function pickFiles() {
  render(<RestaurantPurchasesPage />);
  await screen.findByText(/No purchases logged yet/);
  const input = screen.getByLabelText("US Foods invoice files") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "usfoods.zip", { type: "application/zip" })] } });
  await screen.findByText(/Ready to import 1 document · \$624\.60/);
}

describe("Restaurant Purchases import", () => {
  it("previews, then saves the invoice with every line item", async () => {
    await pickFiles();
    expect(screen.getByText(/DO N61463-26-F-0011/)).toBeInTheDocument();
    expect(screen.getByText(/left out: notes\.txt/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save 1 document/ }));
    await screen.findByText(/Imported 1 document\./);
    expect(db.inserted[0]).toMatchObject({
      kind: "invoice",
      document_number: "1092941",
      amount: 624.6,
      food_amount: 574.49,
      supplies_amount: 50.11,
      delivery_order: "N61463-26-F-0011",
      invoice_path: "fb1/invoice.pdf",
      created_by: "fb1",
    });
    expect(db.insertedLines).toHaveLength(11);
    expect(db.insertedLines.every((l) => l.purchase_id === "p1")).toBe(true);
    // Every line is coded: food to 20091/151110, the chafing fuel to supplies.
    expect(db.insertedLines.find((l) => l.product_number === "2912038")).toMatchObject({
      category: "supplies",
      cost_ctr: "20091",
      gl_acct: "701000",
    });
    expect(db.insertedLines.find((l) => l.product_number === "8529315")).toMatchObject({
      outlet: "restaurant",
      cost_ctr: "20091",
      gl_acct: "151110",
    });
    expect(db.inserted[0].bar_cogs_amount).toBe(0);
  });

  it("shows the coding and lets an item be marked Bar, remembered for next time", async () => {
    await pickFiles();
    fireEvent.click(screen.getByRole("button", { name: /Invoice 1092941/ }));
    const charge = screen.getByText("Charge to").parentElement!;
    expect(within(charge).getByText("20091 · 151110 — RESALE INVENTORY FOOD")).toBeInTheDocument();
    expect(within(charge).getByText("$574.49")).toBeInTheDocument();
    expect(within(charge).getByText("20091 · 701000 — SUPPLIES")).toBeInTheDocument();
    expect(within(charge).getByText("$50.11")).toBeInTheDocument();

    const cheesecake = screen.getByRole("group", { name: /CHEESECAKE, PLN 9" 16 SLCD goes to/ });
    fireEvent.click(within(cheesecake).getByRole("button", { name: "Bar" }));
    expect(screen.getByText(/bar \$85\.27/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save 1 document/ }));
    await screen.findByText(/Imported 1 document\./);
    expect(db.inserted[0].bar_cogs_amount).toBe(85.27);
    expect(db.insertedLines.find((l) => l.product_number === "7004922")?.outlet).toBe("bar");
    expect(db.upserts).toEqual([
      { table: "restaurant_product_outlets", rows: [{ product_number: "7004922", outlet: "bar" }] },
    ]);
  });

  it("marks an item Bar on its own when it was marked Bar before", async () => {
    db.outlets = [{ product_number: "7004922", outlet: "bar" }];
    await pickFiles();
    expect(screen.getByText(/bar \$85\.27/)).toBeInTheDocument();
  });

  it("re-marks a saved line and updates the invoice's bar cost", async () => {
    db.purchases = [
      { id: "p9", purchase_date: "2026-09-01", vendor: "US Foods", amount: 100, invoice_path: null, notes: "Invoice 1", created_at: "", kind: "invoice", document_number: "1", food_amount: 100, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0 },
    ];
    db.lines = [
      { id: "l1", line_no: 1, product_number: "111", description: "LIME, 12 CT", brand: null, pack_size: "12 EA", qty: 1, unit: "CS", unit_price: 60, extended: 60, category: "food", outlet: "restaurant", cost_ctr: "20091", gl_acct: "151110" },
      { id: "l2", line_no: 2, product_number: "222", description: "BEEF", brand: null, pack_size: null, qty: 1, unit: "CS", unit_price: 40, extended: 40, category: "food", outlet: "restaurant", cost_ctr: "20091", gl_acct: "151110" },
    ];
    render(<RestaurantPurchasesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /US Foods — Invoice 1/ }));
    const lime = await screen.findByRole("group", { name: /LIME, 12 CT goes to/ });
    fireEvent.click(within(lime).getByRole("button", { name: "Bar" }));
    await screen.findByText(/Bar \$60\.00/);
    expect(db.patches).toEqual([
      { table: "restaurant_purchase_lines", id: "l1", patch: { outlet: "bar", cost_ctr: "20091", gl_acct: "151110" } },
      { table: "restaurant_purchases", id: "p9", patch: { bar_cogs_amount: 60 } },
    ]);
    expect(db.upserts).toEqual([{ table: "restaurant_product_outlets", rows: [{ product_number: "111", outlet: "bar" }] }]);
  });

  it("says to run the database update when the new columns are missing", async () => {
    db.insertError = "column \"kind\" of relation \"restaurant_purchases\" does not exist";
    await pickFiles();
    fireEvent.click(screen.getByRole("button", { name: /Save 1 document/ }));
    await screen.findByText(/hasn't been run yet\. Run 20261006120000_operations_upgrade\.sql/);
  });

  it("counts an invoice the database already has as already saved", async () => {
    db.insertError = 'duplicate key value violates unique constraint "restaurant_purchases_one_document"';
    await pickFiles();
    fireEvent.click(screen.getByRole("button", { name: /Save 1 document/ }));
    await screen.findByText(/Imported 0 documents\. 1 were already saved\./);
  });

  it("skips an invoice that is already in the list", async () => {
    db.purchases = [
      { id: "x", purchase_date: "2026-09-01", vendor: "US Foods", amount: 624.6, invoice_path: null, notes: null, created_at: "", kind: "invoice", document_number: "1092941" },
    ];
    render(<RestaurantPurchasesPage />);
    await screen.findByText("September 2026");
    const input = screen.getByLabelText("US Foods invoice files") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    await screen.findByText("Nothing new to import");
    expect(screen.getByText(/Skipping .*Invoice 1092941/)).toBeInTheDocument();
  });
});

describe("Food Cost page", () => {
  it("shows the month's food cost against sales", async () => {
    db.purchases = [{ purchase_date: "2026-09-01", amount: 624.6, food_amount: 574.49, alcohol_amount: 0, supplies_amount: 50.11 }];
    db.sales = [{ entry_date: "2026-09-15", amount: 1000, category: "food_beverage" }];
    render(<FoodCostPage />);
    expect(await screen.findAllByText("57.4%")).not.toHaveLength(0);
    expect(screen.getByText(/Above target/)).toBeInTheDocument();
    expect(screen.getByText(/Bought \$574\.49 · Sold \$1,000\.00 · Supplies \$50\.11/)).toBeInTheDocument();
  });

  it("explains what is missing with no sales", async () => {
    db.purchases = [{ purchase_date: "2026-09-01", amount: 100 }];
    render(<FoodCostPage />);
    expect(await screen.findByText(/No restaurant sales entered yet/)).toBeInTheDocument();
  });

  it("keeps the bar apart, with its own sales and 25% target", async () => {
    db.purchases = [
      // $200 food and $100 alcohol on one invoice, $40 of the food marked bar.
      { purchase_date: "2026-09-01", amount: 300, food_amount: 200, alcohol_amount: 100, supplies_amount: 0, bar_cogs_amount: 140 },
    ];
    db.sales = [
      { entry_date: "2026-09-15", amount: 1000, category: "food_beverage" },
      { entry_date: "2026-09-15", amount: 400, category: "bar" },
    ];
    render(<FoodCostPage />);
    // Restaurant: 160 / 1000 = 16%. Bar: 140 / 400 = 35%, over its 25% target.
    const restaurantCard = await screen.findByRole("button", { name: /^Restaurant/ });
    const barCard = screen.getByRole("button", { name: /^Bar/ });
    expect(within(restaurantCard).getByText("16%")).toBeInTheDocument();
    expect(within(barCard).getByText("35%")).toBeInTheDocument();
    expect(within(barCard).getByText("Above target")).toBeInTheDocument();
    expect(screen.getByText(/target 25% or less/)).toBeInTheDocument();
    expect(screen.getByText(/target 35% or less/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Bar/ }));
    expect(screen.getByText(/Bought \$140\.00 · Sold \$400\.00/)).toBeInTheDocument();
  });
});

describe("Order Guide page", () => {
  it("fills the usual amounts and starts a PR with them", async () => {
    const line = (purchase_id: string, purchase_date: string) => ({
      purchase_id,
      product_number: "9015421",
      description: "CUCUMBER, FRESH REF",
      brand: "PACKER",
      pack_size: "6 EA",
      qty: 2,
      unit: "CS",
      unit_price: 11.3,
      category: "food",
      restaurant_purchases: { purchase_date, kind: "invoice" },
    });
    db.lines = [line("a", "2026-09-01"), line("b", "2026-09-10")];
    render(<OrderGuidePage />);
    await screen.findByText("CUCUMBER, FRESH REF");
    fireEvent.click(screen.getByRole("button", { name: "Fill usual amounts" }));
    expect((screen.getByLabelText("How many CUCUMBER, FRESH REF") as HTMLInputElement).value).toBe("2");
    expect(screen.getByText(/about \$22\.60/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start a PR/ }));
    expect(push).toHaveBeenCalledWith("/purchase-requests/new/?prefill=1");
    const prefill = JSON.parse(sessionStorage.getItem("gk.prPrefill")!);
    expect(prefill.vendorName).toBe("US Foods");
    expect(prefill.items[0]).toMatchObject({ site: "7011", cost_ctr: "20091", gl_acct: "151110", qty: 2, part_number: "9015421" });
  });
});
