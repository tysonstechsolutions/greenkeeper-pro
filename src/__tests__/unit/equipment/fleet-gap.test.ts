import { describe, expect, it } from "vitest";
import { classifyAsset, FLEET_REQUIRED_TOTAL } from "@/lib/equipment/fleet-standard";
import { analyseFleet, prioritisedGaps, recordedValue, type FleetUnitInput } from "@/lib/equipment/gap-analysis";
import {
  calculateStaffing,
  DEFAULT_STAFFING_ASSUMPTIONS,
  staffingGap,
} from "@/lib/equipment/staffing-model";

describe("classifyAsset", () => {
  // Real names out of the course's own register.
  it("recognises greens mowers by their brand names", () => {
    expect(classifyAsset("GREENS KING IV PLUS MOWER")).toBe("greens_mower");
    expect(classifyAsset("GREENSMASTER / 2002")).toBe("greens_mower");
    expect(classifyAsset("MOWER / GREENSMASTER")).toBe("greens_mower");
    expect(classifyAsset("GREENSMASTER W ROLLERS & KNIFE")).toBe("greens_mower");
  });

  it("separates fairway, rough and utility mowers", () => {
    expect(classifyAsset("MOWER FAIRWAY")).toBe("fairway_mower");
    expect(classifyAsset("MOWER ROUGH CUT")).toBe("rough_mower");
    expect(classifyAsset("TURF MOWER")).toBe("rough_mower");
    expect(classifyAsset("MOWER ROTARY FLEX LASTEC")).toBe("rough_mower");
    expect(classifyAsset("ZERO TURN MOWER")).toBe("utility_mower");
    expect(classifyAsset("MOWER WITH 60\" DECK")).toBe("utility_mower");
  });

  it("recognises the implements the standard names", () => {
    expect(classifyAsset("TRACTOR BUNKER RAKE 2010")).toBe("trap_rake");
    expect(classifyAsset("BUNKER & FIELD RAKE")).toBe("trap_rake");
    expect(classifyAsset("SPRAYER 1991")).toBe("spray_rig");
    expect(classifyAsset("TOP DRESSER WITH HOPPER")).toBe("top_dresser");
    expect(classifyAsset("TRACTOR SPREADER")).toBe("fertilizer_spreader");
    expect(classifyAsset("AERATOR")).toBe("aerifier");
    expect(classifyAsset("FAIRWAY AERATOR")).toBe("aerifier");
    expect(classifyAsset("LOADER SCOOP TYPE")).toBe("loader");
  });

  it("recognises utility vehicles", () => {
    expect(classifyAsset("GATOR 4X2 TS JOHN DEERE")).toBe("utility_vehicle");
    expect(classifyAsset("TORO WORKMAN")).toBe("utility_vehicle");
    expect(classifyAsset("TRUCKSTER / 1995")).toBe("utility_vehicle");
    expect(classifyAsset("P/UP TRUCK 2002")).toBe("utility_vehicle");
  });

  it("keeps the cart fleet out of the turf fleet", () => {
    // Carts are measured by Standard 2.3.7, separately.
    expect(classifyAsset("GOLF CART #14")).toBe("golf_cart");
    expect(classifyAsset("GOLF CART / 2000")).toBe("golf_cart");
  });

  it("keeps office and shop assets out of the fleet maths", () => {
    expect(classifyAsset("COLOR LASERJET PRINTER")).toBe("office_or_facility");
    expect(classifyAsset("CYBERNET ALL-IN-ONE PC")).toBe("office_or_facility");
    expect(classifyAsset("REFRIGERATOR W/ GLASS DOOR")).toBe("office_or_facility");
    expect(classifyAsset("GRINDER REEL IDEAL")).toBe("shop_tooling");
    expect(classifyAsset("ELECTRIC PRESSURE WASHER")).toBe("shop_tooling");
  });

  it("refuses to guess at a bare tractor", () => {
    // A prime mover with no implement named satisfies no requirement, and
    // padding a class with it would overstate readiness.
    expect(classifyAsset("TRACTOR / 1998")).toBe("unclassified");
    expect(classifyAsset("")).toBe("unclassified");
    expect(classifyAsset(null)).toBe("unclassified");
  });

  it("falls back to the DPAS description when the name is unhelpful", () => {
    expect(classifyAsset("Unit 12", "MOWER FAIRWAY")).toBe("fairway_mower");
  });
});

