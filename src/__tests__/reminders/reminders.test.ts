import { describe, expect, it } from "vitest";
import { buildReminders, type ReminderInput } from "@/lib/reminders/reminders";
import type { NinetyDayEntry, RosterEntry } from "@/lib/evaluations/use-evaluations";
import type { StaffEvaluation } from "@/lib/evaluations/types";

const TODAY = "2026-10-06";
const profile = (id: string, full_name: string) => ({ id, full_name, role: "crew" as const, is_active: true, supervisor_id: null });
const finalEval = (extra: Partial<StaffEvaluation> = {}) =>
  ({ status: "final", finalized_at: "2026-09-20T15:00:00Z", ...extra }) as StaffEvaluation;

const base = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  todayIso: TODAY,
  yearEnd: [],
  ninetyDay: [],
  fiscalYear: 2026,
  people: [],
  certifications: [],
  vendors: [],
  ...over,
});

describe("buildReminders", () => {
  it("is empty when nothing needs doing", () => {
    expect(buildReminders(base())).toEqual([]);
  });

  it("lists due and overdue evaluations, not upcoming or finished ones", () => {
    const yearEnd: RosterEntry[] = [
      { profile: profile("a", "Ann"), evaluation: null, progress: "not_started", dueDate: "2026-10-31", due: "due_soon" },
      { profile: profile("b", "Bob"), evaluation: null, progress: "in_progress", dueDate: "2026-12-31", due: "upcoming" },
      { profile: profile("c", "Cat"), evaluation: finalEval({ approved_on: "2026-09-21", discussed_on: "2026-09-21", copy_given_on: "2026-09-21" }), progress: "final", dueDate: "2026-10-31", due: null },
    ];
    const ninetyDay: NinetyDayEntry[] = [
      { profile: profile("d", "Dee"), hireDate: "2026-07-01", dueDate: "2026-09-29", due: "overdue", evaluation: null, progress: "not_started" },
    ];
    const r = buildReminders(base({ yearEnd, ninetyDay }));
    expect(r.map((x) => [x.title, x.tone, x.detail])).toEqual([
      ["90-day evaluation: Dee", "overdue", "7 days overdue"],
      ["Year-end evaluation: Ann", "soon", "Due in 25 days"],
    ]);
    expect(r[0].href).toBe("/staff/evaluations/edit?employee=d&kind=90day&start=2026-07-01");
    expect(r[1].href).toBe("/staff/evaluations/edit?employee=a&fy=2026");
  });

  it("nags about follow-through that is overdue or due within 3 days", () => {
    const yearEnd: RosterEntry[] = [
      // Finalized Sep 20 → due Oct 4 → overdue.
      { profile: profile("a", "Ann"), evaluation: finalEval({ approved_on: "2026-09-21" }), progress: "final", dueDate: "2026-10-31", due: null },
      // Finalized Sep 24 → due Oct 8 → within 3 days.
      { profile: profile("b", "Bob"), evaluation: finalEval({ finalized_at: "2026-09-24T12:00:00Z" }), progress: "final", dueDate: "2026-10-31", due: null },
      // Finalized Oct 1 → due Oct 15 → not yet.
      { profile: profile("c", "Cat"), evaluation: finalEval({ finalized_at: "2026-10-01T12:00:00Z" }), progress: "final", dueDate: "2026-10-31", due: null },
    ];
    const r = buildReminders(base({ yearEnd }));
    expect(r.map((x) => [x.title, x.tone])).toEqual([
      ["Finish Ann's year-end evaluation", "overdue"],
      ["Finish Bob's year-end evaluation", "soon"],
    ]);
    expect(r[0].detail).toBe("Still needs: discussed, copy given · was due Oct 4");
  });

  it("warns two weeks before a 90-day mark and a last day", () => {
    const r = buildReminders(
      base({
        people: [
          { id: "n", name: "New Cook", hireDate: "2026-07-15", separationDate: null }, // mark Oct 13
          { id: "o", name: "Old Hand", hireDate: "2020-01-01", separationDate: "2026-10-10" },
          { id: "p", name: "Far Off", hireDate: "2026-09-01", separationDate: "2026-12-01" },
        ],
      }),
    );
    expect(r.map((x) => [x.kind, x.title, x.date])).toEqual([
      ["last_day", "Old Hand's last day", "2026-10-10"],
      ["ninety_day_mark", "New Cook reaches 90 days", "2026-10-13"],
    ]);
    expect(r[1].detail).toBe("Oct 13 (in 7 days) · 90-day evaluation due then");
    expect(r[1].href).toBe("/staff/evaluations?tab=90day");
  });

  it("flags certifications and 889s within 30 days, expired first", () => {
    const r = buildReminders(
      base({
        people: [{ id: "a", name: "Ann", hireDate: null, separationDate: null }],
        certifications: [
          { id: "c1", holder: "Ann", profile_id: "a", cert_name: "Food Handler", expires_date: "2026-10-20" },
          { id: "c2", holder: "Zed", profile_id: "z", cert_name: "Pesticide", expires_date: "2026-10-01" },
          { id: "c3", holder: "Ann", profile_id: "a", cert_name: "CPR", expires_date: "2027-03-01" },
          { id: "c4", holder: "Contractor", profile_id: null, cert_name: "License", expires_date: "2026-09-30" },
        ],
        vendors: [
          { id: "v1", name: "US Foods", section_889_path: "x.pdf", section_889_expiration_date: "2026-10-30" },
          { id: "v2", name: "Toro", section_889_path: "y.pdf", section_889_expiration_date: "2027-06-01" },
        ],
      }),
    );
    // Zed isn't someone the viewer manages, so his cert is left off.
    expect(r.map((x) => [x.title, x.tone])).toEqual([
      ["Contractor: License", "overdue"],
      ["Ann: Food Handler", "soon"],
      ["US Foods: Section 889 form", "soon"],
    ]);
  });

  it("skips 889s when the viewer doesn't handle vendors", () => {
    const r = buildReminders(
      base({ vendors: null }),
    );
    expect(r).toEqual([]);
  });
});
