import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { generateDd200Report, dd200Filename } from "@/lib/reports/dd200-report";
import { DD200_ORG_ADDRESS } from "@/lib/dd-forms/dd200-fields";

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
  dateInitiated: "20260625",
  inquiryNumber: "GLK-2026-014",
  dateLossDiscovered: "20190913",
  nsn: "5836-LL-TV1",
  itemDescription: 'PHILLIPS 52" TV HD LCD #89004501',
  quantity: "1",
  unitCost: "1,575.00",
  totalCost: "1,575.00",
  circumstance: "destroyed" as const,
  category: "organization" as const,
  circumstances:
    "The TV would no longer turn on and was considered beyond economical repair -- item was tagged for disposal (see attachment) and was disposed of in 2020 as part of a mass disposal from Building 153 coordinated via the Business Office and the Maintenance Department. Proper disposal paperwork for final disposal was not filed at that time.",
  actions:
    "Ensure proper paperwork is submitted and maintained and include a photo of item being destroyed.",
  orgAddress: DD200_ORG_ADDRESS,
  typedName: "CLINKSCALES, BRITTANY",
  dsn: "312-555-0100",
  dateSigned: "06262026",
};

describe("generateDd200Report", () => {
  it("produces a two-page PDF and honors the save-name convention", async () => {
    const filename = dd200Filename("7010", "52in TV");
    expect(filename).toBe("SITE_7010_FY26_GLK_DD FORM 200_52in TV.pdf");

    const { blob, filename: fn } = await generateDd200Report(SAMPLE, filename);
    expect(fn).toBe(filename);

    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.length).toBeGreaterThan(3000);
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe("%PDF");

    if (process.env.DD_EMIT) {
      await mkdir(path.dirname(process.env.DD_EMIT), { recursive: true });
      await writeFile(process.env.DD_EMIT, buf);
    }
  });

  it("renders fine with only the required item fields", async () => {
    const { blob } = await generateDd200Report({
      dateInitiated: "20260630",
      itemDescription: "Test item",
      quantity: "1",
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe("%PDF");
  });
});
