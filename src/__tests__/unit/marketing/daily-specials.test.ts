import { describe, expect, it } from "vitest";
import {
  WEEKLY_SPECIALS,
  specialForDay,
  buildSpecialFlyerHtml,
} from "@/lib/marketing/daily-specials";

describe("daily specials", () => {
  it("covers all seven days with complete content", () => {
    expect(WEEKLY_SPECIALS.map((s) => s.day)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    for (const s of WEEKLY_SPECIALS) {
      expect(s.theme).toBeTruthy();
      expect(s.rationale).toBeTruthy();
      expect(s.audience).toBeTruthy();
    }
  });

  it("keeps Hot Dog Monday as the proven anchor", () => {
    const monday = specialForDay("monday");
    expect(monday?.theme).toBe("Hot Dog Monday");
    expect(monday?.proven).toBe(true);
  });

  it("ties Wednesday and Thursday to league nights", () => {
    expect(specialForDay("wednesday")?.rationale.toLowerCase()).toContain("league");
    expect(specialForDay("thursday")?.rationale.toLowerCase()).toContain("league");
  });

  it("looks up case-insensitively and returns null for unknown", () => {
    expect(specialForDay("FRIDAY")?.theme).toBe("Fish Fry Friday");
    expect(specialForDay("someday")).toBeNull();
  });

  it("builds a printable flyer with the theme and course name", () => {
    const flyer = buildSpecialFlyerHtml(specialForDay("tuesday")!);
    expect(flyer).toContain("<!doctype html>");
    expect(flyer).toContain("Taco Tuesday");
    expect(flyer).toContain("Veterans Memorial Golf Course");
  });
});
