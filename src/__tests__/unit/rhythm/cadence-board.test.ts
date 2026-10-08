import { describe, expect, it } from "vitest";
import {
  buildRhythmBoard,
  isMyRhythmWork,
  obligationOccurrencesInRange,
  rhythmRangeLabel,
  rhythmWindowBounds,
} from "@/lib/rhythm/cadence-board";
import { periodKey, weekStart, ymdLocal } from "@/lib/operations/engine";
import type { Obligation } from "@/lib/operations/types";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

// Thursday, October 8 2026. The Sun–Sat week is Oct 4 – Oct 10.
const TODAY = new Date(2026, 9, 8);
const ME = "me-0000";
const SOMEONE_ELSE = "crew-0001";

function ob(partial: Partial<Obligation>): Obligation {
  return {
    id: partial.id ?? "ob-1",
    slug: partial.id ?? "test",
    title: partial.title ?? "Test obligation",
    detail: null,
    workspace: "general",
    cadence: "monthly",
    due_day: 1,
    due_month: null,
    due_weekday: null,
    lead_days: 0,
    delegable: false,
    link_href: null,
    is_active: true,
    notes: null,
    sort_order: 0,
    // Local noon so the creation period never shifts across a timezone.
    created_at: "2026-01-01T12:00:00",
    effective_from: null,
    updated_at: "2026-01-01T12:00:00",
    ...partial,
  };
}

function item(overrides: Partial<OperationalWorkItem> = {}): OperationalWorkItem {
  return {
    stableId: `task:${overrides.sourceRecordId ?? "t1"}`,
    sourceType: "task",
    sourceRecordId: "t1",
    title: "Test work",
    description: null,
    department: "maintenance",
    responsibleEmployee: null,
    responsiblePosition: null,
    accountableManager: null,
    status: "pending",
    dueDate: null,
    estimatedMinutes: null,
    priorityBand: "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
    verificationState: "not_required",
    aiCapabilityState: "unknown",
    destinationRoute: "/tasks/view?id=1",
    sourceLabel: "Task",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    completedAt: null,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
    dutySeriesKey: null,
    ...overrides,
  };
}

/** Completion rows for every weekly period from `from` through `through`. */
function weeklyCompletions(obligationId: string, from: Date, through: Date, skip: string[] = []) {
  const rows: { obligation_id: string; period: string }[] = [];
  for (let d = weekStart(from); d <= through; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    const period = periodKey("weekly", d);
    if (!skip.includes(period)) rows.push({ obligation_id: obligationId, period });
  }
  return rows;
}

function board(obligations: Obligation[], completions: { obligation_id: string; period: string }[] = [], work: OperationalWorkItem[] = [], today = TODAY) {
  return buildRhythmBoard({ obligations, completions, work, currentUserId: ME, today });
}

