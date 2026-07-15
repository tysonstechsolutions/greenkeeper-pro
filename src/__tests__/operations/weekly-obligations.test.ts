import { describe, it, expect } from "vitest";
import { evaluateObligation, periodKey, weekStart } from "@/lib/operations/engine";
import type { Obligation } from "@/lib/operations/types";

/** A weekly obligation due on `weekday` (0=Sun..6=Sat). */
function weekly(weekday: number, leadDays = 1): Obligation {
  return {
    id: "kronos",
    slug: "kronos-timecards",
    title: "Fix Kronos timecards",
    detail: null,
    workspace: "people",
    cadence: "weekly",
    due_day: 1,
    due_month: null,
    due_weekday: weekday,
    lead_days: leadDays,
    delegable: true,
    link_href: null,
    is_active: true,
    notes: null,
    sort_order: 0,
    created_at: "2026-06-01T00:00:00Z",
  } as Obligation;
}

describe("weekStart", () => {
  it("returns the Sunday that begins the pay period", () => {
    // Wed 2026-07-15 → Sun 2026-07-12
    expect(weekStart(new Date(2026, 6, 15)).getDate()).toBe(12);
    expect(weekStart(new Date(2026, 6, 15)).getDay()).toBe(0);
  });

  it("treats Sunday as the start of its own week, not the previous one", () => {
    const sun = new Date(2026, 6, 12);
    expect(weekStart(sun).getDate()).toBe(12);
  });

  it("treats Saturday as the END of that same week", () => {
    // Sat 2026-07-18 still belongs to the week starting Sun 2026-07-12.
    expect(weekStart(new Date(2026, 6, 18)).getDate()).toBe(12);
  });
});

describe("periodKey (weekly)", () => {
  it("keys by the week's Sunday", () => {
    expect(periodKey("weekly", new Date(2026, 6, 15))).toBe("W2026-07-12");
  });

  it("gives every day of one Sun–Sat week the SAME key", () => {
    const keys = new Set<string>();
    for (let d = 12; d <= 18; d++) {
      keys.add(periodKey("weekly", new Date(2026, 6, d)));
    }
    expect(keys.size).toBe(1);
  });

  it("rolls to a new key on the next Sunday", () => {
    expect(periodKey("weekly", new Date(2026, 6, 18))).toBe("W2026-07-12"); // Sat
    expect(periodKey("weekly", new Date(2026, 6, 19))).toBe("W2026-07-19"); // Sun
  });

  // ISO week numbers would mis-file this: Dec 28 2026 is ISO 2026-W53 but
  // Jan 3 2027 is ISO 2026-W53 too under some conventions. Date keys can't.
  it("stays unambiguous across a year boundary", () => {
    const a = periodKey("weekly", new Date(2026, 11, 31)); // Thu
    const b = periodKey("weekly", new Date(2027, 0, 3)); // Sun
    expect(a).not.toBe(b);
    expect(a).toBe("W2026-12-27");
    expect(b).toBe("W2027-01-03");
  });
});

/**
 * Complete every weekly period from `from` up to (not including) `until`.
 * The engine surfaces the OLDEST uncompleted occurrence — accumulated debt —
 * so reaching "this week" means every earlier week must be settled first.
 */
function completedThrough(from: Date, until: Date): Set<string> {
  const done = new Set<string>();
  let cursor = weekStart(from);
  while (cursor < weekStart(until)) {
    done.add(periodKey("weekly", cursor));
    cursor = new Date(cursor.getTime() + 7 * 86_400_000);
  }
  return done;
}

describe("evaluateObligation — weekly Kronos timecards", () => {
  // created_at is 2026-06-01 (a Monday), so its week starts Sun 2026-05-31.
  const CREATED = new Date(2026, 5, 1);

  it("surfaces the OLDEST unpaid week first — debt accumulates, it doesn't reset", () => {
    // Nothing ever completed → the first missed week is what's shown, NOT the
    // current one. Skipping a week must not silently disappear.
    const r = evaluateObligation(weekly(1), new Set(), new Date(2026, 6, 13));
    expect(r.status).toBe("overdue");
    expect(r.period).toBe("W2026-05-31");
    expect(r.dueDate).toBe("2026-06-01");
  });

  it("is due Monday for the Sun–Sat week that just closed", () => {
    const today = new Date(2026, 6, 13); // Monday
    const r = evaluateObligation(weekly(1), completedThrough(CREATED, today), today);
    expect(r.period).toBe("W2026-07-12");
    expect(r.dueDate).toBe("2026-07-13");
    expect(r.daysUntil).toBe(0);
  });

  it("shows as due_soon on Sunday night (lead_days = 1)", () => {
    const today = new Date(2026, 6, 12); // Sunday
    const r = evaluateObligation(weekly(1), completedThrough(CREATED, today), today);
    expect(r.status).toBe("due_soon");
    expect(r.daysUntil).toBe(1);
  });

  it("goes overdue Tuesday if Monday came and went", () => {
    const tue = new Date(2026, 6, 14);
    const done = completedThrough(CREATED, new Date(2026, 6, 12));
    const r = evaluateObligation(weekly(1), done, tue);
    expect(r.status).toBe("overdue");
    expect(r.daysUntil).toBeLessThan(0);
  });

  // Matches the deliberate engine rule (see unit/operations/engine.test.ts):
  // a period that ENDED before the obligation existed is never debt, but the
  // in-progress period is still owed. Created Wed 7/15, the Sun 7/12 week is
  // still in progress, so Monday's timecard fix for it still counts.
  it("still owes the in-progress week when created mid-week", () => {
    const ob = { ...weekly(1), created_at: "2026-07-15T00:00:00Z" } as Obligation;
    const r = evaluateObligation(ob, new Set(), new Date(2026, 6, 15));
    expect(r.period).toBe("W2026-07-12");
  });

  it("rolls to next Monday once this week is signed off", () => {
    const today = new Date(2026, 6, 13);
    const done = completedThrough(CREATED, today);
    done.add(periodKey("weekly", today)); // finish this week too
    const r = evaluateObligation(weekly(1), done, today);
    expect(r.dueDate).toBe("2026-07-20"); // next Monday
    expect(r.status).toBe("upcoming");
  });
});
