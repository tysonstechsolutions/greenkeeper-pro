import { describe, expect, it } from "vitest";
import {
  findDuplicateGroups,
  normalizeVendorName,
  samIds,
  suggestKeeper,
  type DuplicateCandidate,
} from "@/lib/vendor-duplicates";

const v = (id: string, name: string, extra: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({ id, name, ...extra });

describe("normalizeVendorName", () => {
  it("ignores case, punctuation, & vs and, and business endings", () => {
    expect(normalizeVendorName("Russo Hardware, Inc.")).toBe("russo hardware");
    expect(normalizeVendorName("RUSSO HARDWARE")).toBe("russo hardware");
    expect(normalizeVendorName("The Toro Company")).toBe("toro");
    expect(normalizeVendorName("R&R Products L.L.C.")).toBe("r and r products");
    expect(normalizeVendorName("R and R Products LLC")).toBe("r and r products");
    // A name that IS just an ending keeps it.
    expect(normalizeVendorName("Co")).toBe("co");
    expect(normalizeVendorName("")).toBe("");
  });

  it("reads SAM.gov ids from notes", () => {
    expect(samIds("UEI: ABC123DEF456 · CAGE: 1XYZ2")).toEqual(["UEI:ABC123DEF456", "CAGE:1XYZ2"]);
    expect(samIds(null)).toEqual([]);
  });
});

describe("findDuplicateGroups", () => {
  it("groups by cleaned name or shared UEI/CAGE, transitively, skipping combined vendors", () => {
    const groups = findDuplicateGroups([
      v("1", "Russo Hardware Inc", { notes: "UEI: ABC123DEF456" }),
      v("2", "RUSSO HARDWARE"),
      v("3", "Russo Power Equipment", { notes: "uei: abc123def456" }),
      v("4", "Toro Co"),
      v("5", "The Toro Company"),
      v("6", "Uline"),
      v("7", "Uline", { merged_into_id: "6" }),
      v("8", ""),
      v("9", "  "),
    ]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([
      ["2", "1", "3"],
      ["5", "4"],
    ]);
  });

  it("finds nothing when every vendor is different", () => {
    expect(findDuplicateGroups([v("1", "Napa"), v("2", "Uline")])).toEqual([]);
  });
});

describe("suggestKeeper", () => {
  it("prefers the 889 good the longest, then the most complete record", () => {
    const a = v("a", "Russo Hardware Inc", { section_889_path: "x", section_889_expiration_date: "2026-11-15" });
    const b = v("b", "Russo Hardware", { section_889_path: "y", section_889_expiration_date: "2027-02-01" });
    const c = v("c", "RUSSO HARDWARE, INC.", { phone: "1", email: "e", address: "a", poc: "p" });
    expect(suggestKeeper([a, b, c]).id).toBe("b");
    expect(suggestKeeper([c, v("d", "Russo", { phone: "1" })]).id).toBe("c");
    expect(suggestKeeper([v("e", "Russo Hardware Inc"), v("f", "Russo Hardware")]).id).toBe("f");
  });
});
