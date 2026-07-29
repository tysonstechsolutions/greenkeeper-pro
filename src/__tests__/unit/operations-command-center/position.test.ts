import { describe, expect, it } from "vitest";
import {
  normalizePosition,
  positionDisplayLabel,
  positionOptions,
} from "@/lib/operational-work/position";

describe("normalizePosition", () => {
  it("gives every case and whitespace variant the same identity", () => {
    expect(normalizePosition("Mechanic")).toBe("mechanic");
    expect(normalizePosition(" mechanic ")).toBe("mechanic");
  });

  it("returns null for work with no position recorded", () => {
    expect(normalizePosition(null)).toBeNull();
    expect(normalizePosition("")).toBeNull();
  });

  it("resolves a merged-away role group to the position that survived it", () => {
    expect(normalizePosition("pro_shop_staff")).toBe("golf_operations_assistant");
    expect(normalizePosition("Pro_Shop_Staff")).toBe("golf_operations_assistant");
  });

  it("leaves free-text positions that were never role groups alone", () => {
    expect(normalizePosition("lead_technician")).toBe("lead_technician");
  });
});

describe("positionDisplayLabel", () => {
  it("uses the duty catalogue label for known role groups", () => {
    expect(positionDisplayLabel("recreation_aide")).toBe("Recreation Aides");
    expect(positionDisplayLabel("Golf_Operations_Assistant")).toBe("Golf Ops / Pro Shop");
  });

  it("labels the retired pro-shop role as the position it merged into", () => {
    // One job, one sheet: the people who work inside are golf ops assistants.
    expect(positionDisplayLabel("Pro_Shop_Staff")).toBe("Golf Ops / Pro Shop");
  });

  it("expands snake_case free text into words", () => {
    expect(positionDisplayLabel("lead_technician")).toBe("Lead Technician");
  });

  it("title-cases a bare lowercase key such as the equipment adapter's role", () => {
    expect(positionDisplayLabel("mechanic")).toBe("Mechanic");
  });

  it("leaves an acronym alone instead of title-casing it", () => {
    expect(positionDisplayLabel("GCM")).toBe("GCM");
    expect(positionDisplayLabel("Superintendent")).toBe("Superintendent");
  });
});

describe("positionOptions", () => {
  it("collapses case variants into one option keyed by the normalized value", () => {
    const options = positionOptions(["mechanic", "Mechanic", "mechanic"]);
    expect(options).toEqual([["mechanic", "Mechanic"]]);
  });

  it("prefers the variant that carries its own capitalisation", () => {
    expect(positionOptions(["gcm", "GCM"])).toEqual([["gcm", "GCM"]]);
    expect(positionOptions(["GCM", "gcm"])).toEqual([["gcm", "GCM"]]);
  });

  it("drops missing positions and sorts by label", () => {
    expect(positionOptions(["restaurant_staff", null, "GCM", ""]))
      .toEqual([["gcm", "GCM"], ["restaurant_staff", "Restaurant Staff"]]);
  });
});
