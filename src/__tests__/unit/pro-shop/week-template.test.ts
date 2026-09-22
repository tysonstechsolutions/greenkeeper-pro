/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  deriveWeekFromShifts,
  doubleBookings,
  missingSlots,
  moveHoursEdges,
  nextSunday,
  replacementCandidates,
  rulesWithHours,
  sanitizeHours,
  sanitizeSlots,
  slotsFromPatterns,
  stampFromWeek,
  versionFor,
  weeklyPaidByStaff,
} from "@/lib/pro-shop/week-template";
import { effectiveRulesForDay, sanitizeDayOverrides, withSlotRemoved } from "@/lib/pro-shop/day-overrides";
import { emptyWeekly, type CoverageRule, type ProShopStaff, type WeekSlot, type WeekTemplate } from "@/lib/pro-shop/types";

function person(id: string, extra: Partial<ProShopStaff> = {}): ProShopStaff {
  return {
    id, full_name: id, position: "rec_aid", default_group: "outside", availability_text: null,
    availability: { weekly: emptyWeekly() }, flex: false, phone: null, is_active: true,
    sort_order: 0, notes: null, area: "pro_shop", ...extra,
  };
}

const slot = (id: string, weekday: number, staff: string | null, start = "08:00", end = "14:00"): WeekSlot =>
  ({ id, weekday, group: "outside", staff_id: staff, start, end });

const week = (effective_from: string, slots: WeekSlot[], hours = {}): WeekTemplate =>
  ({ id: effective_from, area: "pro_shop", effective_from, slots, hours });

// 2026-10-04 is a Sunday; 10-05 Monday.
describe("versionFor", () => {
  const v1 = week("2026-10-01", []);
  const v2 = week("2026-11-01", []);
  it("uses the latest version starting on or before the date", () => {
    expect(versionFor("2026-09-30", [v1, v2])).toBeNull();
    expect(versionFor("2026-10-01", [v2, v1])).toBe(v1);
    expect(versionFor("2026-10-31", [v1, v2])).toBe(v1);
    expect(versionFor("2026-11-01", [v1, v2])).toBe(v2);
  });
});

describe("stampFromWeek", () => {
  const staff = [person("colin"), person("tony")];
  const versions = [week("2026-10-01", [slot("mon-am", 1, "tony"), slot("mon-pm", 1, "colin", "16:00", "19:00")])];

  it("puts the same people on the same weekday every week", () => {
    const rows = stampFromWeek({
      dates: ["2026-10-05", "2026-10-12"], versions, staff, timeOff: [], lockedShifts: [], overrides: {},
    });
    expect(rows.map((r) => `${r.shift_date} ${r.staff_id} ${r.start_time}`)).toEqual([
      "2026-10-05 tony 08:00", "2026-10-05 colin 16:00",
      "2026-10-12 tony 08:00", "2026-10-12 colin 16:00",
    ]);
    expect(rows[0].slot_id).toBe("mon-am");
  });

  it("leaves a slot off for time off, a removed slot, a pinned replacement, and leavers", () => {
    const rows = stampFromWeek({
      dates: ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"],
      versions,
      staff: [person("colin", { employed_through: "2026-10-20" }), person("tony")],
      timeOff: [{ id: "t", staff_id: "tony", start_date: "2026-10-05", end_date: "2026-10-05", reason: null }],
      lockedShifts: [{ staff_id: "marty", shift_date: "2026-10-12", slot_id: "mon-am" }],
      overrides: { "2026-10-19": { removed_slots: ["mon-am"] } },
    });
    expect(rows.map((r) => `${r.shift_date} ${r.staff_id}`)).toEqual([
      "2026-10-05 colin",            // tony off
      "2026-10-12 colin",            // marty covers tony's slot this once
      "2026-10-19 colin",            // tony's slot removed that day
      "2026-10-26 tony",             // colin has left
    ]);
  });

  it("switches to a later version on its start date and stamps nothing before the first", () => {
    const v2 = week("2026-10-10", [slot("mon-am", 1, "colin")]);
    const rows = stampFromWeek({
      dates: ["2026-09-28", "2026-10-05", "2026-10-12"],
      versions: [...versions, v2], staff, timeOff: [], lockedShifts: [], overrides: {},
    });
    expect(rows.map((r) => `${r.shift_date} ${r.staff_id}`)).toEqual([
      "2026-10-05 tony", "2026-10-05 colin", "2026-10-12 colin",
    ]);
  });

  it("never books one person twice in a day, and skips unassigned slots", () => {
    const v = week("2026-10-01", [slot("a", 1, "tony"), slot("b", 1, "tony", "15:00", "18:00"), slot("c", 1, null)]);
    const rows = stampFromWeek({ dates: ["2026-10-05"], versions: [v], staff, timeOff: [], lockedShifts: [], overrides: {} });
    expect(rows).toHaveLength(1);
    expect(doubleBookings(v.slots)).toEqual([{ weekday: 1, staff_id: "tony" }]);
  });
});

