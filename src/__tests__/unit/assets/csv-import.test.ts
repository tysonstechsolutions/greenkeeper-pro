import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  guessMapping,
  parseCsv,
} from "@/lib/assets/csv-import";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    const out = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(out.headers).toEqual(["a", "b", "c"]);
    expect(out.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted commas, doubled quotes, and CRLF", () => {
    const out = parseCsv('Asset Id,Description\r\n"17307537","MOWER, 72"" DECK"\r\n');
    expect(out.headers).toEqual(["Asset Id", "Description"]);
    expect(out.rows[0]).toEqual(["17307537", 'MOWER, 72" DECK']);
  });

  it("skips blank lines and handles a missing trailing newline", () => {
    const out = parseCsv("h1,h2\n\nx,y");
    expect(out.rows).toEqual([["x", "y"]]);
  });

  it("empty input → empty result", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("guessMapping", () => {
  it("maps DPAS inquiry headers", () => {
    const m = guessMapping([
      "Asset Id",
      "Serial Nbr",
      "Item Desc",
      "Custodian",
      "Acq Cost",
      "Qty",
    ]);
    expect(m.asset_number).toBe(0);
    expect(m.serial_number).toBe(1);
    expect(m.description).toBe(2);
    expect(m.cost_center).toBe(3);
    expect(m.original_value).toBe(4);
    expect(m.qty).toBe(5);
  });

  it("maps legacy Flexible-Asset-Listing style headers", () => {
    const m = guessMapping([
      "Asset Number",
      "Sub Number",
      "Description",
      "Model No",
      "Serial Number",
      "Manufacturer",
      "Original Value",
    ]);
    expect(m.asset_number).toBe(0);
    expect(m.sub_number).toBe(1);
    expect(m.description).toBe(2);
    expect(m.model_text).toBe(3);
    expect(m.serial_number).toBe(4);
    expect(m.manufacturer).toBe(5);
    expect(m.original_value).toBe(6);
  });

  it("never assigns one column to two fields", () => {
    const m = guessMapping(["Cost", "Cost Center"]);
    // "Cost" wins original_value; cost_center must take the OTHER column.
    expect(m.original_value).not.toBe(m.cost_center);
  });
});

describe("buildCandidates", () => {
  const parsed = {
    headers: ["Asset Id", "Item Desc", "Serial Nbr", "Acq Cost"],
    rows: [
      ["17307537", "GREENS MOWER", "SN-100", "$12,500.00"],
      ["17307538", "UTILITY CART", "SN-200", "8000"],
      ["", "NO NUMBER", "SN-300", "1"],
      ["17307539", "", "SN-400", "2"],
    ],
  };
  const mapping = guessMapping(parsed.headers);

  it("builds rows, cleans money, flags problems", () => {
    const out = buildCandidates(parsed, mapping, []);
    expect(out[0].original_value).toBe(12500);
    expect(out[0].problem).toBeNull();
    expect(out[1].original_value).toBe(8000);
    expect(out[2].problem).toBe("missing asset number");
    expect(out[3].problem).toBe("missing description");
  });

  it("marks duplicates by asset number OR serial (case-insensitive)", () => {
    const out = buildCandidates(parsed, mapping, [
      { asset_number: "17307537", serial_number: null },
      { asset_number: "99999999", serial_number: "sn-200" },
    ]);
    expect(out[0].duplicate).toBe(true); // by number
    expect(out[1].duplicate).toBe(true); // by serial, case-insensitive
  });

  it("defaults qty to 1 when unmapped or invalid", () => {
    const out = buildCandidates(parsed, mapping, []);
    expect(out[0].qty).toBe(1);
  });
});
