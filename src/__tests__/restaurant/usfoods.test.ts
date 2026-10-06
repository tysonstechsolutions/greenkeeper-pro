import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pdfTextLines, piecesToLines } from "@/lib/pdf/text-lines";
import {
  categoryTotals,
  classifyUsFoodsLine,
  parseBulkFundingOrder,
  parseUsFoodsDocument,
} from "@/lib/restaurant/usfoods";

const FIXTURES = join(__dirname, "..", "fixtures", "usfoods");
const lines = (name: string) => readFileSync(join(FIXTURES, name), "utf8").split("\n");
const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;

describe("parseUsFoodsDocument", () => {
  it("reads an invoice: header, every line, and a total the lines add up to", () => {
    const doc = parseUsFoodsDocument(lines("invoice-1092941.txt"))!;
    expect(doc).toMatchObject({
      kind: "invoice",
      documentNumber: "1092941",
      invoiceNumber: "1092941",
      date: "2026-09-01",
      orderNumber: "272463",
      total: 624.6,
    });
    expect(doc.lines).toHaveLength(11);
    expect(sum(doc.lines.map((l) => l.extended))).toBe(doc.total);
    expect(doc.lines[0]).toMatchObject({
      productNumber: "2912038",
      brand: "MONOGRAM",
      packSize: "24/1 EA",
      qty: 1,
      unit: "CS",
      unitPrice: 50.11,
      extended: 50.11,
      category: "supplies",
      section: "DRY",
    });
  });

  it("never folds page headers or the invoice summary into the last item", () => {
    const doc = parseUsFoodsDocument(lines("invoice-1092941.txt"))!;
    for (const l of doc.lines) {
      expect(l.description).not.toMatch(/INVOICE|SUMMARY|NET 30|ACCEPTANCE|Page/);
    }
    expect(doc.lines.at(-1)!.description).toBe("BEEF, GRND 100% PURE 80/20 MED");
  });

  it("counts a substitute (*SUB*) line and skips the out-of-stock item it replaced", () => {
    const doc = parseUsFoodsDocument(lines("invoice-1897076.txt"))!;
    expect(doc.total).toBe(1014.09);
    expect(sum(doc.lines.map((l) => l.extended))).toBe(1014.09);
    const meatballs = doc.lines.filter((l) => l.description.startsWith("MEATBALL"));
    expect(meatballs).toHaveLength(1);
    expect(meatballs[0]).toMatchObject({ productNumber: "2110694", qty: 4, extended: 186.64 });
    // Wrapped "READY TO EAT" notices are not part of the description.
    expect(doc.lines.some((l) => /READY TO EAT/.test(l.description))).toBe(false);
  });

  it("reads a credit memo as negative, against its invoice, without the credit type", () => {
    const doc = parseUsFoodsDocument(lines("credit-2980165.txt"))!;
    expect(doc).toMatchObject({
      kind: "credit",
      documentNumber: "2980165",
      invoiceNumber: "2160562",
      orderNumber: "306396",
      date: "2026-09-30",
      total: -664.59,
    });
    expect(doc.lines).toHaveLength(19);
    expect(sum(doc.lines.map((l) => l.extended))).toBe(-664.59);
    expect(doc.lines.every((l) => l.qty < 0 && l.extended < 0)).toBe(true);
    expect(doc.lines.some((l) => /Arrived Late/i.test(`${l.description} ${l.brand}`))).toBe(false);
    const bag = doc.lines.find((l) => l.productNumber === "9513979")!;
    expect(bag).toMatchObject({ brand: "HANDGARDS", packSize: "1000 EA", category: "supplies" });
  });

  it("reads a vendor ship invoice", () => {
    const doc = parseUsFoodsDocument(lines("vendor-ship-1530079.txt"))!;
    expect(doc).toMatchObject({ kind: "invoice", documentNumber: "1530079", date: "2026-09-11", total: 38.72 });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].category).toBe("supplies");
  });

  it("returns null for something that is not a US Foods invoice", () => {
    expect(parseUsFoodsDocument(["PURCHASE REQUEST", "something else"])).toBeNull();
    expect(parseUsFoodsDocument([])).toBeNull();
  });
});

describe("reading the PDF itself", () => {
  it("gets the same document from the real PDF as from the saved text", async () => {
    const data = new Uint8Array(readFileSync(join(FIXTURES, "vendor-ship-1530079.pdf")));
    const doc = parseUsFoodsDocument(await pdfTextLines(data))!;
    expect(doc).toMatchObject({ documentNumber: "1530079", total: 38.72 });
    expect(doc.lines[0].productNumber).toBe("1031498");
  });

  it("keeps table columns apart with wide gaps", () => {
    const out = piecesToLines([
      { str: "1", x: 10, y: 100, width: 5, height: 8 },
      { str: "CS", x: 40, y: 100.5, width: 10, height: 8 },
      { str: "NEXT", x: 10, y: 80, width: 20, height: 8 },
    ]);
    expect(out).toEqual(["1   CS", "NEXT"]);
  });
});

describe("classifyUsFoodsLine", () => {
  it("sorts by the leading noun", () => {
    expect(classifyUsFoodsLine("CUP, PET PLST 9 Z SQT")).toBe("supplies");
    expect(classifyUsFoodsLine("NAPKIN, DNNR WHT 17X17")).toBe("supplies");
    expect(classifyUsFoodsLine("GLOVE, NTRLE MED PF BLU")).toBe("supplies");
    expect(classifyUsFoodsLine("BEEF, GRND 100% PURE")).toBe("food");
    expect(classifyUsFoodsLine("SHORTENING, FRYG CNOLA")).toBe("food");
    expect(classifyUsFoodsLine("BEER, LAGER 12 OZ CAN")).toBe("alcohol");
    expect(classifyUsFoodsLine("ANYTHING", "CHEMICALS")).toBe("supplies");
  });
});

describe("categoryTotals", () => {
  it("splits a document into food, alcohol, and supplies that add to the total", () => {
    const doc = parseUsFoodsDocument(lines("invoice-1092941.txt"))!;
    const t = categoryTotals(doc);
    expect(t).toEqual({ food: 574.49, alcohol: 0, supplies: 50.11 });
    expect(sum([t.food, t.alcohol, t.supplies])).toBe(doc.total);
  });

  it("puts anything the lines miss into food", () => {
    expect(categoryTotals({ total: 100, lines: [] })).toEqual({ food: 100, alcohol: 0, supplies: 0 });
  });
});

describe("parseBulkFundingOrder", () => {
  it("reads the cover sheet form fields", () => {
    expect(
      parseBulkFundingOrder({
        DATE: "9/22/2026",
        "VENDOR NAME": "US FOODS",
        "DELIVERY ORDER": "N61463-26-F-0011",
        "NAVSTA GREAT LAKESSITE NO  NAME": "7011 / BUCKLEYS",
        "NAVSTA GREAT LAKESINVOICE NO": "1897076",
      }),
    ).toEqual({ invoiceNumber: "1897076", deliveryOrder: "N61463-26-F-0011", site: "7011", date: "2026-09-22" });
  });

  it("is null without an invoice number or delivery order", () => {
    expect(parseBulkFundingOrder({ DATE: "9/22/2026" })).toBeNull();
  });
});
