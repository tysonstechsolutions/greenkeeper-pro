/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { PR_STAGES, PR_STAGE_COUNT, prStageIndex } from "@/lib/pr-stages";

describe("pr-stages", () => {
  it("lists the five lifecycle stages in order", () => {
    expect(PR_STAGE_COUNT).toBe(5);
    expect(PR_STAGES.map((s) => s.status)).toEqual([
      "draft",
      "submitted",
      "sent",
      "approved",
      "received",
    ]);
  });

  it("returns the 0-based index of a status", () => {
    expect(prStageIndex("draft")).toBe(0);
    expect(prStageIndex("submitted")).toBe(1);
    expect(prStageIndex("sent")).toBe(2);
    expect(prStageIndex("approved")).toBe(3);
    expect(prStageIndex("received")).toBe(4);
  });

  it("returns -1 for an unrecognized status", () => {
    expect(prStageIndex("bogus" as never)).toBe(-1);
  });
});
