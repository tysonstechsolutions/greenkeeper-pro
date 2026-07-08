/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  isSpreadsheetFile,
  spreadsheetToText,
  truncateToBudget,
  MAX_SPREADSHEET_BYTES,
  SPREADSHEET_TEXT_BUDGET,
} from "@/lib/ai/spreadsheet-attachment";

/** Build an in-memory .xlsx File from arrays-of-arrays, one entry per sheet. */
function mkXlsxFile(
  sheets: Record<string, unknown[][]>,
  name = "test.xlsx",
): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows, { cellDates: true }),
      sheetName,
    );
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
  return new File([buf], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("isSpreadsheetFile", () => {
  it("accepts xlsx, xls, csv, and tsv extensions case-insensitively", () => {
    expect(isSpreadsheetFile({ name: "order.xlsx" })).toBe(true);
    expect(isSpreadsheetFile({ name: "OLD-REPORT.XLS" })).toBe(true);
    expect(isSpreadsheetFile({ name: "export.csv" })).toBe(true);
    expect(isSpreadsheetFile({ name: "data.TSV" })).toBe(true);
  });

  it("rejects other file types", () => {
    expect(isSpreadsheetFile({ name: "photo.png" })).toBe(false);
    expect(isSpreadsheetFile({ name: "invoice.pdf" })).toBe(false);
    expect(isSpreadsheetFile({ name: "notes.xlsx.txt" })).toBe(false);
    expect(isSpreadsheetFile({ name: "no-extension" })).toBe(false);
  });
});

describe("spreadsheetToText — xlsx", () => {
  it("converts a single-sheet workbook to CSV text without sheet labels", async () => {
    const file = mkXlsxFile({
      Order: [
        ["Product #", "Brand", "Pack Size", "Price"],
        ["8842291", "Monarch", "6/10 LB", 42.15],
        ["1104412", "Glenview Farms", "4/5 LB", 18.99],
      ],
    });
    const result = await spreadsheetToText(file);
    expect(result.name).toBe("test.xlsx");
    expect(result.sheetCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("Product #,Brand,Pack Size,Price");
    expect(result.text).toContain("8842291,Monarch,6/10 LB,42.15");
    expect(result.text).not.toContain("=== Sheet:");
    expect(result.rowCount).toBe(3);
  });

  it("labels each sheet when the workbook has several", async () => {
    const file = mkXlsxFile({
      "July Order": [["A"], ["1"]],
      Credits: [["B"], ["2"]],
    });
    const result = await spreadsheetToText(file);
    expect(result.sheetCount).toBe(2);
    expect(result.text).toContain("=== Sheet: July Order ===");
    expect(result.text).toContain("=== Sheet: Credits ===");
  });

  it("renders date cells as readable dates, not Excel serial numbers", async () => {
    const file = mkXlsxFile({
      // Local-time date — SheetJS round-trips dates in local time.
      Order: [["Delivery Date"], [new Date(2026, 6, 8)]],
    });
    const result = await spreadsheetToText(file);
    // SheetJS default date format is m/d/yy — a readable date beats a serial.
    expect(result.text).toMatch(/7\/8\/26|7\/8\/2026|2026-07-08/);
    expect(result.text).not.toMatch(/\b46\d{3}(\.\d+)?\b/);
  });

  it("skips fully empty sheets and throws when nothing is readable", async () => {
    const file = mkXlsxFile({ Empty: [] });
    await expect(spreadsheetToText(file)).rejects.toThrow(/no readable rows/i);
  });

  it("truncates a huge sheet to the text budget with an explanatory note", async () => {
    const rows: unknown[][] = [["Product #", "Description", "Price"]];
    for (let i = 0; i < 2000; i++) {
      rows.push([`88${i}`, `Item number ${i} with a fairly long description`, i * 1.5]);
    }
    const result = await spreadsheetToText(mkXlsxFile({ Big: rows }));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(SPREADSHEET_TEXT_BUDGET);
    expect(result.text).toMatch(/truncated/i);
    expect(result.rowCount).toBe(2001);
  });

  it("rejects files over the size cap without reading them", async () => {
    const big = new File([new Uint8Array(1024)], "big.xlsx");
    Object.defineProperty(big, "size", { value: MAX_SPREADSHEET_BYTES + 1 });
    await expect(spreadsheetToText(big)).rejects.toThrow(/too large/i);
  });

  it("throws a friendly error for a corrupt xlsx", async () => {
    // SheetJS falls back to CSV-parsing unknown bytes instead of throwing,
    // yielding control-char garbage — the sanitizer must catch that too.
    const junk = new File([new Uint8Array([1, 2, 3, 4])], "broken.xlsx");
    await expect(spreadsheetToText(junk)).rejects.toThrow(/no readable rows/i);
  });
});

describe("spreadsheetToText — csv/tsv passthrough", () => {
  it("reads a CSV file as-is", async () => {
    const csv = "Order #,Date,Total\n55512,2026-07-01,412.86\n";
    const file = new File([csv], "usf-order.csv", { type: "text/csv" });
    const result = await spreadsheetToText(file);
    expect(result.text).toContain("55512,2026-07-01,412.86");
    expect(result.sheetCount).toBe(1);
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("throws on an empty CSV", async () => {
    const file = new File(["   \n  "], "empty.csv", { type: "text/csv" });
    await expect(spreadsheetToText(file)).rejects.toThrow(/no readable rows/i);
  });
});

describe("truncateToBudget", () => {
  it("returns short text unchanged", () => {
    const r = truncateToBudget("a,b\n1,2", 1000);
    expect(r.text).toBe("a,b\n1,2");
    expect(r.truncated).toBe(false);
  });

  it("cuts on line boundaries and notes how many rows were dropped", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `row ${i},value ${i}`);
    const r = truncateToBudget(lines.join("\n"), 300);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(300);
    // Never cuts mid-line: every kept line is intact.
    const kept = r.text.split("\n");
    const note = kept[kept.length - 1];
    expect(note).toMatch(/truncated/i);
    for (const line of kept.slice(0, -1)) {
      expect(lines).toContain(line);
    }
  });
});
