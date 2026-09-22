/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { otherForDownload, wrapToWidth } from "@/lib/reports/purchase-request-report";
import type { PurchaseRequest } from "@/types/database";

const base = {
  pr_sequence_number: 2,
  pr_fiscal_year: 2027,
  date_prepared: "2026-09-22",
  vendor1_name: "Ace Hardware",
} as PurchaseRequest;

afterEach(() => vi.useRealTimers());

describe("otherForDownload", () => {
  it("re-dates this PR's quote name to the download month (matches the ZIP)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3));
    const pr = { ...base, attached_other: "QUOTE-FY27-GC-0002-AceHardware-Golf Course-September2026 and SOW" };
    expect(otherForDownload(pr)).toBe(
      "QUOTE-FY27-GC-0002-AceHardware-Golf Course-October2026 and SOW",
    );
  });

  it("prints anything else exactly as saved", () => {
    expect(otherForDownload({ ...base, attached_other: "Vendor Quote" })).toBe("Vendor Quote");
    expect(
      otherForDownload({ ...base, attached_other: "QUOTE-FY26-GC-0058-Toro-Golf Course-August2026" }),
    ).toBe("QUOTE-FY26-GC-0058-Toro-Golf Course-August2026");
    expect(otherForDownload({ ...base, attached_other: null })).toBe("");
  });
});

describe("wrapToWidth", () => {
  const measure = (t: string) => t.length; // 1 unit per char

  it("breaks a dashed filename after the dashes", () => {
    expect(wrapToWidth("QUOTE-FY27-GC-0002-Ace-Golf Course", 12, measure)).toEqual([
      "QUOTE-FY27-",
      "GC-0002-Ace-",
      "Golf Course",
    ]);
  });

  it("never loses characters", () => {
    const t = "QUOTE-FY27-GC-0002-RussoPowerEquipment-Golf Course-September2026 and SOW";
    expect(wrapToWidth(t, 30, measure).join("").replace(/\s/g, "")).toBe(t.replace(/\s/g, ""));
  });
});
