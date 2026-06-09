import { describe, it, expect } from "vitest";
import {
  inSeason,
  seasonBounds,
  clampToSeasonStart,
  weekdayOf,
  weekOfMonthOf,
  nthWeekdayOfMonth,
  weeklyOccurrences,
  monthlyOccurrences,
  occurrencesFor,
  defaultHorizon,
} from "@/lib/utils/season";

describe("season window", () => {
  it("seasonBounds is Apr 1 – Nov 1", () => {
    expect(seasonBounds(2026)).toEqual({ start: "2026-04-01", end: "2026-11-01" });
  });

  it("inSeason is inclusive of both ends and excludes the off-season", () => {
    expect(inSeason("2026-04-01")).toBe(true); // opener
    expect(inSeason("2026-03-31")).toBe(false); // day before
    expect(inSeason("2026-11-01")).toBe(true); // closer
    expect(inSeason("2026-11-02")).toBe(false); // day after
    expect(inSeason("2026-07-15")).toBe(true); // midsummer
    expect(inSeason("2026-01-10")).toBe(false); // deep winter
    expect(inSeason("2026-12-25")).toBe(false);
  });
});

describe("clampToSeasonStart", () => {
  it("leaves in-season dates untouched", () => {
    expect(clampToSeasonStart("2026-06-09")).toBe("2026-06-09");
    expect(clampToSeasonStart("2026-11-01")).toBe("2026-11-01");
  });
  it("moves a pre-season date to this year's April 1", () => {
    expect(clampToSeasonStart("2026-01-15")).toBe("2026-04-01");
  });
  it("moves a post-season date to next year's April 1", () => {
    expect(clampToSeasonStart("2026-12-20")).toBe("2027-04-01");
    expect(clampToSeasonStart("2026-11-02")).toBe("2027-04-01");
  });
});

describe("weekday helpers", () => {
  it("weekdayOf matches the calendar (2026-06-09 is a Tuesday)", () => {
    expect(weekdayOf("2026-06-09")).toBe(2);
    expect(weekdayOf("2026-06-07")).toBe(0); // Sunday
  });
  it("weekOfMonthOf is the nth occurrence of that weekday", () => {
    expect(weekOfMonthOf("2026-06-02")).toBe(1); // 1st Tuesday
    expect(weekOfMonthOf("2026-06-09")).toBe(2); // 2nd Tuesday
    expect(weekOfMonthOf("2026-06-30")).toBe(5); // 5th Tuesday
  });
});

describe("nthWeekdayOfMonth", () => {
  it("finds the 1st and 2nd Tuesday of June 2026", () => {
    expect(nthWeekdayOfMonth(2026, 6, 2, 1)).toBe("2026-06-02");
    expect(nthWeekdayOfMonth(2026, 6, 2, 2)).toBe("2026-06-09");
  });
  it("returns null when the nth weekday doesn't exist", () => {
    // Feb 2026 has 28 days — no 5th Sunday.
    expect(nthWeekdayOfMonth(2026, 2, 0, 5)).toBeNull();
  });
});

describe("weeklyOccurrences", () => {
  it("every result shares the anchor's weekday and stays in season", () => {
    const occ = weeklyOccurrences("2026-06-09", "2026-12-31");
    expect(occ[0]).toBe("2026-06-09");
    expect(occ.every((d) => weekdayOf(d) === 2)).toBe(true);
    expect(occ.every((d) => inSeason(d))).toBe(true);
    // Nothing past Nov 1 this season.
    expect(occ[occ.length - 1]).toBe("2026-10-27");
  });

  it("skips the off-season and resumes the next April", () => {
    const occ = weeklyOccurrences("2026-10-20", "2027-05-31");
    expect(occ).toContain("2026-10-20");
    expect(occ).toContain("2026-10-27");
    // Winter gap: no Nov 2026 – Mar 2027 dates.
    expect(occ.some((d) => d > "2026-11-01" && d < "2027-04-01")).toBe(false);
    // Resumes on the first Tuesday in season 2027.
    expect(occ).toContain("2027-04-06");
    expect(occ.every((d) => weekdayOf(d) === 2 && inSeason(d))).toBe(true);
  });

  it("returns empty for an inverted range", () => {
    expect(weeklyOccurrences("2026-06-09", "2026-06-01")).toEqual([]);
  });
});

describe("monthlyOccurrences", () => {
  it("emits the nth-weekday slot each in-season month, skipping winter", () => {
    // 2nd Tuesday, from June 2026 through June 2027.
    const occ = monthlyOccurrences("2026-06-09", 2, 2, "2027-06-30");
    expect(occ).toEqual([
      "2026-06-09",
      "2026-07-14",
      "2026-08-11",
      "2026-09-08",
      "2026-10-13",
      // Nov 10 is past Nov 1 → out; Dec–Mar off-season → out.
      "2027-04-13",
      "2027-05-11",
      "2027-06-08",
    ]);
  });
});

describe("occurrencesFor (tier dispatch)", () => {
  it("daily and weekly both repeat on the anchor weekday", () => {
    const daily = occurrencesFor("2026-06-09", "daily", "2026-11-01");
    const weekly = occurrencesFor("2026-06-09", "weekly", "2026-11-01");
    expect(daily).toEqual(weekly);
    expect(daily.every((d) => weekdayOf(d) === 2)).toBe(true);
  });

  it("monthly uses the anchor's nth-weekday slot", () => {
    const occ = occurrencesFor("2026-06-09", "monthly", "2026-09-30");
    expect(occ).toEqual(["2026-06-09", "2026-07-14", "2026-08-11", "2026-09-08"]);
  });

  it("seasonal and projects are one-off (the dropped day only, even off-season)", () => {
    expect(occurrencesFor("2026-12-25", "seasonal", "2027-12-31")).toEqual(["2026-12-25"]);
    expect(occurrencesFor("2026-12-25", "projects", "2027-12-31")).toEqual(["2026-12-25"]);
  });

  it("a repeating job dropped in the off-season resumes next season on the same weekday", () => {
    const occ = occurrencesFor("2026-01-10", "weekly", "2026-05-31");
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0] >= "2026-04-01").toBe(true);
    // Weekday preserved from the original drop (not snapped to Apr 1's weekday).
    expect(occ.every((d) => weekdayOf(d) === weekdayOf("2026-01-10"))).toBe(true);
    expect(occ.every((d) => inSeason(d))).toBe(true);
  });
});

describe("defaultHorizon", () => {
  it("is 365 days past the anchor", () => {
    expect(defaultHorizon("2026-06-09")).toBe("2027-06-09");
  });
});
