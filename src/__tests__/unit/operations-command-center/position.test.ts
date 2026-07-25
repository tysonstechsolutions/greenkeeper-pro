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
});

describe("positionDisplayLabel", () => {
  it("uses the duty catalogue label for known role groups", () => {
    expect(positionDisplayLabel("recreation_aide")).toBe("Recreation Aides");
    expect(positionDisplayLabel("Pro_Shop_Staff")).toBe("Pro-Shop Staff");
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
