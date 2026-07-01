import { describe, it, expect } from "vitest";
import {
  matchStaffName,
  validTime,
  validDate,
  sanitizeWeekly,
} from "@/lib/pro-shop/schedule-update";
import type { ProShopStaff } from "@/lib/pro-shop/types";

function staff(id: string, name: string): ProShopStaff {
  return {
    id,
    full_name: name,
    position: "rec_aid",
    default_group: "outside",
    availability_text: null,
    availability: {},
    flex: true,
    phone: null,
    is_active: true,
    sort_order: 0,
    notes: null,
  };
}

const roster = [staff("1", "Aniya Cole"), staff("2", "Devin Marsh"), staff("3", "Devon Ray")];

describe("matchStaffName", () => {
  it("matches a first name", () => {
    expect(matchStaffName("Aniya", roster)?.id).toBe("1");
  });
  it("matches full name case-insensitively", () => {
    expect(matchStaffName("devin marsh", roster)?.id).toBe("2");
  });
  it("returns null for no match", () => {
    expect(matchStaffName("Taylor", roster)).toBeNull();
    expect(matchStaffName("", roster)).toBeNull();
  });
});

describe("validTime", () => {
  it("pads single-digit hours", () => {
    expect(validTime("8:00")).toBe("08:00");
    expect(validTime("14:30")).toBe("14:30");
  });
  it("rejects junk and out-of-range", () => {
    expect(validTime("25:00")).toBeNull();
    expect(validTime("8am")).toBeNull();
    expect(validTime(830)).toBeNull();
  });
});

describe("validDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(validDate("2026-07-25")).toBe("2026-07-25");
  });
  it("rejects other formats", () => {
    expect(validDate("07/25/2026")).toBeNull();
    expect(validDate("2026-13-40")).toBeNull();
  });
});

describe("sanitizeWeekly", () => {
  it("keeps valid working days and fills the rest as off", () => {
    const raw = {
      mon: { works: true, group: "inside", start: "9:00", end: "17:00" },
      tue: { works: false },
    };
    const out = sanitizeWeekly(raw, "outside");
    expect(out?.mon).toEqual({ works: true, group: "inside", start: "09:00", end: "17:00" });
    expect(out?.tue).toEqual({ works: false });
    expect(out?.sun).toEqual({ works: false });
  });

  it("falls back to the given group when the AI omits it", () => {
    const out = sanitizeWeekly({ wed: { works: true, start: "08:00", end: "14:00" } }, "outside");
    expect(out?.wed.group).toBe("outside");
  });

  it("treats a 'works' day with bad/missing times as off, not invented hours", () => {
    const out = sanitizeWeekly(
      {
        mon: { works: true, start: "09:00", end: "17:00", group: "outside" },
        tue: { works: true, start: "nope" },
      },
      "outside",
    );
    expect(out?.tue).toEqual({ works: false });
    expect(out?.mon.works).toBe(true);
  });

  it("rejects (null) a pattern with no valid working day — never wipes a schedule", () => {
    expect(sanitizeWeekly({ mon: { works: true, start: "bad" } }, "outside")).toBeNull();
    expect(sanitizeWeekly({}, "outside")).toBeNull();
    expect(sanitizeWeekly(null, "outside")).toBeNull();
  });

  it("rejects end <= start", () => {
    const out = sanitizeWeekly({ mon: { works: true, start: "17:00", end: "09:00" } }, "inside");
    expect(out).toBeNull();
  });
});
