import { describe, expect, it } from "vitest";
import { expandMonth } from "@/lib/pro-shop/schedule-engine";
import type { ProShopStaff } from "@/lib/pro-shop/types";

/** Works every weekday, 08:00–14:00 outside. */
function person(overrides: Partial<ProShopStaff> = {}): ProShopStaff {
  const day = { works: true, start: "08:00", end: "14:00", group: "outside" as const };
  return {
    id: "devin",
    full_name: "Devin Martinez",
    position: "rec_aid",
    default_group: "outside",
    availability_text: null,
    availability: { weekly: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day } },
    flex: false,
    phone: null,
    is_active: true,
    sort_order: 0,
    notes: null,
    employed_through: null,
    ...overrides,
  };
}

describe("employed_through stops the schedule after someone's last day", () => {
  it("schedules right up to and including the last day", () => {
    // August 2026, last day the 4th.
    const shifts = expandMonth([person({ employed_through: "2026-08-04" })], 2026, 7, []);
    const dates = shifts.map((s) => s.shift_date).sort();
    expect(dates[0]).toBe("2026-08-01");
    expect(dates[dates.length - 1]).toBe("2026-08-04");
    expect(dates).toHaveLength(4);
  });

  it("schedules nothing in a month that starts after the last day", () => {
    expect(expandMonth([person({ employed_through: "2026-08-04" })], 2026, 8, [])).toEqual([]);
  });

  it("leaves an open-ended employee alone", () => {
    // NULL means no end date — the normal case, and it must not regress.
    const shifts = expandMonth([person({ employed_through: null })], 2026, 8, []);
    expect(shifts).toHaveLength(30); // every day in September
  });

  it("treats a missing field as open-ended", () => {
    const legacy = person();
    delete (legacy as Partial<ProShopStaff>).employed_through;
    expect(expandMonth([legacy], 2026, 8, [])).toHaveLength(30);
  });

  it("still honours is_active regardless of the end date", () => {
    expect(expandMonth([person({ is_active: false, employed_through: "2027-01-01" })], 2026, 7, []))
      .toEqual([]);
  });

  it("does not affect anyone else's shifts", () => {
    const leaving = person({ id: "devin", employed_through: "2026-08-04" });
    const staying = person({ id: "tony", full_name: "Tony Morales", employed_through: null });
    const shifts = expandMonth([leaving, staying], 2026, 7, []);
    expect(shifts.filter((s) => s.staff_id === "devin")).toHaveLength(4);
    expect(shifts.filter((s) => s.staff_id === "tony")).toHaveLength(31);
  });
});
