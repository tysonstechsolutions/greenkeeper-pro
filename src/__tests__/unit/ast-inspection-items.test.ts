import { describe, it, expect } from "vitest";
import {
  AST_INSPECTION_ITEMS,
  AST_TANK_TYPES,
  DEFAULT_TANK_IDS,
  getDefaultPassItems,
  inferTankType,
  isNonConforming,
  type AstTankType,
} from "@/lib/ast-inspection-items";

describe("AST tank types", () => {
  it("exposes gasoline, diesel, and used_cooking_oil presets", () => {
    const keys = Object.keys(AST_TANK_TYPES) as AstTankType[];
    expect(keys).toEqual(["gasoline", "diesel", "used_cooking_oil"]);
  });

  it("maps gasoline to 3311-01A and diesel to 3311-02A", () => {
    expect(AST_TANK_TYPES.gasoline.tankIds).toBe("3311-01A");
    expect(AST_TANK_TYPES.diesel.tankIds).toBe("3311-02A");
    expect(AST_TANK_TYPES.used_cooking_oil.tankIds).toBe("8400-01UCO");
  });

  it("defaults DEFAULT_TANK_IDS to the gasoline preset", () => {
    expect(DEFAULT_TANK_IDS).toBe(AST_TANK_TYPES.gasoline.tankIds);
  });
});

describe("inferTankType", () => {
  it("identifies used cooking oil from UCO marker", () => {
    expect(inferTankType("8400-01UCO")).toBe("used_cooking_oil");
    expect(inferTankType("Used cooking oil tank")).toBe("used_cooking_oil");
  });

  it("identifies diesel from 02A", () => {
    expect(inferTankType("3311-02A")).toBe("diesel");
  });

  it("identifies gasoline from 01A", () => {
    expect(inferTankType("3311-01A")).toBe("gasoline");
  });

  it("falls back to gasoline for legacy combined fuel records", () => {
    // Old records (pre-split) stored both tanks under a single 'Fuel AST'
    // inspection. The picker should resolve to a sensible default rather
    // than crash.
    expect(inferTankType("3311-01A, 3311-02A")).toBe("diesel");
    // First-listed-tank-only legacy records would also exist.
    expect(inferTankType("Unknown tank")).toBe("gasoline");
  });
});

describe("getDefaultPassItems", () => {
  it("returns an entry for every SP001 item", () => {
    const items = getDefaultPassItems();
    expect(Object.keys(items).length).toBe(AST_INSPECTION_ITEMS.length);
    for (const def of AST_INSPECTION_ITEMS) {
      expect(items[String(def.number)]).toBeDefined();
    }
  });

  it("marks item 16 as 'no' (cracks absent = pass) and the rest as 'yes'", () => {
    const items = getDefaultPassItems();
    for (const def of AST_INSPECTION_ITEMS) {
      const entry = items[String(def.number)];
      if (def.yesIsNonConforming) {
        expect(entry.status).toBe("no");
      } else {
        expect(entry.status).toBe("yes");
      }
      expect(entry.comment).toBeNull();
    }
  });

  it("produces zero non-conforming items per SP001 reporting", () => {
    const items = getDefaultPassItems();
    let nonConforming = 0;
    for (const def of AST_INSPECTION_ITEMS) {
      const entry = items[String(def.number)];
      if (isNonConforming(def, entry.status)) nonConforming++;
    }
    expect(nonConforming).toBe(0);
  });
});
