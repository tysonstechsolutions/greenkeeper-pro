/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { groupAuditsByMonth } from "@/lib/pr-audit/month-groups";

function a(id: string, pr_date: string) {
  return { id, pr_date };
}

describe("groupAuditsByMonth", () => {
  it("groups by month, newest month first, with a readable label", () => {
    const groups = groupAuditsByMonth([
      a("1", "2026-05-10"),
      a("2", "2026-06-02"),
      a("3", "2026-05-28"),
      a("4", "2026-04-15"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-06", "2026-05", "2026-04"]);
    expect(groups[0].label).toBe("June 2026");
    // Within a month, input order is preserved (caller pre-sorts).
    expect(groups[1].audits.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("tolerates a full ISO timestamp in pr_date", () => {
    const groups = groupAuditsByMonth([a("1", "2026-05-10T12:00:00Z")]);
    expect(groups[0].key).toBe("2026-05");
  });

  it("returns nothing for an empty list", () => {
    expect(groupAuditsByMonth([])).toEqual([]);
  });
});
