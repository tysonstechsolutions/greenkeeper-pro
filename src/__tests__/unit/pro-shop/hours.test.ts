import { describe, expect, it } from "vitest";
import {
  computeStaffHours,
  elapsedMinutes,
  formatHours,
  minutesOfDay,
  paidHours,
  paidMinutes,
  staffDayKey,
  timeFromMinutes,
  weekStart,
} from "@/lib/pro-shop/hours";
import { DEFAULT_SCHEDULE_SETTINGS, type ProShopShift } from "@/lib/pro-shop/types";

function shift(partial: Partial<ProShopShift> & { staff_id: string; shift_date: string }): ProShopShift {
  return {
    id: `${partial.staff_id}-${partial.shift_date}`,
    schedule_id: "sched",
    group: "inside",
    start_time: "06:00",
    end_time: "14:30",
    source: "template",
    note: null,
    ...partial,
  };
}

describe("time parsing", () => {
  it("reads both the HH:MM and Postgres HH:MM:SS forms", () => {
    expect(minutesOfDay("14:30")).toBe(870);
    expect(minutesOfDay("14:30:00")).toBe(870);
  });

  it("round-trips through minutes", () => {
    expect(timeFromMinutes(870)).toBe("14:30");
    expect(timeFromMinutes(minutesOfDay("05:30"))).toBe("05:30");
  });
});

describe("the unpaid lunch", () => {
  // Tyson's example, and the reason this maths exists at all.
  it("shows Mike's 06:00-14:30 as 8 hours, not 8.5", () => {
    expect(elapsedMinutes("06:00", "14:30")).toBe(510);
    expect(paidMinutes("06:00", "14:30")).toBe(480);
    expect(paidHours("06:00", "14:30")).toBe(8);
  });

  it("pays every minute of a shift at or under the 6-hour threshold", () => {
    // "More than 6 hours" — a shift of exactly 6 keeps all of it.
    expect(paidHours("08:00", "14:00")).toBe(6);
    expect(paidHours("15:00", "20:00")).toBe(5);
  });

  it("deducts the lunch the moment a shift runs past six hours", () => {
    expect(paidMinutes("08:00", "14:01")).toBe(361 - 30);
  });

  it("honours a changed threshold and lunch length", () => {
    const settings = { lunch_threshold_minutes: 300, lunch_minutes: 60 };
    expect(paidHours("08:00", "14:00", settings)).toBe(5);
    expect(paidHours("08:00", "13:00", settings)).toBe(5);
  });

  it("never returns negative pay for a backwards or zero-length shift", () => {
    expect(paidMinutes("14:00", "08:00")).toBe(0);
    expect(paidMinutes("08:00", "08:00")).toBe(0);
  });
});

describe("formatHours", () => {
  it("drops trailing zeros so a full day reads as 8, not 8.00", () => {
    expect(formatHours(480)).toBe("8");
    expect(formatHours(450)).toBe("7.5");
    expect(formatHours(435)).toBe("7.25");
    expect(formatHours(0)).toBe("0");
  });
});

describe("weekStart", () => {
  it("anchors every day to the Sunday that opens its week", () => {
    // 2026-07-29 is a Wednesday; its week opens Sunday 2026-07-26.
    expect(weekStart("2026-07-29")).toBe("2026-07-26");
    expect(weekStart("2026-07-26")).toBe("2026-07-26");
    expect(weekStart("2026-08-01")).toBe("2026-07-26");
  });
});

describe("computeStaffHours", () => {
  it("accumulates a week-to-date total across consecutive days", () => {
    // Tyson's example: 8 hours Sunday, another 8 Monday reads as 16.
    const hours = computeStaffHours([
      shift({ staff_id: "mike", shift_date: "2026-07-26", start_time: "06:00", end_time: "14:30" }),
      shift({ staff_id: "mike", shift_date: "2026-07-27", start_time: "06:00", end_time: "14:30" }),
    ]);
    expect(hours.runningByStaffDate.get(staffDayKey("mike", "2026-07-26"))).toBe(480);
    expect(hours.runningByStaffDate.get(staffDayKey("mike", "2026-07-27"))).toBe(960);
    expect(hours.totalByStaff.get("mike")).toBe(960);
  });

  it("restarts the running total on Sunday but keeps the period total climbing", () => {
    const hours = computeStaffHours([
      // Saturday closes one week, Sunday opens the next.
      shift({ staff_id: "joe", shift_date: "2026-08-01", start_time: "08:00", end_time: "14:00" }),
      shift({ staff_id: "joe", shift_date: "2026-08-02", start_time: "08:00", end_time: "14:00" }),
    ]);
    expect(hours.runningByStaffDate.get(staffDayKey("joe", "2026-08-01"))).toBe(360);
    expect(hours.runningByStaffDate.get(staffDayKey("joe", "2026-08-02"))).toBe(360);
    expect(hours.totalByStaff.get("joe")).toBe(720);
  });

  it("sums two shifts on the same day into one day figure", () => {
    const hours = computeStaffHours([
      shift({ staff_id: "bart", shift_date: "2026-07-29", start_time: "08:00", end_time: "11:00" }),
      shift({ staff_id: "bart", shift_date: "2026-07-29", start_time: "15:00", end_time: "20:00" }),
    ]);
    // 3h + 5h, each under the threshold, so nothing is deducted.
    expect(hours.dayByStaffDate.get(staffDayKey("bart", "2026-07-29"))).toBe(480);
  });

  it("keeps people separate", () => {
    const hours = computeStaffHours([
      shift({ staff_id: "a", shift_date: "2026-07-29" }),
      shift({ staff_id: "b", shift_date: "2026-07-29", start_time: "08:00", end_time: "14:00" }),
    ]);
    expect(hours.totalByStaff.get("a")).toBe(480);
    expect(hours.totalByStaff.get("b")).toBe(360);
  });

  it("uses the default settings when none are passed", () => {
    expect(DEFAULT_SCHEDULE_SETTINGS.lunch_threshold_minutes).toBe(360);
    expect(paidMinutes("06:00", "14:30")).toBe(
      paidMinutes("06:00", "14:30", DEFAULT_SCHEDULE_SETTINGS),
    );
  });
});
