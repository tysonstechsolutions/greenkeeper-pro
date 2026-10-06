import { describe, expect, it } from "vitest";
import { descriptionWords, learnedLineCodes, type PastLine } from "@/lib/accounting/learned";

const past = (o: Partial<PastLine>): PastLine => ({
  description: "",
  part_number: "",
  vendor: null,
  last_used: "2026-09-01",
  site: "",
  cost_ctr: "",
  gl_acct: "",
  ...o,
});

const HISTORY: PastLine[] = [
  past({ description: "Toro reel bedknife", part_number: "110-4074", vendor: "Reinders", site: "7010", cost_ctr: "25581", gl_acct: "683000", last_used: "2026-08-01" }),
  past({ description: "Range balls yellow 2-piece", vendor: "Range Servant", site: "7009", cost_ctr: "25224", gl_acct: "701000", last_used: "2026-07-15" }),
  past({ description: "Range balls yellow", vendor: "Range Servant", site: "7009", cost_ctr: "25224", gl_acct: "701010", last_used: "2026-09-10" }),
  past({ description: "Hand soap refills", site: "", cost_ctr: "", gl_acct: "" }),
  past({ description: "Mystery widget", site: "9999", cost_ctr: "00000", gl_acct: "123" }),
];

describe("learnedLineCodes", () => {
  it("drops units, numbers, and plurals from the words", () => {
    expect([...descriptionWords("Range Balls, 24 per case (yellow)")]).toEqual(["range", "ball", "yellow"]);
  });

  it("reuses the codes of the same part number", () => {
    const got = learnedLineCodes("bedknife for greens mower", "110-4074", "", HISTORY)!;
    expect(got.costCenter?.code).toBe("25581");
    expect(got.site?.code).toBe("7010");
    expect(got.glAccount?.code).toBe("683000");
    expect(got.costCenter?.reason).toBe('Used before for "Toro reel bedknife" (2026-08-01)');
  });

  it("matches a similar description, newest line winning a tie", () => {
    const got = learnedLineCodes("Yellow range balls", "", "", HISTORY)!;
    expect(got.from.last_used).toBe("2026-09-10");
    expect(got.costCenter?.code).toBe("25224");
  });

  it("returns nothing for an unrelated line, a line with no codes, or unofficial codes", () => {
    expect(learnedLineCodes("Office printer paper", "", "", HISTORY)).toBeNull();
    expect(learnedLineCodes("Hand soap refills", "", "", HISTORY)).toBeNull();
    expect(learnedLineCodes("Mystery widget", "", "", HISTORY)).toBeNull();
    expect(learnedLineCodes("", "", "", HISTORY)).toBeNull();
  });
});
