import { describe, it, expect } from "vitest";
import { matchCapability } from "@/lib/my-day/capabilities";

describe("matchCapability", () => {
  it("recognizes an SF-52 task and points at the filler", () => {
    for (const t of ["Complete an SF-52 for my promotion", "fill out sf 52", "start the personnel action"]) {
      const c = matchCapability(t);
      expect(c?.key).toBe("sf52");
      expect(c?.available).toBe(true);
      expect(c?.href).toBe("/staff/sf52");
    }
  });

  it("recognizes sole source, SOW, and work orders", () => {
    expect(matchCapability("write a sole source justification")?.key).toBe("sole_source");
    expect(matchCapability("draft the statement of work")?.key).toBe("sow");
    expect(matchCapability("create a work order for the mower")?.key).toBe("work_order");
  });

  it("recognizes a purchase request without matching plain 'order' tasks", () => {
    expect(matchCapability("create a purchase request for sand")?.key).toBe("pr");
    expect(matchCapability("order bunker sand")).toBeNull();
  });

  it("flags DD-200 / DD-2212 as recognized but not available in the app", () => {
    const dd200 = matchCapability("complete a DD-200 for the broken pump");
    expect(dd200?.key).toBe("dd200");
    expect(dd200?.available).toBe(false);
    expect(matchCapability("DD 2212 for the missing asset")?.available).toBe(false);
  });

  it("returns null for ordinary tasks", () => {
    expect(matchCapability("water the practice green")).toBeNull();
    expect(matchCapability("walk the course with Ruben")).toBeNull();
  });
});
