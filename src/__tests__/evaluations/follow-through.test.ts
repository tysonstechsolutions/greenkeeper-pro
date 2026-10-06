import { describe, expect, it } from "vitest";
import { followThrough, followThroughText } from "@/lib/evaluations/follow-through";

const final = { status: "final" as const, finalized_at: "2026-10-01T15:00:00Z" };

describe("evaluation follow-through", () => {
  it("is nothing until the evaluation is final", () => {
    expect(followThrough(null, "2026-10-06")).toBeNull();
    expect(followThrough({ status: "draft", finalized_at: null }, "2026-10-06")).toBeNull();
  });

  it("is due two weeks after finalizing and lists what is left", () => {
    const ft = followThrough({ ...final, approved_on: "2026-10-02" }, "2026-10-06")!;
    expect(ft).toMatchObject({ done: 1, total: 3, dueDate: "2026-10-15", overdue: false, complete: false });
    expect(ft.missing.map((m) => m.key)).toEqual(["discussed_on", "copy_given_on"]);
    expect(followThroughText(ft)).toBe("Still needs: discussed, copy given · due Oct 15");
  });

  it("is overdue the day after the two weeks", () => {
    expect(followThrough(final, "2026-10-15")!.overdue).toBe(false);
    const late = followThrough(final, "2026-10-16")!;
    expect(late.overdue).toBe(true);
    expect(followThroughText(late)).toBe("Still needs: signed, discussed, copy given · overdue since Oct 15");
  });

  it("is complete when all three dates are in, and never overdue", () => {
    const ft = followThrough(
      { ...final, approved_on: "2026-10-02", discussed_on: "2026-10-03", copy_given_on: "2026-10-03" },
      "2026-12-01",
    )!;
    expect(ft).toMatchObject({ complete: true, overdue: false, done: 3 });
    expect(followThroughText(ft)).toBe("Signed, discussed, and copy given");
  });
});
