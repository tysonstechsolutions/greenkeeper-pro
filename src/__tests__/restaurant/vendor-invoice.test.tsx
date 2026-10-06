// Delivery invoices from vendors other than US Foods: how lines are sorted
// and coded, and the form that reads a receipt photo and saves it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "../utils/test-utils";
import {
  classifyVendorLine,
  linesFromReceipt,
  planVendorInvoice,
  vendorProductNumber,
  vendorProfile,
} from "@/lib/restaurant/vendor-invoice";
import { vendorInvoiceSql } from "@/lib/restaurant/vendor-invoice-sql";
import { glFor } from "@/lib/restaurant/coding";

const db = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertedLines: [] as Record<string, unknown>[],
  deleted: [] as string[],
  upserts: [] as Record<string, unknown>[],
  lineError: null as string | null,
}));

vi.mock("@/lib/supabase/rest", () => ({
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    db.inserted.push(row);
    return { id: "p1" };
  },
  directInsertRows: async (_t: string, rows: Record<string, unknown>[]) => {
    if (db.lineError) throw new Error(db.lineError);
    db.insertedLines.push(...rows);
    return rows;
  },
  directDeleteRow: async (_t: string, _c: string, id: string) => {
    db.deleted.push(id);
  },
  directUpsertRows: async (_t: string, rows: Record<string, unknown>[]) => {
    db.upserts.push(...rows);
  },
}));
vi.mock("@/lib/supabase/storage", () => ({ uploadPhoto: async () => ({ storagePath: "u1/receipt.jpg" }) }));

const extract = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/pr/receipt-extract", () => ({ extractReceipt: async () => extract.result }));

import { VendorInvoiceForm } from "@/components/restaurant/vendor-invoice-form";

