/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  findREIConflicts,
  type REIZoneInfo,
} from "@/lib/utils/rei-conflicts";

const rei = (over: Partial<REIZoneInfo>): REIZoneInfo => ({
  application_id: "app-1",
  product_name: "Primo Maxx",
  zone_ids: [],
  hole_numbers: [],
  rei_expires_at: "2026-06-01T18:00:00Z",
  hours_remaining: 4,
  ...over,
});

describe("findREIConflicts", () => {
  it("returns no conflicts when the target zone and holes match nothing", () => {
    const active = [rei({ zone_ids: ["zone-a"], hole_numbers: [1] })];
    const conflicts = findREIConflicts(
      { zone_id: "zone-b", hole_numbers: [2] },
      active,
    );
    expect(conflicts).toEqual([]);
  });

  it("flags a conflict when the target zone is under an active REI", () => {
    const a = rei({ application_id: "x", zone_ids: ["green-3", "green-4"] });
    const conflicts = findREIConflicts(
      { zone_id: "green-3", hole_numbers: [] },
      [a],
    );
    expect(conflicts).toEqual([a]);
  });

  it("flags a conflict when a target hole overlaps an active REI", () => {
    const a = rei({ application_id: "y", hole_numbers: [5, 6, 7] });
    const conflicts = findREIConflicts(
      { zone_id: null, hole_numbers: [7] },
      [a],
    );
    expect(conflicts).toEqual([a]);
  });

  it("returns nothing when the target has no zone and no holes", () => {
    const active = [rei({ zone_ids: ["zone-a"], hole_numbers: [1, 2, 3] })];
    const conflicts = findREIConflicts(
      { zone_id: null, hole_numbers: [] },
      active,
    );
    expect(conflicts).toEqual([]);
  });

  it("returns each conflicting REI once even if it matches by both zone and hole", () => {
    const a = rei({
      application_id: "z",
      zone_ids: ["green-3"],
      hole_numbers: [3],
    });
    const conflicts = findREIConflicts(
      { zone_id: "green-3", hole_numbers: [3] },
      [a],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].application_id).toBe("z");
  });

  it("returns all conflicting REIs when several overlap", () => {
    const a = rei({ application_id: "a", zone_ids: ["green-1"] });
    const b = rei({ application_id: "b", hole_numbers: [9] });
    const c = rei({ application_id: "c", zone_ids: ["green-9"] }); // no overlap
    const conflicts = findREIConflicts(
      { zone_id: "green-1", hole_numbers: [9] },
      [a, b, c],
    );
    expect(conflicts.map((r) => r.application_id)).toEqual(["a", "b"]);
  });

  it("ignores an empty active list", () => {
    expect(
      findREIConflicts({ zone_id: "green-1", hole_numbers: [1] }, []),
    ).toEqual([]);
  });
});