describe("rhythm windows", () => {
  it("covers the Sun–Sat pay week, the month, the calendar quarter, and the year", () => {
    const bounds = (tab: Parameters<typeof rhythmWindowBounds>[0]) => {
      const { start, end } = rhythmWindowBounds(tab, TODAY);
      return [ymdLocal(start), ymdLocal(end)];
    };
    expect(bounds("today")).toEqual(["2026-10-08", "2026-10-08"]);
    expect(bounds("week")).toEqual(["2026-10-04", "2026-10-10"]);
    expect(bounds("month")).toEqual(["2026-10-01", "2026-10-31"]);
    expect(bounds("quarter")).toEqual(["2026-10-01", "2026-12-31"]);
    expect(bounds("year")).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("labels each window in plain words", () => {
    expect(rhythmRangeLabel("week", TODAY)).toBe("Oct 4 – 10");
    expect(rhythmRangeLabel("week", new Date(2026, 8, 30))).toBe("Sep 27 – Oct 3");
    expect(rhythmRangeLabel("month", TODAY)).toBe("October 2026");
    expect(rhythmRangeLabel("quarter", TODAY)).toBe("Q4 · Oct – Dec 2026");
    expect(rhythmRangeLabel("year", TODAY)).toBe("2026");
    expect(rhythmRangeLabel("today", TODAY)).toBe("Thursday, October 8");
  });
});

describe("weekly checklist", () => {
  const timecards = ob({ id: "kronos", title: "Fix Kronos timecards", cadence: "weekly", due_weekday: 1 });

  it("shows this week's occurrence, overdue when Monday has passed", () => {
    const completions = weeklyCompletions("kronos", new Date(2025, 11, 28), new Date(2026, 8, 27));
    const week = board([timecards], completions).week;
    expect(week.checklist).toHaveLength(1);
    expect(week.checklist[0]).toMatchObject({ dueDate: "2026-10-05", period: "W2026-10-04", daysUntil: -3, done: false });
    expect(week.catchUp).toEqual([]);
    expect(week.done).toBe(0);
    expect(week.total).toBe(1);
    expect(week.remaining).toBe(1);
  });

  it("counts it done once this week's period is completed", () => {
    const completions = weeklyCompletions("kronos", new Date(2025, 11, 28), TODAY);
    const week = board([timecards], completions).week;
    expect(week.checklist[0].done).toBe(true);
    expect(week.done).toBe(1);
    expect(week.remaining).toBe(0);
  });

  it("puts a missed earlier week in catch-up, oldest first, with a count of the rest", () => {
    const completions = weeklyCompletions("kronos", new Date(2025, 11, 28), TODAY, ["W2026-09-13", "W2026-09-20"]);
    const week = board([timecards], completions).week;
    expect(week.catchUp).toHaveLength(1);
    expect(week.catchUp[0]).toMatchObject({ period: "W2026-09-13", dueDate: "2026-09-14", moreMissed: 1 });
    // The catch-up row also lands on Today, where overdue work is collected.
    expect(board([timecards], completions).today.catchUp[0].period).toBe("W2026-09-13");
  });
});

describe("bigger cycles landing inside a smaller window", () => {
  it("shows last month's due date in a week that spans two months", () => {
    // Wed Sep 30 — the week is Sep 27 – Oct 3; a monthly item due on the 30th
    // belongs to September and must not be missed.
    const monthly = ob({ id: "m30", cadence: "monthly", due_day: 30 });
    const week = board([monthly], [], [], new Date(2026, 8, 30)).week;
    expect(week.alsoDue.map((r) => [r.dueDate, r.period])).toEqual([["2026-09-30", "2026-09"]]);
    expect(week.checklist).toEqual([]);
  });

  it("surfaces a quarterly item on the Month tab when it falls this month, not on the Week tab", () => {
    const quarterly = ob({ id: "q", cadence: "quarterly", due_month: 1, due_day: 15 });
    const b = board([quarterly]);
    expect(b.quarter.checklist.map((r) => [r.dueDate, r.period])).toEqual([["2026-10-15", "2026-Q4"]]);
    expect(b.month.alsoDue.map((r) => r.dueDate)).toEqual(["2026-10-15"]);
    expect(b.week.alsoDue).toEqual([]);
  });

  it("never lists a smaller cycle as 'also due' on a bigger tab", () => {
    const weekly = ob({ id: "w", cadence: "weekly", due_weekday: 1 });
    const b = board([weekly], weeklyCompletions("w", new Date(2025, 11, 28), TODAY));
    expect(b.month.alsoDue).toEqual([]);
    expect(b.quarter.alsoDue).toEqual([]);
  });
});

describe("yearly items", () => {
  const leagues = ob({ id: "leagues", title: "Set up leagues", cadence: "annual", due_month: 2, due_day: 15 });

  it("checks off this calendar year's occurrence", () => {
    const year = board([leagues], [{ obligation_id: "leagues", period: "2026" }]).year;
    expect(year.checklist.map((r) => [r.dueDate, r.done])).toEqual([["2026-02-15", true]]);
    expect(year.done).toBe(1);
    expect(year.total).toBe(1);
  });

  it("lays the next twelve months out, starting with this one", () => {
    const quarterly = ob({ id: "q", cadence: "quarterly", due_month: 1, due_day: 15 });
    const year = board([leagues, quarterly], [{ obligation_id: "leagues", period: "2026" }]).year;
    expect(year.months).toHaveLength(12);
    expect(year.months[0]).toMatchObject({ key: "2026-10", label: "October 2026" });
    expect(year.months[11].key).toBe("2027-09");
    const feb = year.months.find((m) => m.key === "2027-02")!;
    expect(feb.rows.map((r) => [r.obligation.id, r.period, r.done])).toEqual([["leagues", "2027", false]]);
    const quarterlyMonths = year.months.filter((m) => m.rows.some((r) => r.obligation.id === "q")).map((m) => m.key);
    expect(quarterlyMonths).toEqual(["2026-10", "2027-01", "2027-04", "2027-07"]);
    // Planning rows never inflate the badge: only this year's leagues count, and it's done.
    expect(year.remaining).toBe(0);
  });
});

describe("schedule start", () => {
  it("never owes periods before effective_from", () => {
    const o = ob({ id: "fx", cadence: "monthly", due_day: 1, effective_from: "2026-08-01" });
    const month = board([o]).month;
    expect(month.catchUp).toHaveLength(1);
    expect(month.catchUp[0]).toMatchObject({ period: "2026-08", moreMissed: 1 });
    expect(month.checklist[0]).toMatchObject({ period: "2026-10", daysUntil: -7, done: false });
  });

  it("ignores inactive obligations entirely", () => {
    const b = board([ob({ id: "off", is_active: false, cadence: "weekly", due_weekday: 4 })]);
    expect(b.week.checklist).toEqual([]);
    expect(b.today.checklist).toEqual([]);
  });

  it("matches the engine for an obligation created mid-period", () => {
    const o = ob({ id: "mid", cadence: "monthly", due_day: 1, created_at: "2026-10-05T12:00:00" });
    const rows = obligationOccurrencesInRange(o, new Set(), new Date(2026, 9, 1), new Date(2026, 9, 31), TODAY);
    // October is the creation period, so October 1 is still owed (engine rule).
    expect(rows.map((r) => r.period)).toEqual(["2026-10"]);
    const before = obligationOccurrencesInRange(o, new Set(), new Date(2026, 8, 1), new Date(2026, 8, 30), TODAY);
    expect(before).toEqual([]);
  });
});

describe("today", () => {
  it("collects due-today obligations, lead-time warnings, and my own work", () => {
    const dueToday = ob({ id: "thu", title: "Thursday walk", cadence: "weekly", due_weekday: 4 });
    const soon = ob({ id: "soon", title: "Monthly report", cadence: "monthly", due_day: 12, lead_days: 5 });
    const later = ob({ id: "later", title: "Far away", cadence: "monthly", due_day: 28, lead_days: 3 });
    const completions = [
      ...weeklyCompletions("thu", new Date(2025, 11, 28), new Date(2026, 8, 27)),
      ...["01", "02", "03", "04", "05", "06", "07", "08", "09"].flatMap((m) => [
        { obligation_id: "soon", period: `2026-${m}` },
        { obligation_id: "later", period: `2026-${m}` },
      ]),
    ];
    const work = [
      item({ sourceRecordId: "mine-today", title: "Mine today", dueDate: "2026-10-08" }),
      item({ sourceRecordId: "mine-done", title: "Mine done today", dueDate: "2026-10-08", status: "completed" }),
      item({ sourceRecordId: "mine-late", title: "Mine overdue", dueDate: "2026-10-01" }),
      item({ sourceRecordId: "old-done", title: "Old finished", dueDate: "2026-10-01", status: "completed" }),
      item({ sourceRecordId: "theirs", title: "Someone else's", dueDate: "2026-10-08", responsibleEmployee: { id: SOMEONE_ELSE, name: "Crew", role: null } }),
      item({ sourceRecordId: "crew-duty", sourceType: "duty", title: "Mow greens", dueDate: "2026-10-08", responsiblePosition: "maintenance_staff" }),
      item({ sourceRecordId: "gm-duty", sourceType: "duty", title: "Lock up", dueDate: "2026-10-08", responsiblePosition: "general_manager" }),
      item({ sourceRecordId: "tomorrow", title: "Tomorrow", dueDate: "2026-10-09" }),
    ];
    const today = board([dueToday, soon, later], completions, work).today;

    expect(today.checklist.map((r) => r.obligation.id)).toEqual(["thu"]);
    expect(today.startSoon.map((r) => [r.obligation.id, r.daysUntil])).toEqual([["soon", 4]]);
    expect(today.work.map((r) => r.item.title)).toEqual(["Mine overdue", "Lock up", "Mine today", "Mine done today"]);
    // Progress: Thursday walk + three items due today, one of them finished.
    expect(today.total).toBe(4);
    expect(today.done).toBe(1);
    expect(today.remaining).toBe(4);
  });
});

describe("isMyRhythmWork", () => {
  it("keeps crew duty occurrences and other people's work off the GM list", () => {
    expect(isMyRhythmWork(item({ sourceType: "duty", responsiblePosition: "recreation_aide" }), ME)).toBe(false);
    expect(isMyRhythmWork(item({ responsibleEmployee: { id: SOMEONE_ELSE, name: "x", role: null } }), ME)).toBe(false);
    expect(isMyRhythmWork(item({ sourceType: "obligation" }), ME)).toBe(false);
    expect(isMyRhythmWork(item({ status: "cancelled" }), ME)).toBe(false);
  });

  it("keeps my own, unassigned, and GM-position work", () => {
    expect(isMyRhythmWork(item({ responsibleEmployee: { id: ME, name: "me", role: null } }), ME)).toBe(true);
    expect(isMyRhythmWork(item({ sourceType: "purchase_request" }), ME)).toBe(true);
    expect(isMyRhythmWork(item({ sourceType: "duty", responsiblePosition: "general_manager" }), ME)).toBe(true);
  });
});