describe("missingSlots", () => {
  const versions = [week("2026-10-01", [slot("a", 1, "tony"), slot("b", 1, null)])];
  it("lists slots nobody is on that day, not removed ones", () => {
    expect(missingSlots("2026-10-05", versions, [], {}).map((s) => s.id)).toEqual(["a", "b"]);
    expect(missingSlots("2026-10-05", versions, [{ staff_id: "x", group: "outside", slot_id: "a" }], {})
      .map((s) => s.id)).toEqual(["b"]);
    // a pre-slot shift by the same person on the same job counts as the slot
    expect(missingSlots("2026-10-05", versions, [{ staff_id: "tony", group: "outside" }], {})
      .map((s) => s.id)).toEqual(["b"]);
    expect(missingSlots("2026-10-05", versions, [], { "2026-10-05": { removed_slots: ["a", "b"] } })).toEqual([]);
  });
});

describe("deriveWeekFromShifts", () => {
  const dates = ["2026-09-10", "2026-09-17", "2026-09-24"]; // three Thursdays
  const sh = (date: string, staff: string, start: string, end: string) =>
    ({ staff_id: staff, shift_date: date, group: "outside" as const, start_time: `${start}:00`, end_time: `${end}:00` });

  it("keeps a window worked on enough of the weekdays, given to whoever worked it most", () => {
    const slots = deriveWeekFromShifts([
      sh("2026-09-10", "tony", "08:00", "14:00"),
      sh("2026-09-17", "tony", "08:00", "14:00"),
      sh("2026-09-24", "colin", "08:00", "14:00"),
      sh("2026-09-10", "colin", "16:00", "19:30"), // once — 33%, dropped
      sh("2026-09-17", "colin", "16:00", "19:00"),
      sh("2026-09-24", "colin", "16:00", "19:00"),
    ], dates);
    expect(slots.map((s) => `${s.weekday} ${s.staff_id} ${s.start}-${s.end}`)).toEqual([
      "4 tony 08:00-14:00",
      "4 colin 16:00-19:00",
    ]);
  });

  it("gives each person one slot a day — their most common", () => {
    const slots = deriveWeekFromShifts([
      sh("2026-09-10", "mike", "07:00", "14:00"),
      sh("2026-09-17", "mike", "07:00", "14:00"),
      sh("2026-09-24", "mike", "07:00", "14:00"),
      sh("2026-09-17", "mike", "05:30", "14:30"),
      sh("2026-09-24", "mike", "05:30", "14:30"),
    ], dates);
    expect(slots.map((s) => `${s.staff_id} ${s.start}`)).toEqual(["mike 07:00"]);
  });
});

describe("slotsFromPatterns", () => {
  it("turns weekly patterns into slots", () => {
    const weekly = { ...emptyWeekly(), mon: { works: true, start: "05:00", end: "13:30" } };
    const slots = slotsFromPatterns([person("jorge", { default_group: "grounds", availability: { weekly } })]);
    expect(slots).toMatchObject([{ weekday: 1, group: "grounds", staff_id: "jorge", start: "05:00", end: "13:30" }]);
  });
});

