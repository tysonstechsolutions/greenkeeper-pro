import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { parseUsFoodsDocument } from "@/lib/restaurant/usfoods";
import { expandFiles, planUsFoodsImport, readUsFoodsFiles, type ReadDocument } from "@/lib/restaurant/import";
import { costByPeriod, markVendorGaps, priceChanges, purchaseSplit, topItems, weekStart, type CostLine } from "@/lib/restaurant/food-cost";
import {
  PR_PREFILL_KEY,
  buildOrderGuide,
  guideGlAccount,
  orderText,
  orderToPrItems,
  orderTotal,
  savePrPrefill,
  takePrPrefill,
  type GuideSourceLine,
} from "@/lib/restaurant/order-guide";

const FIXTURES = join(__dirname, "..", "fixtures", "usfoods");
const doc = (name: string, fileName = name): ReadDocument => ({
  ...parseUsFoodsDocument(readFileSync(join(FIXTURES, name), "utf8").split("\n"))!,
  fileName,
  data: new Uint8Array(),
});

describe("planUsFoodsImport", () => {
  const invoice = doc("invoice-1092941.txt", "InvoiceDetails2.pdf");
  const credit = doc("credit-2980165.txt", "InvoiceDetails.pdf");

  it("plans one purchase per document, with its split, cover sheet, and items", () => {
    const plan = planUsFoodsImport(
      {
        documents: [credit, invoice],
        coverSheets: [
          { invoiceNumber: "1092941", deliveryOrder: "N61463-26-F-0011", site: "7011", date: "2026-09-01", fileName: "cover.pdf" },
        ],
      },
      [],
    );
    expect(plan.duplicates).toEqual([]);
    // Oldest first.
    expect(plan.toSave.map((p) => p.row.document_number)).toEqual(["1092941", "2980165"]);
    const inv = plan.toSave[0];
    expect(inv.row).toMatchObject({
      kind: "invoice",
      amount: 624.6,
      purchase_date: "2026-09-01",
      delivery_order: "N61463-26-F-0011",
      site: "7011",
      food_amount: 574.49,
      supplies_amount: 50.11,
      against_invoice: null,
    });
    expect(inv.lines).toHaveLength(11);
    expect(inv.lines[0]).toMatchObject({ line_no: 1, product_number: "2912038", category: "supplies" });
    const cr = plan.toSave[1];
    expect(cr.row).toMatchObject({ kind: "credit", amount: -664.59, against_invoice: "2160562", delivery_order: null });
  });

  it("skips what is already saved and repeats inside the batch", () => {
    const plan = planUsFoodsImport(
      { documents: [invoice, { ...invoice, fileName: "InvoiceDetails (1).pdf" }, credit], coverSheets: [] },
      [{ vendor: "us foods", kind: "credit", document_number: "2980165" }],
    );
    expect(plan.toSave.map((p) => p.row.document_number)).toEqual(["1092941"]);
    expect(plan.duplicates).toEqual([
      "Invoice 1092941 (InvoiceDetails (1).pdf)",
      "Credit memo 2980165 (on invoice 2160562) (InvoiceDetails.pdf)",
    ]);
  });

  it("does not treat another vendor's invoice number as a repeat", () => {
    const plan = planUsFoodsImport({ documents: [invoice], coverSheets: [] }, [
      { vendor: "Sysco", kind: "invoice", document_number: "1092941" },
    ]);
    expect(plan.toSave).toHaveLength(1);
  });
});

describe("reading files", () => {
  it("opens a zip, keeps PDFs, and drops macOS extras", async () => {
    const zip = new JSZip();
    zip.file("sept/InvoiceDetails4.pdf", readFileSync(join(FIXTURES, "vendor-ship-1530079.pdf")));
    zip.file("__MACOSX/sept/._InvoiceDetails4.pdf", "junk");
    zip.file("notes.txt", "hello");
    const data = await zip.generateAsync({ type: "uint8array" });
    const { pdfs, other } = await expandFiles([{ name: "usfoods.zip", data }]);
    expect(pdfs.map((p) => p.name)).toEqual(["InvoiceDetails4.pdf"]);
    expect(other).toEqual(["notes.txt"]);
  });

  it("reads a real invoice PDF and reports what it can't read", async () => {
    const pdf = new Uint8Array(readFileSync(join(FIXTURES, "vendor-ship-1530079.pdf")));
    const read = await readUsFoodsFiles([
      { name: "InvoiceDetails4.pdf", data: pdf },
      { name: "broken.pdf", data: new Uint8Array([1, 2, 3]) },
      { name: "photo.jpg", data: new Uint8Array([1]) },
    ]);
    expect(read.documents.map((d) => d.documentNumber)).toEqual(["1530079"]);
    expect(read.documents[0].data.length).toBe(pdf.length);
    expect(read.unreadable.sort()).toEqual(["broken.pdf", "photo.jpg"]);
  });
});

