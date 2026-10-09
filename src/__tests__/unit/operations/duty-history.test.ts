import { describe, expect, it } from "vitest";
import {
  groupDutyHistoryByMonth,
  mergeDutyHistory,
  type DutyHistoryLegacyRow,
  type DutyHistoryTaskRow,
} from "@/lib/operations/duty-history";

const duties = [
  { id: "d-patio", title: "Blow off the patio", area: "restaurant" as const },
  { id: "d-cups", title: "Change cups", area: "course" as const },
];
const names = new Map([["p-tyson", "Tyson Bruce"], ["p-alex", "Alex"]]);

function task(partial: Partial<DutyHistoryTaskRow>): DutyHistoryTaskRow {
  return {
    id: "t", duty_id: "d-patio", title: "Blow off the patio", original_due_date: "2026-10-02",
    due_date: "2026-10-02", status: "completed", completed_at: "2026-10-02T15:00:00Z",
    completed_by: "p-tyson", verified_at: null, ...partial,
  };
}

function legacy(partial: Partial<DutyHistoryLegacyRow>): DutyHistoryLegacyRow {
  return {
    id: "l", duty_id: "d-patio", duty_date: "2026-07-01", completed_at: "2026-07-01T15:00:00Z",
    completed_by: "p-alex", profiles: { full_name: "Alex" }, ...partial,
  };
}

describe("mergeDutyHistory", () => {
  it("shows check-offs recorded on duty tasks — the ones the old log missed after July", () => {
    const entries = mergeDutyHistory([task({ id: "t1" })], [], duties, names);
    expect(entries).toEqual([{
      key: "d-patio:2026-10-02", dutyId: "d-patio", date: "2026-10-02",
      title: "Blow off the patio", area: "restaurant", completedBy: "Tyson Bruce", verified: false,
    }]);
  });

  it("keeps older check-offs that only exist in the original table", () => {
    const entries = mergeDutyHistory([], [legacy({})], duties, names);
    expect(entries[0]).toMatchObject({ date: "2026-07-01", completedBy: "Alex", area: "restaurant" });
  });

  it("shows a check-off once when it was copied onto its task", () => {
    const entries = mergeDutyHistory(
      [task({ id: "t1", original_due_date: "2026-07-01", due_date: "2026-07-01", completed_by: "p-alex" })],
      [legacy({})],
      duties,
      names,
    );
    expect(entries).toHaveLength(1);
  });

  it("files a moved occurrence under the day it was scheduled for", () => {
    const entries = mergeDutyHistory([task({ original_due_date: "2026-10-01", due_date: "2026-10-03" })], [], duties, names);
    expect(entries[0].date).toBe("2026-10-01");
  });

  it("marks verified work and keeps labels for retired duties", () => {
    const entries = mergeDutyHistory(
      [task({ id: "v", status: "verified" }), task({ id: "x", duty_id: "d-gone", title: "Old duty", original_due_date: "2026-09-30" })],
      [],
      duties,
      names,
    );
    expect(entries.map((e) => [e.title, e.verified, e.area])).toEqual([
      ["Blow off the patio", true, "restaurant"],
      ["Old duty", false, null],
    ]);
  });
});

describe("groupDutyHistoryByMonth", () => {
  it("groups newest month first", () => {
    const entries = mergeDutyHistory(
      [task({ id: "a" }), task({ id: "b", duty_id: "d-cups", original_due_date: "2026-09-15" })],
      [legacy({})],
      duties,
      names,
    );
    expect(groupDutyHistoryByMonth(entries).map((m) => [m.key, m.label, m.entries.length])).toEqual([
      ["2026-10", "October 2026", 1],
      ["2026-09", "September 2026", 1],
      ["2026-07", "July 2026", 1],
    ]);
  });
});