describe("vendor invoice lines", () => {
  it("sorts beer, sodas, and supplies", () => {
    const lakeshore = vendorProfile("Lakeshore Beverage");
    const warehouse = vendorProfile("MWR Central Warehouse");
    expect(classifyVendorLine("CUT LEMON DROP", lakeshore)).toBe("alcohol");
    expect(classifyVendorLine("RED BULL 24/12OZ", lakeshore)).toBe("food");
    expect(classifyVendorLine("HEINEKEN 0.0", lakeshore)).toBe("food");
    expect(classifyVendorLine("SERVICE CHARGE", lakeshore)).toBe("alcohol");
    expect(classifyVendorLine("SODA: PEPSI 20 OZ", warehouse)).toBe("food");
    expect(classifyVendorLine("NAPKIN: BEVERAGE", warehouse)).toBe("supplies");
    expect(classifyVendorLine("BLEACH: GERM: CS/6", warehouse)).toBe("supplies");
    expect(classifyVendorLine("JACK DANIELS WHISKEY 1L", warehouse)).toBe("alcohol");
    expect(classifyVendorLine("MAYO LITE", warehouse)).toBe("food");
    expect(classifyVendorLine("COORS LIGHT 18PK", vendorProfile("Mess requisition"))).toBe("alcohol");
    // Supplies named anywhere in the line, not just first.
    expect(classifyVendorLine('Enmotion 10" Paper Towel', warehouse)).toBe("supplies");
    expect(classifyVendorLine("No Rinse Alkaline Floor Cleaner", warehouse)).toBe("supplies");
    expect(classifyVendorLine("ECOLAB: APEX RINSE", warehouse)).toBe("supplies");
    expect(classifyVendorLine("UTENSILS: KIT: K/F/S/N/S&P", warehouse)).toBe("supplies");
    expect(classifyVendorLine("PEANUT BUTTER CUPS", warehouse)).toBe("food");
    expect(classifyVendorLine("CHICKEN WRAP", warehouse)).toBe("food");
    expect(classifyVendorLine("DRINK: LEMONADE: POWDER MIX", warehouse)).toBe("food");
  });

  it("codes supplies 701005 when they're for cleaning, else 701000", () => {
    const gl = (d: string) => glFor({ category: "supplies", description: d });
    expect(gl("No Rinse Alkaline Floor Cleaner")).toBe("701005");
    expect(gl("ECOLAB: DISHMACHINE SANITIZER")).toBe("701005");
    expect(gl("PLATE: PAPER: 9 IN")).toBe("701000");
    expect(gl("PENS: RETRACTABLE: BLACK: FINE")).toBe("701000");
  });

  it("knows the vendors by name and keeps their item numbers apart from US Foods", () => {
    expect(vendorProfile("lakeshore beverage").prefix).toBe("LSB-");
    expect(vendorProfile("Kloss Distributing").category).toBe("alcohol");
    expect(vendorProfile("Some Bakery")).toMatchObject({ key: "other", name: "Some Bakery", prefix: "" });
    expect(vendorProductNumber("LSB-", "581227", "CUT LEMON DROP")).toBe("LSB-581227");
    expect(vendorProductNumber("WH-", null, "Soda: Pepsi 20 oz")).toBe("WH-SODA-PEPSI-20-OZ");
  });

  it("plans an invoice that adds up, coded to the bar", () => {
    const p = planVendorInvoice({
      vendor: "Lakeshore Beverage",
      kind: "invoice",
      document_number: "520501",
      purchase_date: "2026-02-04",
      total: 123.28,
      lines: [
        { item: "80505", description: "BHC BIG JAM", qty: 2, unit_price: 38.48, extended: 76.96, category: "alcohol" },
        { item: "99785", description: "GI BH TROPICAL", qty: 1, unit_price: 36.32, extended: 36.32, category: "alcohol" },
        { description: "SERVICE CHARGE", qty: 1, unit_price: 10, extended: 10, category: "alcohol" },
      ],
    });
    expect(p.difference).toBe(0);
    expect(p.row).toMatchObject({ amount: 123.28, alcohol_amount: 123.28, food_amount: 0, bar_cogs_amount: 123.28, notes: "Invoice 520501 · 3 items" });
    expect(p.lines.map((l) => [l.product_number, l.outlet, l.cost_ctr, l.gl_acct])).toEqual([
      ["LSB-80505", "bar", "20091", "151120"],
      ["LSB-99785", "bar", "20091", "151120"],
      ["LSB-SERVICE-CHARGE", "bar", "20091", "151120"],
    ]);
  });

  it("puts what the lines don't explain on the main cost and says so", () => {
    const p = planVendorInvoice({
      vendor: "Kloss Distributing",
      kind: "invoice",
      document_number: "1",
      purchase_date: "2026-05-05",
      total: 50,
      lines: [{ description: "Modelo Especial 16oz Cn", qty: 1, unit_price: 40, extended: 40, category: "alcohol" }],
    });
    expect(p).toMatchObject({ linesTotal: 40, difference: 10 });
    expect(p.row).toMatchObject({ amount: 50, alcohol_amount: 50, bar_cogs_amount: 50 });
  });

  it("makes a credit negative and keeps sodas marked bar on the bar", () => {
    const p = planVendorInvoice({
      vendor: "MWR Central Warehouse",
      kind: "credit",
      document_number: "SO-1",
      purchase_date: "2026-06-18",
      total: 30,
      lines: [
        { description: "SODA: PEPSI 20 OZ", qty: 1, unit_price: 18.91, extended: 18.91, category: "food", outlet: "bar" },
        { description: "NAPKIN: BEVERAGE", qty: 1, unit_price: 11.09, extended: 11.09, category: "supplies" },
      ],
    });
    expect(p.row).toMatchObject({ kind: "credit", amount: -30, food_amount: -18.91, supplies_amount: -11.09, bar_cogs_amount: -18.91 });
    expect(p.lines[1]).toMatchObject({ category: "supplies", gl_acct: "701000", extended: -11.09 });
  });

  it("turns an AI-read receipt into lines", () => {
    const lines = linesFromReceipt(
      {
        vendor: "LAKESHORE BEVERAGE",
        purchase_date: "2026-02-25",
        subtotal: null,
        tax: null,
        total: 151.5,
        items: [
          { description: "SHINER BOCK 24/16 CAN", qty: 5, unit_price: 28.3, line_total: 141.5 },
          { description: "Service charge", qty: 1, unit_price: 10, line_total: 10 },
        ],
        warnings: [],
      },
      vendorProfile("Lakeshore Beverage"),
    );
    expect(lines).toEqual([
      expect.objectContaining({ description: "SHINER BOCK 24/16 CAN", extended: 141.5, category: "alcohol", outlet: "bar" }),
      expect.objectContaining({ description: "Service charge", extended: 10, category: "alcohol" }),
    ]);
  });

  it("writes SQL that is safe to run twice and refuses text the SQL editor would split", () => {
    const p = planVendorInvoice({
      vendor: "Mess requisition",
      kind: "invoice",
      document_number: "FY26-1344",
      purchase_date: "2026-07-24",
      total: 24.75,
      lines: [{ description: "DRESSING, RANCH", qty: 1, unit_price: 11.9, extended: 11.9, category: "food" }, { description: "LETTUCE, HEAD", qty: 5, unit_price: 2.57, extended: 12.85, category: "food" }],
      notes: "Buckley's order",
    });
    const sql = vendorInvoiceSql(p);
    expect(sql).toContain("ON CONFLICT (lower(vendor), kind, document_number) WHERE document_number IS NOT NULL DO NOTHING");
    expect(sql).toContain("'Invoice FY26-1344 - 2 items - Buckley''s order'");
    expect(sql.trim().endsWith(";")).toBe(true);
    expect(sql.split(";").length).toBe(2);
    expect(() => vendorInvoiceSql({ ...p, row: { ...p.row, notes: "a; b" } })).toThrow(/semicolon/);
    expect(() => vendorInvoiceSql({ ...p, row: { ...p.row, notes: "about $10" } })).toThrow(/dollar sign/);
  });
});