describe("food cost", () => {
  it("counts food and alcohol, not supplies; hand-typed rows count as restaurant food", () => {
    expect(purchaseSplit({ purchase_date: "2026-09-01", amount: 624.6, food_amount: 574.49, alcohol_amount: 0, supplies_amount: 50.11 })).toEqual({
      cogs: 574.49,
      restaurant: 574.49,
      bar: 0,
      supplies: 50.11,
    });
    expect(purchaseSplit({ purchase_date: "2026-09-01", amount: 100 })).toEqual({ cogs: 100, restaurant: 100, bar: 0, supplies: 0 });
  });

  it("splits restaurant and bar: alcohol plus items marked bar", () => {
    const p = { purchase_date: "2026-09-01", amount: 300, food_amount: 200, alcohol_amount: 100, supplies_amount: 0 };
    // Before bar marking existed, alcohol alone is the bar.
    expect(purchaseSplit(p)).toMatchObject({ restaurant: 200, bar: 100 });
    expect(purchaseSplit({ ...p, bar_cogs_amount: 140 })).toMatchObject({ restaurant: 160, bar: 140 });
    const sales = [
      { entry_date: "2026-09-10", amount: 1000, category: "food_beverage" },
      { entry_date: "2026-09-10", amount: 400, category: "bar" },
    ];
    const bar = costByPeriod([{ ...p, bar_cogs_amount: 140 }], sales, "month", "bar")[0];
    expect(bar).toMatchObject({ cogs: 140, sales: 400, pct: 35, status: "high" });
    const rest = costByPeriod([{ ...p, bar_cogs_amount: 140 }], sales, "month", "restaurant")[0];
    expect(rest).toMatchObject({ cogs: 160, sales: 1000, pct: 16, status: "good" });
  });

  it("weeks start on Monday", () => {
    expect(weekStart("2026-09-29")).toBe("2026-09-28"); // Tuesday
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday
  });

  it("works out food cost % by month, credits taken off, and flags high months", () => {
    const purchases = [
      { purchase_date: "2026-09-01", amount: 624.6, food_amount: 574.49, alcohol_amount: 0, supplies_amount: 50.11 },
      { purchase_date: "2026-09-29", amount: 664.59, food_amount: 607.23, alcohol_amount: 0, supplies_amount: 57.36 },
      { purchase_date: "2026-09-30", amount: -664.59, food_amount: -607.23, alcohol_amount: 0, supplies_amount: -57.36 },
      { purchase_date: "2026-08-10", amount: 500 },
    ];
    const sales = [
      { entry_date: "2026-09-15", amount: 2000 },
      { entry_date: "2026-08-15", amount: 1000 },
    ];
    const months = costByPeriod(purchases, sales, "month");
    expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-08"]);
    expect(months[0]).toMatchObject({ cogs: 574.49, supplies: 50.11, sales: 2000, pct: 28.7, status: "good" });
    expect(months[1]).toMatchObject({ cogs: 500, sales: 1000, pct: 50, status: "high" });
    expect(costByPeriod(purchases.slice(0, 1), [], "month")[0]).toMatchObject({ pct: null, status: "no_sales" });
  });

  const line = (o: Partial<CostLine>): CostLine => ({
    purchase_date: "2026-09-01",
    kind: "invoice",
    product_number: "1",
    description: "BEEF",
    pack_size: "4/5 LB",
    qty: 1,
    unit_price: 100,
    extended: 100,
    category: "food",
    ...o,
  });

  it("lists top items net of credits, using the invoice wording", () => {
    const top = topItems([
      line({ product_number: "8529315", description: "BEEF, GRND", unit_price: 141.34, extended: 141.34 }),
      line({ product_number: "8529315", description: "BEEF, GRND", unit_price: 139.74, extended: 139.74, purchase_date: "2026-09-22" }),
      line({ product_number: "1054717", description: "SAUCE, PASTA", extended: 45.83 }),
      line({ product_number: "1054717", kind: "credit", description: "SAUCE, PASTA AL DENTE", qty: -1, extended: -45.83 }),
    ]);
    expect(top).toEqual([
      { product_number: "8529315", description: "BEEF, GRND", pack_size: "4/5 LB", qty: 2, spend: 281.08, category: "food" },
    ]);
  });

  it("flags price moves between the last two orders", () => {
    const changes = priceChanges([
      line({ product_number: "4731808", description: "TOMATO, CHRY", unit_price: 19.76, purchase_date: "2026-09-01" }),
      line({ product_number: "4731808", description: "TOMATO, CHRY", unit_price: 19.76, purchase_date: "2026-09-10" }),
      line({ product_number: "4731808", description: "TOMATO, CHRY", unit_price: 20.62, purchase_date: "2026-09-22" }),
      line({ product_number: "8529315", description: "BEEF", unit_price: 141.34, purchase_date: "2026-09-01" }),
      line({ product_number: "8529315", description: "BEEF", unit_price: 139.74, purchase_date: "2026-09-22" }),
      line({ product_number: "1", kind: "credit", unit_price: 1, purchase_date: "2026-09-30" }),
    ]);
    expect(changes).toEqual([
      {
        product_number: "4731808",
        description: "TOMATO, CHRY",
        pack_size: "4/5 LB",
        before: 19.76,
        beforeDate: "2026-09-10",
        now: 20.62,
        nowDate: "2026-09-22",
        changePct: 4.4,
      },
    ]);
  });
});