describe("operating hours", () => {
  const rule = {
    id: "r", area: "pro_shop", weekday: 1, group: "inside", open_time: "06:30:00", close_time: "19:30:00",
    base_staff: 1, extra_staff: 0, extra_start: null,
  } as CoverageRule;
  const v = week("2026-10-01", [], { 1: { inside: { open: "07:00", close: "19:00" } } });

  it("the standard week's hours replace the rule's open/close, keeping the counts", () => {
    expect(rulesWithHours([rule], v)[0]).toMatchObject({ open_time: "07:00", close_time: "19:00", base_staff: 1 });
    expect(effectiveRulesForDay("2026-10-05", [rule], {}, [v])[0].open_time).toBe("07:00");
    // before the version starts, the rule stands
    expect(effectiveRulesForDay("2026-09-28", [rule], {}, [v])[0].open_time).toBe("06:30:00");
  });

  it("moving opening/closing moves the shifts that opened/closed with it", () => {
    const slots = [
      { ...slot("a", 1, "dj", "07:00", "12:30"), group: "inside" as const },
      { ...slot("b", 1, "marty", "12:30", "19:00"), group: "inside" as const },
      { ...slot("c", 2, "dj", "07:00", "13:00"), group: "inside" as const },
    ];
    const moved = moveHoursEdges(slots, 1, "inside", { open: "07:00", close: "19:00" }, { open: "08:00", close: "18:00" });
    expect(moved.map((s) => `${s.start}-${s.end}`)).toEqual(["08:00-12:30", "12:30-18:00", "07:00-13:00"]);
  });
});

describe("sanitizing", () => {
  it("drops malformed slots and hours", () => {
    expect(sanitizeSlots([
      { id: "ok", weekday: 1, group: "outside", staff_id: "x", start: "08:00:00", end: "14:00" },
      { id: "backwards", weekday: 1, group: "outside", start: "14:00", end: "08:00" },
      { id: "nogroup", weekday: 1, group: "lol", start: "08:00", end: "09:00" },
      { id: "ok", weekday: 2, group: "outside", start: "08:00", end: "09:00" }, // duplicate id
      "junk",
    ]).map((s) => s.id)).toEqual(["ok"]);
    expect(sanitizeHours({ 1: { inside: { open: "07:00", close: "19:00" } }, 9: {}, 2: { inside: { open: "x" } } }))
      .toEqual({ 1: { inside: { open: "07:00", close: "19:00" } } });
  });

  it("keeps removed slots on a day override", () => {
    const next = withSlotRemoved({}, "2026-10-05", "a", true);
    expect(sanitizeDayOverrides(next)).toEqual({ "2026-10-05": { removed_slots: ["a"] } });
    expect(withSlotRemoved(next, "2026-10-05", "a", false)).toEqual({});
  });
});

describe("replacementCandidates", () => {
  const avail = (start: string, end: string) => ({ weekly: { ...emptyWeekly(), mon: { works: true, start, end } } });
  const staff = [
    person("tony", { availability: avail("08:00", "14:00") }),
    person("colin", { availability: avail("12:00", "19:00") }),
    person("joe"),
    person("marty", { position: "golf_ops_assistant", default_group: "inside", availability: avail("06:00", "20:00") }),
    person("aniya", { position: "golf_ops_assistant", default_group: "inside", flex: true }),
    person("gone", { is_active: false }),
    person("off", { availability: avail("08:00", "14:00") }),
    person("busy", { availability: avail("08:00", "14:00") }),
  ];
  it("ranks free-for-the-whole-shift first and leaves out anyone who can't be picked", () => {
    const list = replacementCandidates({
      date: "2026-10-05", group: "outside", start: "08:00", end: "14:00", staff,
      shiftsOnDay: [{ staff_id: "busy" }],
      timeOff: [{ id: "t", staff_id: "off", start_date: "2026-10-05", end_date: "2026-10-05", reason: null }],
      excludeStaffId: "tony",
    });
    expect(list.map((c) => `${c.person.id}:${c.fit}`)).toEqual([
      "colin:partly", "joe:not-listed", "aniya:not-listed",
    ]);
  });
});

describe("helpers", () => {
  it("weekly paid hours and next Sunday", () => {
    const paid = weeklyPaidByStaff([slot("a", 1, "tony", "07:00", "15:30"), slot("b", 2, "tony")]);
    expect(paid.get("tony")).toBe(8 * 60 + 6 * 60);
    expect(nextSunday("2026-09-22")).toBe("2026-09-27");
    expect(nextSunday("2026-09-27")).toBe("2026-09-27");
  });
});
