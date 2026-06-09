/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { groupAuditsByStage } from "@/lib/pr-audit/stage-groups";
import type { PrAuditReviewStatus } from "@/types/database";

function a(id: string, review_status: PrAuditReviewStatus) {
  return { id, review_status };
}

describe("groupAuditsByStage", () => {
  it("groups by stage in lifecycle order, sent_back last", () => {
    const groups = groupAuditsByStage([
      a("1", "received"),
      a("2", "pending"),
      a("3", "sent_back"),
      a("4", "sent_up"),
      a("5", "receipt_signed"),
      a("6", "ordered"),
    ]);
    expect(groups.map((g) => g.status)).toEqual([
      "pending",
      "sent_up",
      "ordered",
      "received",
      "receipt_signed",
      "sent_back",
    ]);
  });

  it("omits empty stages", () => {
    const groups = groupAuditsByStage([a("1", "pending"), a("2", "pending"), a("3", "sent_back")]);
    expect(groups.map((g) => g.status)).toEqual(["pending", "sent_back"]);
    expect(groups[0].audits.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("preserves within-stage order", () => {
    const groups = groupAuditsByStage([a("b", "ordered"), a("a", "ordered")]);
    expect(groups[0].audits.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupAuditsByStage([])).toEqual([]);
  });
});
