import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { generateDd2212Report, dd2212Filename } from "@/lib/reports/dd2212-report";

// pdf-lib fetches the template PNG by app-relative URL; back it with the file
// on disk so the generator runs unchanged under the test runner.
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.startsWith("/templates/")) {
      const bytes = await readFile(path.resolve(process.cwd(), "public" + url));
      return new Response(new Uint8Array(bytes), { status: 200 });
    }
    return realFetch(input);
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const SAMPLE = {
  activity: "NAVAL STATION GREAT LAKES MWR - GOLF",
  date: "25 JUN 2026",
  sheetNo: "1",
  sheetOf: "1",
  items: [
    { description: "Asset 89004500 - 55in flat-screen TV", units: "1", unitCost: "1575.00", totalValue: "1575.00", reason: "Failed / beyond economical repair" },
    { description: "Commercial push mower", units: "2", unitCost: "420.00", totalValue: "840.00", reason: "Worn out - unserviceable" },
    { description: "Range ball dispenser", units: "1", unitCost: "310.50", totalValue: "310.50", reason: "Obsolete" },
    // 24th row to confirm the last table row lands on the grid, above the totals block.
    ...Array.from({ length: 20 }, () => ({})),
    { description: "Last-row check item", units: "1", unitCost: "9.99", totalValue: "9.99", reason: "Bottom row" },
  ],
};

describe("generateDd2212Report", () => {
  it("produces a valid PDF and honors the save-name convention", async () => {
    const filename = dd2212Filename("7009", "55in TV");
    expect(filename).toBe("SITE_7009_FY26_GLK_FORM 2212_55in TV.pdf");

    const { blob, filename: fn } = await generateDd2212Report(SAMPLE, filename);
    expect(fn).toBe(filename);

    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.length).toBeGreaterThan(2000);
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe("%PDF");

    if (process.env.DD_EMIT) {
      await mkdir(path.dirname(process.env.DD_EMIT), { recursive: true });
      await writeFile(process.env.DD_EMIT, buf);
    }
  });

  it("caps items at the table height", async () => {
    const many = { items: Array.from({ length: 40 }, (_, i) => ({ description: `Item ${i}` })) };
    const { blob } = await generateDd2212Report(many);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe("%PDF");
  });
});
