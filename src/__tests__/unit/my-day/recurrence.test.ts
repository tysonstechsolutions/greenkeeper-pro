import { describe, it, expect } from "vitest";
import {
  advanceDeadline,
  nextDeadline,
  needsRollover,
  recurrenceLabel,
  RECURRENCE_OPTIONS,
} from "@/lib/my-day/recurrence";

describe("advanceDeadline", () => {
  it("adds one day for daily", () => {
    expect(advanceDeadline("2026-07-01", "daily")).toBe("2026-07-02");
    expect(advanceDeadline("2026-07-31", "daily")).toBe("2026-08-01");
  });

  it("adds seven days for weekly", () => {
    expect(advanceDeadline("2026-07-01", "weekly")).toBe("2026-07-08");
    expect(advanceDeadline("2026-12-29", "weekly")).toBe("2027-01-05");
  });

  it("adds one month for monthly, keeping the day", () => {
    expect(advanceDeadline("2026-07-15", "monthly")).toBe("2026-08-15");
  });

  it("keeps end-of-month at end-of-month across months of different lengths", () => {
    // Jul 31 -> Aug 31 -> Sep 30 -> Oct 31 ... "due by the end of the month"
    expect(advanceDeadline("2026-07-31", "monthly")).toBe("2026-08-31");
    expect(advanceDeadline("2026-08-31", "monthly")).toBe("2026-09-30");
    expect(advanceDeadline("2026-01-31", "monthly")).toBe("2026-02-28");
    // 2028 is a leap year -> Feb has 29 days
    expect(advanceDeadline("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("adds three months for quarterly, end-of-month aware", () => {
    expect(advanceDeadline("2026-01-15", "quarterly")).toBe("2026-04-15");
    expect(advanceDeadline("2026-08-31", "quarterly")).toBe("2026-11-30");
  });

  it("adds one year for yearly, end-of-month aware", () => {
    expect(advanceDeadline("2026-03-15", "yearly")).toBe("2027-03-15");
    // Feb 29 (leap) -> Feb 28 next year
    expect(advanceDeadline("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("returns the same date for 'none'", () => {
    expect(advanceDeadline("2026-07-01", "none")).toBe("2026-07-01");
  });
});

describe("nextDeadline", () => {
  it("returns the immediate next period when it is already in the future", () => {
    // last deadline was yesterday's-period; today sits before the next one
    expect(nextDeadline("2026-07-31", "monthly", "2026-08-01")).toBe("2026-08-31");
  });

  it("skips over multiple missed periods to the current one (no backfill)", () => {
    // Monthly task last done Mar 31; app not opened until Jul -> jump to Jul 31,
    // not Apr/May/Jun.
    expect(nextDeadline("2026-03-31", "monthly", "2026-07-10")).toBe("2026-07-31");
  });

  it("returns the first period strictly after last, at minimum", () => {
    expect(nextDeadline("2026-07-01", "daily", "2026-07-01")).toBe("2026-07-02");
  });

  it("handles a weekly gap of several weeks", () => {
    // last Fri 2026-07-03; today 2026-07-25 -> next Fri on/after today is 2026-07-31
    expect(nextDeadline("2026-07-03", "weekly", "2026-07-25")).toBe("2026-07-31");
  });
});

describe("needsRollover", () => {
  it("is true once today is past the last deadline", () => {
    expect(needsRollover("2026-07-31", "2026-08-01")).toBe(true);
  });

  it("is false on or before the deadline", () => {
    expect(needsRollover("2026-07-31", "2026-07-31")).toBe(false);
    expect(needsRollover("2026-07-31", "2026-07-15")).toBe(false);
  });
});

describe("recurrenceLabel / options", () => {
  it("labels each frequency", () => {
    expect(recurrenceLabel("monthly")).toBe("Monthly");
    expect(recurrenceLabel("none")).toBe("One-time");
  });

  it("exposes selectable options including One-time", () => {
    const values = RECURRENCE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["none", "daily", "weekly", "monthly", "quarterly", "yearly"]);
  });
});