describe("analyseFleet", () => {
  const unit = (over: Partial<FleetUnitInput> & { name: string }): FleetUnitInput => ({
    id: over.name, status: "operational", ...over,
  });

  it("counts only working machines toward the requirement", () => {
    const analysis = analyseFleet([
      unit({ name: "GREENSMASTER A", status: "operational" }),
      unit({ name: "GREENSMASTER B", status: "out_of_service" }),
    ]);
    const greens = analysis.rows.find((r) => r.fleetClass === "greens_mower")!;
    expect(greens.required).toBe(2);
    expect(greens.operational).toBe(1);
    expect(greens.down).toBe(1);
    expect(greens.short).toBe(1);
    expect(greens.totalOutage).toBe(false);
  });

  it("flags a class where every machine is down as a total outage", () => {
    const analysis = analyseFleet([
      unit({ name: "SPRAYER 1991", status: "out_of_service" }),
    ]);
    const spray = analysis.rows.find((r) => r.fleetClass === "spray_rig")!;
    expect(spray.totalOutage).toBe(true);
    expect(spray.short).toBe(1);
  });

  it("treats in_repair and needs_service as unavailable", () => {
    const analysis = analyseFleet([
      unit({ name: "MOWER FAIRWAY", status: "in_repair" }),
      unit({ name: "AERATOR", status: "needs_service" }),
    ]);
    expect(analysis.rows.find((r) => r.fleetClass === "fairway_mower")!.operational).toBe(0);
    expect(analysis.rows.find((r) => r.fleetClass === "aerifier")!.down).toBe(1);
  });

  it("reports the whole-fleet shortfall against the standard", () => {
    const analysis = analyseFleet([]);
    expect(analysis.requiredTotal).toBe(FLEET_REQUIRED_TOTAL);
    expect(analysis.requiredTotal).toBe(20); // 2+2+1+1+1+1+2+1+5+1+1+1+1
    expect(analysis.shortTotal).toBe(20);
    expect(analysis.metClasses).toBe(0);
  });

  it("measures the cart fleet against the 5% standard separately", () => {
    const carts = Array.from({ length: 10 }, (_, i) =>
      unit({ name: `GOLF CART #${i}`, status: i < 8 ? "operational" : "out_of_service" }));
    const analysis = analyseFleet(carts);
    expect(analysis.carts.total).toBe(10);
    expect(analysis.carts.down).toBe(2);
    expect(analysis.carts.downPercent).toBe(20);
    expect(analysis.carts.meetsStandard).toBe(false);
    // Carts must not leak into a turf-fleet requirement.
    expect(analysis.shortTotal).toBe(20);
  });

  it("says nothing about carts when none are recorded", () => {
    const analysis = analyseFleet([]);
    expect(analysis.carts.downPercent).toBeNull();
    expect(analysis.carts.meetsStandard).toBeNull();
  });

  it("sums real recorded values and never estimates a missing one", () => {
    const analysis = analyseFleet([
      unit({ name: "MOWER FAIRWAY", status: "out_of_service", originalValue: 39686.25 }),
      unit({ name: "GREENSMASTER", status: "out_of_service", originalValue: null }),
    ]);
    expect(analysis.downFleetValue).toBe(39686.25);
    expect(analysis.downUnitsMissingValue).toBe(1);
  });

  it("derives the annual capital target as 20% of register value", () => {
    // Standard 4.2.2: replace at least 20% of total equipment value a year.
    const analysis = analyseFleet([
      unit({ name: "AERATOR", originalValue: 100000 }),
      unit({ name: "GOLF CART #1", originalValue: 100000 }),
    ]);
    expect(analysis.registerValue).toBe(200000);
    expect(analysis.annualReplacementTarget).toBe(40000);
  });

  it("surfaces unclassified units instead of hiding them", () => {
    const analysis = analyseFleet([unit({ name: "TRACTOR / 1998" })]);
    expect(analysis.unclassified.map((u) => u.name)).toEqual(["TRACTOR / 1998"]);
  });

  it("ranks total outages above partial gaps", () => {
    const analysis = analyseFleet([
      unit({ name: "GREENSMASTER A" }),
      unit({ name: "SPRAYER", status: "out_of_service" }),
    ]);
    const gaps = prioritisedGaps(analysis);
    expect(gaps[0].fleetClass).toBe("spray_rig");
    expect(gaps.every((g) => g.short > 0)).toBe(true);
  });
});

describe("staffing model", () => {
  it("computes crew hours from acreage and mowing frequency", () => {
    const result = calculateStaffing();
    // greens 3ac x6 /0.7 = 25.7; tees 3x3/1.2 = 7.5;
    // fairways 30x3/3.5 = 25.7; rough 90x1/4.0 = 22.5
    expect(result.surfaces.map((s) => s.hoursPerWeek)).toEqual([25.7, 7.5, 25.7, 22.5]);
    expect(result.mowingHoursPerWeek).toBe(81.4);
    expect(result.totalHoursPerWeek).toBe(141.4);
    expect(result.productiveHoursPerPerson).toBe(30);
    expect(result.requiredFte).toBe(4.7);
  });

  it("reports acreage the surface list does not account for", () => {
    expect(calculateStaffing().unallocatedAcres).toBe(24);
  });

  it("moves predictably when an assumption changes", () => {
    const half = calculateStaffing({
      ...DEFAULT_STAFFING_ASSUMPTIONS,
      nonMowingHoursPerWeek: 0,
    });
    expect(half.totalHoursPerWeek).toBe(81.4);
    expect(half.requiredFte).toBe(2.7);
  });

  it("quantifies the shortfall against the crew actually on hand", () => {
    const gap = staffingGap(calculateStaffing(), 3);
    expect(gap.requiredFte).toBe(4.7);
    expect(gap.shortfallFte).toBe(1.7);
    expect(gap.uncoveredHoursPerWeek).toBe(51);
  });

  it("reports no shortfall when the crew is big enough", () => {
    const gap = staffingGap(calculateStaffing(), 6);
    expect(gap.shortfallFte).toBeLessThan(0);
    expect(gap.uncoveredHoursPerWeek).toBe(0);
  });
});

describe("recorded values arriving from PostgREST", () => {
  it("accepts numeric strings, because Postgres numeric serialises as a string", () => {
    // Rejecting these silently reported a $4.4M register as $0.
    expect(recordedValue("13478.23")).toBe(13478.23);
    expect(recordedValue(13478.23)).toBe(13478.23);
  });

  it("treats genuinely missing values as missing, not zero", () => {
    expect(recordedValue(null)).toBeNull();
    expect(recordedValue(undefined)).toBeNull();
    expect(recordedValue("")).toBeNull();
    expect(recordedValue("n/a")).toBeNull();
  });

  it("totals a string-valued register correctly", () => {
    const analysis = analyseFleet([
      { id: "1", name: "AERATOR", status: "operational", originalValue: "100000" },
      { id: "2", name: "GOLF CART #1", status: "operational", originalValue: "50000.50" },
    ]);
    expect(analysis.registerValue).toBe(150000.5);
    expect(analysis.annualReplacementTarget).toBe(30000.1);
  });
});
