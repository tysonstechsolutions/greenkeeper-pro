/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { wrapToWidth } from "@/lib/reports/purchase-request-report";

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