describe("VendorInvoiceForm", () => {
  beforeEach(() => {
    db.inserted = [];
    db.insertedLines = [];
    db.deleted = [];
    db.upserts = [];
    db.lineError = null;
    extract.result = {
      vendor: "LAKESHORE BEVERAGE",
      purchase_date: "2026-02-25",
      subtotal: null,
      tax: null,
      total: 151.5,
      items: [{ description: "SHINER BOCK 24/16 CAN", qty: 5, unit_price: 28.3, line_total: 141.5 }],
      warnings: [],
    };
  });

  const setup = (existing: { vendor: string; kind?: string | null; document_number?: string | null }[] = []) => {
    const onSaved = vi.fn();
    render(<VendorInvoiceForm existing={existing} userId="u1" profileId="p1" onSaved={onSaved} onCancel={() => {}} />);
    return { onSaved };
  };

  const readPhoto = async () => {
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Receipt photo"), { target: { files: [file] } });
    await screen.findByDisplayValue("SHINER BOCK 24/16 CAN");
  };

  it("reads the photo, flags the missing service charge, and saves once it adds up", async () => {
    const { onSaved } = setup();
    await readPhoto();
    fireEvent.change(screen.getByLabelText("Invoice #"), { target: { value: "556086" } });
    expect(screen.getByText(/the invoice says \$151\.50 \(\$10\.00 missing\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add a line/i }));
    fireEvent.change(screen.getByLabelText("Line 2 description"), { target: { value: "SERVICE CHARGE" } });
    fireEvent.change(screen.getByLabelText("Line 2 price"), { target: { value: "10" } });
    expect(screen.getByText(/matches the invoice total/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save invoice" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.inserted[0]).toMatchObject({
      vendor: "Lakeshore Beverage",
      document_number: "556086",
      purchase_date: "2026-02-25",
      amount: 151.5,
      alcohol_amount: 151.5,
      bar_cogs_amount: 151.5,
      invoice_path: "u1/receipt.jpg",
      created_by: "p1",
    });
    expect(db.insertedLines).toHaveLength(2);
    expect(db.insertedLines[0]).toMatchObject({ purchase_id: "p1", category: "alcohol", outlet: "bar", gl_acct: "151120" });
    expect(onSaved.mock.calls[0][0]).toMatch(/Saved Lakeshore Beverage invoice 556086: \$151\.50 \(bar \$151\.50\)\./);
  });

  it("won't save an invoice that's already in", async () => {
    setup([{ vendor: "Lakeshore Beverage", kind: "invoice", document_number: "556086" }]);
    await readPhoto();
    fireEvent.change(screen.getByLabelText("Invoice #"), { target: { value: "556086" } });
    expect(screen.getByText(/already saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save invoice" })).toBeDisabled();
  });

  it("takes the purchase back out if its lines don't save", async () => {
    setup();
    extract.result = { ...(extract.result as object), total: 141.5 };
    await readPhoto();
    fireEvent.change(screen.getByLabelText("Invoice #"), { target: { value: "9" } });
    db.lineError = "boom";
    fireEvent.click(screen.getByRole("button", { name: "Save invoice" }));
    expect(await screen.findByText(/Couldn't save it: boom/)).toBeInTheDocument();
    expect(db.deleted).toEqual(["p1"]);
  });

  it("marks warehouse sodas for the bar and remembers it", async () => {
    const { onSaved } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Vendor" }), { target: { value: "warehouse" } });
    fireEvent.click(screen.getByRole("button", { name: /add a line/i }));
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "SODA: CLUB SODA 10 OZ" } });
    fireEvent.change(screen.getByLabelText("Line 1 quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Line 1 price"), { target: { value: "12.5" } });
    expect(screen.getByLabelText("Line 1 type")).toHaveValue("food");
    fireEvent.change(screen.getByLabelText("Line 1 outlet"), { target: { value: "bar" } });
    fireEvent.change(screen.getByLabelText("Invoice #"), { target: { value: "SO-26-1" } });
    fireEvent.change(screen.getByLabelText("Invoice total"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save invoice" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.inserted[0]).toMatchObject({ vendor: "MWR Central Warehouse", food_amount: 25, bar_cogs_amount: 25 });
    expect(db.upserts).toEqual([{ product_number: "WH-SODA-CLUB-SODA-10-OZ", outlet: "bar" }]);
  });
});
