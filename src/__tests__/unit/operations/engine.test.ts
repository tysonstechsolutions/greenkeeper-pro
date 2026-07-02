import { describe, expect, it } from "vitest";
import {
  diffDays,
  dutiesForDate,
  evaluateObligation,
  evaluateObligations,
  isInSeason,
  periodKey,
  weekdayKey,
  ymdLocal,
} from "@/lib/operations/engine";
import type { Obligation, OperationDuty } from "@/lib/operations/types";

function ob(partial: Partial<Obligation>): Obligation {
  return {
    id: partial.id ?? "ob-1",
    slug: "test",
    title: "Test obligation",
    detail: null,
    workspace: "general",
    cadence: "monthly",
    due_day: 1,
    due_month: null,
    lead_days: 7,
    delegable: false,
    link_href: null,
    is_active: true,
    notes: null,
    sort_order: 0,
    // Local noon — a Z-suffixed midnight would parse to Dec 31 in US zones
    // and shift the creation period.
    created_at: "2026-01-01T12:00:00",
    updated_at: "2026-01-01T12:00:00",
    ...partial,
  };
}

const NONE: ReadonlySet<string> = new Set();

describe("periodKey", () => {
  it("formats monthly, quarterly, annual keys", () => {
    const d = new Date(2026, 6, 2); // Jul 2 2026
    expect(periodKey("monthly", d)).toBe("2026-07");
    expect(periodKey("quarterly", d)).toBe("2026-Q3");
    expect(periodKey("annual", d)).toBe("2026");
  });

  it("quarter boundaries land correctly", () => {
    expect(periodKey("quarterly", new Date(2026, 0, 1))).toBe("2026-Q1");
    expect(periodKey("quarterly", new Date(2026, 2, 31))).toBe("2026-Q1");
    expect(periodKey("quarterly", new Date(2026, 3, 1))).toBe("2026-Q2");
    expect(periodKey("quarterly", new Date(2026, 11, 31))).toBe("2026-Q4");
  });
});

