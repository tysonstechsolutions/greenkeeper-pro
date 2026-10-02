import { describe, expect, it } from "vitest";
import { calc889ExpirationDate, section889Status, toIsoDate } from "@/lib/section-889";

describe("889 expiration: one year from the date signed", () => {
  it("expires the same day the next year", () => {
    expect(calc889ExpirationDate("2025-11-15")).toBe("2026-11-15");
    expect(calc889ExpirationDate("2026-08-05")).toBe("2027-08-05");
    // The old fiscal-year rule would have said 2026-10-01 for both of these.
    expect(calc889ExpirationDate("2025-10-02")).toBe("2026-10-02");
    expect(calc889ExpirationDate("2026-09-30")).toBe("2027-09-30");
  });

  it("matches the database for a leap-day signature", () => {
    expect(calc889ExpirationDate("2028-02-29")).toBe("2029-02-28");
  });

  it("accepts a Date and formats local dates", () => {
    expect(calc889ExpirationDate(new Date(2026, 0, 31, 23, 30))).toBe("2027-01-31");
    expect(toIsoDate(new Date(2026, 2, 3, 22, 30))).toBe("2026-03-03");
    expect(() => calc889ExpirationDate("not a date")).toThrow();
  });
});

describe("889 status", () => {
  const on = (exp: string | null, path: string | null = "889-forms/x.pdf") => ({
    section_889_path: path,
    section_889_expiration_date: exp,
  });
  it("is missing, expired, expiring soon, or good", () => {
    expect(section889Status(on("2027-01-01", null), "2026-10-02")).toBe("missing");
    expect(section889Status(on("2026-10-01"), "2026-10-02")).toBe("expired");
    expect(section889Status(on("2026-10-02"), "2026-10-02")).toBe("expiring_soon");
    expect(section889Status(on("2026-11-01"), "2026-10-02")).toBe("expiring_soon");
    expect(section889Status(on("2026-11-02"), "2026-10-02")).toBe("compliant");
    expect(section889Status(on(null), "2026-10-02")).toBe("compliant");
  });
});