describe("order guide", () => {
  const src = (o: Partial<GuideSourceLine>): GuideSourceLine => ({
    purchase_id: "a",
    purchase_date: "2026-09-01",
    kind: "invoice",
    product_number: "9015421",
    description: "CUCUMBER, FRESH REF",
    brand: "PACKER",
    pack_size: "6 EA",
    qty: 1,
    unit: "CS",
    unit_price: 11.3,
    category: "food",
    ...o,
  });

  const guide = buildOrderGuide([
    src({ purchase_id: "a" }),
    src({ purchase_id: "b", purchase_date: "2026-09-10" }),
    src({ purchase_id: "c", purchase_date: "2026-09-24", qty: 2 }),
    src({ purchase_id: "c", purchase_date: "2026-09-24", product_number: "1782481", description: "PLATE, PLYST 9\"", brand: "MONOGRAM", pack_size: "144 EA", qty: 3, unit_price: 51.44, category: "supplies" }),
    src({ purchase_id: "d", purchase_date: "2026-09-30", kind: "credit", product_number: "1782481", qty: -3 }),
  ]);

  it("ranks items by how often they're ordered, with the usual amount and last price", () => {
    expect(guide.map((g) => g.product_number)).toEqual(["9015421", "1782481"]);
    expect(guide[0]).toMatchObject({ timesOrdered: 3, usualQty: 1, lastPrice: 11.3, lastOrdered: "2026-09-24" });
    expect(guide[1]).toMatchObject({ timesOrdered: 1, usualQty: 3, category: "supplies" });
  });

  it("codes PR lines for Buckley's: food and alcohol resale, supplies by type", () => {
    expect(guideGlAccount({ category: "food", description: "BEEF" })).toBe("151110");
    expect(guideGlAccount({ category: "alcohol", description: "BEER" })).toBe("151120");
    expect(guideGlAccount({ category: "supplies", description: "BAG, FOOD STRG 10X14" })).not.toMatch(/^1511/);
    const items = orderToPrItems([
      { item: guide[0], qty: 2 },
      { item: guide[1], qty: 0 },
    ]);
    expect(items).toEqual([
      {
        item: 1,
        site: "7011",
        cost_ctr: "20091",
        gl_acct: "151110",
        description: "CUCUMBER, FRESH REF · PACKER · 6 EA",
        part_number: "9015421",
        qty: 2,
        unit: "Case",
        unit_price: 11.3,
      },
    ]);
    expect(orderTotal([{ item: guide[0], qty: 2 }, { item: guide[1], qty: 1 }])).toBe(74.04);
    expect(orderText([{ item: guide[0], qty: 2 }])).toContain("2 CS  #9015421  CUCUMBER, FRESH REF (6 EA)");
  });

  describe("PR hand-off", () => {
    afterEach(() => sessionStorage.clear());

    it("passes the order to the PR form once", () => {
      savePrPrefill({ vendorName: "US Foods", items: orderToPrItems([{ item: guide[0], qty: 1 }]) });
      const got = takePrPrefill();
      expect(got?.vendorName).toBe("US Foods");
      expect(got?.items).toHaveLength(1);
      expect(takePrPrefill()).toBeNull();
    });

    it("ignores a malformed hand-off", () => {
      sessionStorage.setItem(PR_PREFILL_KEY, "{not json");
      expect(takePrPrefill()).toBeNull();
      sessionStorage.setItem(PR_PREFILL_KEY, JSON.stringify({ items: "nope" }));
      expect(takePrPrefill()).toBeNull();
    });
  });
});

describe("markVendorGaps", () => {
  it("flags bar months with only US Foods mixers", () => {
    const purchases = [
      { purchase_date: "2026-02-04", amount: 123.28, alcohol_amount: 123.28, food_amount: 0, supplies_amount: 0, bar_cogs_amount: 123.28, vendor: "Lakeshore Beverage" },
      { purchase_date: "2026-03-02", amount: 50, food_amount: 50, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 12, vendor: "US Foods" },
      { purchase_date: "2026-04-14", amount: 30, food_amount: 30, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0, vendor: "MWR Central Warehouse" },
    ];
    const periods = costByPeriod(purchases, [], "month", "bar");
    const marked = markVendorGaps([...periods, { key: "2026-04", cogs: 0, supplies: 0, sales: 0, pct: null, status: "no_sales" }], purchases);
    expect(marked.map((p) => [p.key, !!p.vendorGap])).toEqual([
      ["2026-03", true],
      ["2026-02", false],
      ["2026-04", true],
    ]);
  });
});