describe("evaluateObligation — monthly", () => {
  it("upcoming outside the lead window", () => {
    // Created Jul 1, so June's occurrence never applies.
    const o = ob({ due_day: 25, lead_days: 5, created_at: "2026-07-01T00:00:00" });
    const r = evaluateObligation(o, NONE, new Date(2026, 6, 2));
    expect(r.status).toBe("upcoming");
    expect(r.dueDate).toBe("2026-07-25");
    expect(r.period).toBe("2026-07");
  });

  it("due_soon inside the lead window", () => {
    const o = ob({ due_day: 5, lead_days: 5, created_at: "2026-07-01T06:00:00" });
    const r = evaluateObligation(o, NONE, new Date(2026, 6, 2));
    expect(r.status).toBe("due_soon");
    expect(r.daysUntil).toBe(3);
  });

  it("overdue after the due date passes", () => {
    const o = ob({ due_day: 1, created_at: "2026-06-15T06:00:00" });
    // June was completed; July 1 was missed.
    const r = evaluateObligation(o, new Set(["2026-06"]), new Date(2026, 6, 2));
    expect(r.status).toBe("overdue");
    expect(r.daysUntil).toBe(-1);
  });

  it("done when the period is completed, and warns about NEXT period across the boundary", () => {
    const o = ob({ due_day: 1, lead_days: 7, created_at: "2026-06-15T06:00:00" });
    // June + July handled; on Jul 28 the Aug 1 occurrence is 4 days out → due_soon.
    const r = evaluateObligation(
      o,
      new Set(["2026-06", "2026-07"]),
      new Date(2026, 6, 28),
    );
    expect(r.status).toBe("due_soon");
    expect(r.period).toBe("2026-08");
    expect(r.dueDate).toBe("2026-08-01");
  });

  it("done when current is completed and next is beyond the lead", () => {
    const o = ob({ due_day: 1, lead_days: 7, created_at: "2026-06-15T06:00:00" });
    const r = evaluateObligation(
      o,
      new Set(["2026-06", "2026-07"]),
      new Date(2026, 6, 10),
    );
    // Aug 1 is 22 days away — not in lead, but it IS the earliest uncompleted
    // occurrence, so it reports as upcoming (visible, not alarming).
    expect(r.status).toBe("upcoming");
    expect(r.period).toBe("2026-08");
  });

  it("surfaces last period's missed occurrence as the overdue one", () => {
    const o = ob({ due_day: 15, created_at: "2026-06-01T06:00:00" });
    const r = evaluateObligation(o, NONE, new Date(2026, 6, 2));
    // June 15 was never completed and the obligation existed then.
    expect(r.status).toBe("overdue");
    expect(r.period).toBe("2026-06");
    expect(r.dueDate).toBe("2026-06-15");
  });

  it("tracks the IN-PROGRESS period even when created after its due day", () => {
    // Seeded Jul 2 with due day 1: July's inspection still has to happen —
    // it shows as 1 day overdue, not silently skipped until August.
    const o = ob({ due_day: 1, created_at: "2026-07-02T10:00:00Z" });
    const r = evaluateObligation(o, NONE, new Date(2026, 6, 2));
    expect(r.period).toBe("2026-07");
    expect(r.status).toBe("overdue");
    expect(r.daysUntil).toBe(-1);
  });

  it("never counts periods that ended before the obligation existed", () => {
    const o = ob({ due_day: 1, created_at: "2026-07-02T10:00:00Z" });
    const r = evaluateObligation(o, new Set(["2026-07"]), new Date(2026, 6, 2));
    // June must not appear as debt; with July done, next is August.
    expect(r.period).toBe("2026-08");
    expect(r.status).toBe("upcoming");
  });

  it("keeps EVERY missed period visible and completable, oldest first", () => {
    // App unused Aug–Oct; only July was completed. On Nov 3 the oldest miss
    // (Aug 31) is the one shown — not October's, and not silently dropped.
    const o = ob({ due_day: -1, lead_days: 7, created_at: "2026-07-02T10:00:00Z" });
    const nov3 = new Date(2026, 10, 3);
    const first = evaluateObligation(o, new Set(["2026-07"]), nov3);
    expect(first.status).toBe("overdue");
    expect(first.period).toBe("2026-08");
    expect(first.dueDate).toBe("2026-08-31");
    // Completing August surfaces September next — the debt drains in order.
    const second = evaluateObligation(o, new Set(["2026-07", "2026-08"]), nov3);
    expect(second.status).toBe("overdue");
    expect(second.period).toBe("2026-09");
  });

  it("annual obligation created after its due day still tracks the current year", () => {
    const o = ob({
      cadence: "annual",
      due_month: 5,
      due_day: 15,
      lead_days: 21,
      created_at: "2026-05-16T10:00:00Z",
    });
    const r = evaluateObligation(o, NONE, new Date(2026, 4, 20));
    expect(r.period).toBe("2026");
    expect(r.status).toBe("overdue");
  });

  it("lead windows longer than a month never report done while inside the lead", () => {
    const o = ob({ due_day: 1, lead_days: 60, created_at: "2026-01-01T10:00:00Z" });
    const done = new Set([
      "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
    // Jul 2: Sep 1 is 61 days out — just past the lead → upcoming (not done).
    const outside = evaluateObligation(o, done, new Date(2026, 6, 2));
    expect(outside.period).toBe("2026-09");
    expect(outside.status).toBe("upcoming");
    // Jul 3: Sep 1 is 60 days out — inside the lead → due_soon.
    const inside = evaluateObligation(o, done, new Date(2026, 6, 3));
    expect(inside.period).toBe("2026-09");
    expect(inside.status).toBe("due_soon");
  });

  it("due_day -1 = last day of month, February included", () => {
    const o = ob({ due_day: -1, lead_days: 3 });
    const feb = evaluateObligation(o, new Set(["2026-01"]), new Date(2026, 1, 26));
    expect(feb.dueDate).toBe("2026-02-28"); // 2026 is not a leap year
    expect(feb.status).toBe("due_soon");
  });

  it("clamps due_day past the month's end", () => {
    const o = ob({ due_day: 28, lead_days: 0 });
    const r = evaluateObligation(o, new Set(["2026-01"]), new Date(2026, 1, 28));
    expect(r.dueDate).toBe("2026-02-28");
    expect(r.status).toBe("due_soon"); // due today, lead 0
  });
});

describe("evaluateObligation — annual", () => {
  it("FY items: due Oct 1 with a 30-day lead warns in September", () => {
    const o = ob({ cadence: "annual", due_month: 10, due_day: 1, lead_days: 30 });
    const r = evaluateObligation(o, NONE, new Date(2026, 8, 5)); // Sep 5
    expect(r.status).toBe("due_soon");
    expect(r.dueDate).toBe("2026-10-01");
    expect(r.period).toBe("2026");
  });

  it("completed year goes quiet until next year's lead window", () => {
    const o = ob({ cadence: "annual", due_month: 10, due_day: 1, lead_days: 30 });
    const r = evaluateObligation(o, new Set(["2026"]), new Date(2026, 10, 1)); // Nov 1
    expect(r.status).toBe("upcoming");
    expect(r.period).toBe("2027");
    expect(r.dueDate).toBe("2027-10-01");
  });

  it("past-due annual shows overdue", () => {
    const o = ob({ cadence: "annual", due_month: 5, due_day: 15, lead_days: 21 });
    const r = evaluateObligation(o, NONE, new Date(2026, 5, 20)); // Jun 20
    expect(r.status).toBe("overdue");
    expect(r.dueDate).toBe("2026-05-15");
  });
});

describe("evaluateObligation — quarterly", () => {
  it("due in the Nth month of each quarter", () => {
    const o = ob({
      cadence: "quarterly",
      due_month: 3,
      due_day: 15,
      lead_days: 7,
      created_at: "2026-07-01T00:00:00",
    });
    const r = evaluateObligation(o, NONE, new Date(2026, 6, 2)); // Jul 2 → Q3
    expect(r.period).toBe("2026-Q3");
    expect(r.dueDate).toBe("2026-09-15");
    expect(r.status).toBe("upcoming");
  });
});

describe("evaluateObligations — ordering", () => {
  it("sorts overdue → due_soon → upcoming → done", () => {
    const today = new Date(2026, 6, 10);
    // All created Jul 1 so June occurrences don't apply.
    const created = "2026-07-01T00:00:00";
    const list = [
      ob({ id: "done", slug: "a", due_day: 5, created_at: created }),
      ob({ id: "overdue", slug: "b", due_day: 5, created_at: created }),
      ob({ id: "upcoming", slug: "c", due_day: 28, lead_days: 3, created_at: created }),
      ob({ id: "soon", slug: "d", due_day: 15, lead_days: 7, created_at: created }),
    ];
    const completions = [{ obligation_id: "done", period: "2026-07" }];
    const out = evaluateObligations(list, completions, today);
    expect(out.map((e) => e.obligation.id)).toEqual([
      "overdue",
      "soon",
      "upcoming",
      "done",
    ]);
  });

  it("skips inactive obligations", () => {
    const out = evaluateObligations(
      [ob({ id: "x", is_active: false })],
      [],
      new Date(2026, 6, 2),
    );
    expect(out).toHaveLength(0);
  });
});

describe("season & duties", () => {
  it("season runs late March through mid-October", () => {
    expect(isInSeason(new Date(2026, 2, 19))).toBe(false); // Mar 19
    expect(isInSeason(new Date(2026, 2, 20))).toBe(true); // Mar 20
    expect(isInSeason(new Date(2026, 6, 4))).toBe(true); // Jul 4
    expect(isInSeason(new Date(2026, 9, 15))).toBe(true); // Oct 15
    expect(isInSeason(new Date(2026, 9, 16))).toBe(false); // Oct 16
    expect(isInSeason(new Date(2026, 0, 5))).toBe(false); // Jan
  });

  it("weekdayKey maps correctly", () => {
    expect(weekdayKey(new Date(2026, 6, 2))).toBe("thu"); // Jul 2 2026 is a Thursday
    expect(weekdayKey(new Date(2026, 6, 5))).toBe("sun");
  });

  function duty(partial: Partial<OperationDuty>): OperationDuty {
    return {
      id: partial.id ?? "d1",
      title: "Test duty",
      area: "course",
      days: ["mon"],
      season: "in_season",
      note: null,
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
      ...partial,
    };
  }

  it("returns duties matching the weekday, in sort order", () => {
    const duties = [
      duty({ id: "b", days: ["thu"], sort_order: 2 }),
      duty({ id: "a", days: ["thu", "mon"], sort_order: 1 }),
      duty({ id: "c", days: ["fri"], sort_order: 0 }),
    ];
    const out = dutiesForDate(duties, new Date(2026, 6, 2)); // Thursday
    expect(out.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("in_season duties disappear off-season; year_round stay", () => {
    const duties = [
      duty({ id: "seasonal", days: ["mon"] }),
      duty({ id: "always", days: ["mon"], season: "year_round" }),
    ];
    const winterMonday = new Date(2026, 0, 5); // Jan 5 2026, a Monday
    expect(dutiesForDate(duties, winterMonday).map((d) => d.id)).toEqual(["always"]);
  });

  it("inactive duties never run", () => {
    const out = dutiesForDate(
      [duty({ is_active: false, days: ["thu"] })],
      new Date(2026, 6, 2),
    );
    expect(out).toHaveLength(0);
  });
});

describe("date helpers", () => {
  it("ymdLocal formats local dates", () => {
    expect(ymdLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("diffDays is symmetric around midnight boundaries", () => {
    expect(diffDays(new Date(2026, 6, 1, 23, 59), new Date(2026, 6, 2, 0, 1))).toBe(1);
    expect(diffDays(new Date(2026, 6, 2), new Date(2026, 6, 1))).toBe(-1);
  });
});
