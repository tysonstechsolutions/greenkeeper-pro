import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  draftFromObligation,
  draftToColumns,
  emptyDraft,
  scheduleChanged,
  slugForTitle,
  validateDraft,
} from "@/lib/rhythm/obligation-form";
import { dueText, shortDueDate } from "@/lib/rhythm/labels";
import { liveObligationHref } from "@/lib/operations/obligation-links";
import type { Obligation } from "@/lib/operations/types";

function ob(partial: Partial<Obligation> = {}): Obligation {
  return {
    id: "ob-1",
    slug: "test",
    title: "Test obligation",
    detail: null,
    workspace: "general",
    cadence: "monthly",
    due_day: 15,
    due_month: null,
    due_weekday: null,
    lead_days: 5,
    delegable: true,
    link_href: null,
    is_active: true,
    notes: null,
    sort_order: 0,
    created_at: "2026-01-01T12:00:00",
    effective_from: null,
    updated_at: "2026-01-01T12:00:00",
    ...partial,
  };
}

describe("validateDraft", () => {
  it("needs a name", () => {
    expect(validateDraft({ ...emptyDraft(), title: "   " })).toBe("Give it a name.");
  });

  it("accepts a complete draft for every cadence", () => {
    for (const cadence of ["weekly", "monthly", "quarterly", "annual"] as const) {
      expect(validateDraft({ ...emptyDraft(cadence), title: "Walk the course" })).toBeNull();
    }
  });

  it("rejects days the schedule can't hold", () => {
    const base = { ...emptyDraft("monthly"), title: "x" };
    expect(validateDraft({ ...base, dueDay: 31 })).toMatch(/1 to 28/);
    expect(validateDraft({ ...base, dueDay: -1 })).toBeNull();
    expect(validateDraft({ ...emptyDraft("quarterly"), title: "x", dueMonth: 4 })).toMatch(/month of the quarter/);
    expect(validateDraft({ ...base, leadDays: 91 })).toMatch(/0 and 90/);
    expect(validateDraft({ ...base, leadDays: Number.NaN })).toMatch(/0 and 90/);
  });

  it("only links to pages inside the app", () => {
    expect(validateDraft({ ...emptyDraft(), title: "x", linkHref: "https://example.com" })).toMatch(/starting with \//);
    expect(validateDraft({ ...emptyDraft(), title: "x", linkHref: "/budget" })).toBeNull();
  });
});

describe("draftToColumns", () => {
  it("writes only the fields the cadence uses, keeping the table's checks satisfied", () => {
    expect(draftToColumns({ ...emptyDraft("weekly"), title: " Timecards ", dueWeekday: 1, dueMonth: 5 })).toMatchObject({
      title: "Timecards",
      cadence: "weekly",
      due_weekday: 1,
      due_day: 1,
      due_month: null,
      detail: null,
      link_href: null,
    });
    expect(draftToColumns({ ...emptyDraft("monthly"), title: "x", dueWeekday: 3, dueMonth: 5 })).toMatchObject({
      due_weekday: null,
      due_month: null,
    });
    expect(draftToColumns({ ...emptyDraft("annual"), title: "x", dueMonth: 2, dueDay: 15 })).toMatchObject({
      due_weekday: null,
      due_month: 2,
      due_day: 15,
    });
  });
});

describe("scheduleChanged", () => {
  it("ignores wording-only edits", () => {
    const o = ob();
    expect(scheduleChanged(o, { ...draftFromObligation(o), title: "Renamed", detail: "New notes", leadDays: 9 })).toBe(false);
  });

  it("notices a new due day or cadence", () => {
    const o = ob();
    expect(scheduleChanged(o, { ...draftFromObligation(o), dueDay: 20 })).toBe(true);
    expect(scheduleChanged(o, { ...draftFromObligation(o), cadence: "weekly" })).toBe(true);
  });

  it("treats a weekly row's unused due_day as noise", () => {
    const o = ob({ cadence: "weekly", due_weekday: 1, due_day: 7 });
    expect(scheduleChanged(o, draftFromObligation(o))).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("says the schedule in plain words", () => {
    expect(describeSchedule({ cadence: "weekly", due_weekday: 1, due_day: 1, due_month: null })).toBe("Every Monday");
    expect(describeSchedule({ cadence: "monthly", due_day: 1, due_month: null })).toBe("Every month on the 1st");
    expect(describeSchedule({ cadence: "monthly", due_day: 22, due_month: null })).toBe("Every month on the 22nd");
    expect(describeSchedule({ cadence: "monthly", due_day: 13, due_month: null })).toBe("Every month on the 13th");
    expect(describeSchedule({ cadence: "monthly", due_day: -1, due_month: null })).toBe("Last day of every month");
    expect(describeSchedule({ cadence: "quarterly", due_day: 15, due_month: 2 })).toBe("Feb, May, Aug, Nov — on the 15th");
    expect(describeSchedule({ cadence: "annual", due_day: 15, due_month: 2 })).toBe("Every year on Feb 15");
  });
});

describe("slugForTitle", () => {
  it("makes a URL-safe, unique slug", () => {
    expect(slugForTitle("Fix Kronos timecards!", "ab12")).toBe("fix-kronos-timecards-ab12");
    expect(slugForTitle("!!!", "ab12")).toBe("duty-ab12");
  });
});

describe("due wording", () => {
  it("is relative near today and dated further out", () => {
    expect(dueText(0, "2026-10-08")).toBe("Due today");
    expect(dueText(1, "2026-10-09")).toBe("Due tomorrow");
    expect(dueText(2, "2026-10-10")).toBe("Due Saturday");
    expect(dueText(7, "2026-10-15")).toBe("Due Oct 15");
    expect(dueText(-1, "2026-10-07")).toBe("1 day late");
    expect(dueText(-3, "2026-10-05")).toBe("3 days late");
    expect(shortDueDate("2026-10-05")).toBe("Mon, Oct 5");
  });
});

describe("liveObligationHref", () => {
  it("sends the retired schedule page to the staff schedule", () => {
    expect(liveObligationHref("/schedule")).toBe("/pro-shop-schedule");
    expect(liveObligationHref("/budget")).toBe("/budget");
    expect(liveObligationHref(null)).toBeNull();
  });

  it("repairs the link when an old duty is opened for editing", () => {
    expect(draftFromObligation(ob({ link_href: "/schedule" })).linkHref).toBe("/pro-shop-schedule");
  });
});
