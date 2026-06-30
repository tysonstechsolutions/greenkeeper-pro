import { describe, it, expect } from "vitest";
import { scheduleSteps, partitionDayView } from "@/lib/my-day/schedule";

describe("scheduleSteps", () => {
  it("puts every step in the backlog (no date) when there's no deadline", () => {
    const out = scheduleSteps(["a", "b", "c"], {
      today: "2026-07-02",
      deadline: null,
      bufferDays: 2,
    });
    expect(out.map((s) => s.target_date)).toEqual([null, null, null]);
    expect(out.map((s) => s.sort_order)).toEqual([0, 1, 2]);
  });

  it("starts today and spaces one step per day when there's room before the buffered deadline", () => {
    const out = scheduleSteps(["a", "b", "c"], {
      today: "2026-07-02",
      deadline: "2026-07-20", // buffer 2 -> finish by 07-18; plenty of room
      bufferDays: 2,
    });
    expect(out.map((s) => s.target_date)).toEqual(["2026-07-02", "2026-07-03", "2026-07-04"]);
  });

  it("compresses into the window when there isn't room for one-per-day", () => {
    const out = scheduleSteps(["a", "b", "c"], {
      today: "2026-07-02",
      deadline: "2026-07-05", // buffer 2 -> finish by 07-03 (only 2 days)
      bufferDays: 2,
    });
    const dates = out.map((s) => s.target_date);
    // Everything lands on/before the buffered deadline (07-03), starting today.
    expect(dates[0]).toBe("2026-07-02");
    for (const d of dates) expect(d! <= "2026-07-03").toBe(true);
    expect(dates).toContain("2026-07-03");
  });

  it("schedules everything today when the deadline is already inside the buffer", () => {
    const out = scheduleSteps(["a", "b"], {
      today: "2026-07-02",
      deadline: "2026-07-02",
      bufferDays: 2,
    });
    expect(out.map((s) => s.target_date)).toEqual(["2026-07-02", "2026-07-02"]);
  });
});

describe("partitionDayView", () => {
  const steps = [
    { id: "ov", target_date: "2026-06-30", done: false }, // overdue
    { id: "td", target_date: "2026-07-02", done: false }, // today
    { id: "bk", target_date: null, done: false }, // backlog
    { id: "up", target_date: "2026-07-10", done: false }, // upcoming
    { id: "dn", target_date: "2026-07-02", done: true }, // done -> excluded
  ];
  const view = partitionDayView(steps, "2026-07-02");

  it("rolls undone past-due steps into overdue", () => {
    expect(view.overdue.map((s) => s.id)).toEqual(["ov"]);
  });
  it("puts steps dated today into today", () => {
    expect(view.today.map((s) => s.id)).toEqual(["td"]);
  });
  it("keeps date-less steps in the backlog", () => {
    expect(view.backlog.map((s) => s.id)).toEqual(["bk"]);
  });
  it("holds future-dated steps as upcoming", () => {
    expect(view.upcoming.map((s) => s.id)).toEqual(["up"]);
  });
  it("excludes done steps from every bucket", () => {
    const all = [...view.overdue, ...view.today, ...view.backlog, ...view.upcoming];
    expect(all.find((s) => s.id === "dn")).toBeUndefined();
  });
});
