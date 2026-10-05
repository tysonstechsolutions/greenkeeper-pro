// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rest = vi.hoisted(() => ({
  directRpc: vi.fn(),
  directSelectList: vi.fn(),
  directSelectRow: vi.fn(),
  directInsertRow: vi.fn(),
  getCachedUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/rest", () => rest);
vi.mock("@/lib/api/client", () => ({ callApi: vi.fn() }));

import {
  applyResignation,
  clearPastSeparation,
  deactivateDepartedStaff,
  findScheduleRow,
  hasLeft,
  resetDepartedStaffSweep,
  resignationLastDay,
  withSeparationDate,
} from "@/lib/staff/separation";

beforeEach(() => {
  rest.directRpc.mockReset().mockResolvedValue(null);
  rest.directSelectList.mockReset().mockResolvedValue([]);
  rest.directSelectRow.mockReset().mockResolvedValue(null);
  resetDepartedStaffSweep();
});

describe("rules", () => {
  it("someone has left the day after their last day", () => {
    expect(hasLeft("2026-10-04", "2026-10-05")).toBe(true);
    expect(hasLeft("2026-10-05", "2026-10-05")).toBe(false); // still working today
    expect(hasLeft("2026-10-20", "2026-10-05")).toBe(false);
    expect(hasLeft(null, "2026-10-05")).toBe(false);
    expect(hasLeft("10/04/26", "2026-10-05")).toBe(false);
  });

  it("the last day is the effective date, or yesterday when none was entered", () => {
    expect(resignationLastDay("2026-10-20", "2026-10-05")).toBe("2026-10-20");
    expect(resignationLastDay("", "2026-10-05")).toBe("2026-10-04");
    expect(resignationLastDay("", "2026-03-01")).toBe("2026-02-28");
  });

  it("keeps all other personnel details", () => {
    expect(withSeparationDate({ pay_plan: "NF", hourly_rate: "17.25" }, "2026-10-20")).toEqual({
      pay_plan: "NF",
      hourly_rate: "17.25",
      separation_date: "2026-10-20",
    });
    expect(withSeparationDate(null, "2026-10-20")).toEqual({ separation_date: "2026-10-20" });
  });

  it("finds the schedule row by link first, then by an unambiguous name", () => {
    const rows = [
      { id: "s1", full_name: "Joe Sordyl", profile_id: null },
      { id: "s2", full_name: "Marty Sordyl", profile_id: "p-marty" },
      { id: "s3", full_name: "Sam Lee" },
      { id: "s4", full_name: "sam  lee" },
    ];
    expect(findScheduleRow(rows, "p-marty", "Martin Sordyl")?.id).toBe("s2");
    expect(findScheduleRow(rows, "p-joe", "Joe Sordyl")?.id).toBe("s1");
    expect(findScheduleRow(rows, "p-sam", "Sam Lee")).toBeNull(); // two matches: don't guess
    expect(findScheduleRow(rows, "p-x", "Nobody")).toBeNull();
  });
});

describe("applyResignation", () => {
  it("takes someone off the active list now when their last day has passed", async () => {
    rest.directSelectRow.mockResolvedValue({ personnel_details: { pay_plan: "NF", hourly_rate: "17.25" } });
    rest.directSelectList.mockResolvedValue([{ id: "s1", full_name: "Joe Sordyl", profile_id: "p-joe" }]);
    const result = await applyResignation({
      employeeId: "p-joe",
      fullName: "Joe Sordyl",
      effectiveDate: "2026-10-01",
      todayIso: "2026-10-05",
    });
    expect(result).toEqual({ lastDay: "2026-10-01", removedNow: true, scheduleUpdated: true });
    expect(rest.directRpc).toHaveBeenCalledWith(
      "update_staff_profile",
      {
        p_employee_id: "p-joe",
        p_directory: { is_active: false },
        p_personnel: { personnel_details: { pay_plan: "NF", hourly_rate: "17.25", separation_date: "2026-10-01" } },
      },
      expect.any(String),
    );
    expect(rest.directRpc).toHaveBeenCalledWith(
      "save_pro_shop_staff",
      { p_staff_id: "s1", p_values: { employed_through: "2026-10-01" }, p_reason: "Resignation SF-52 saved" },
      expect.any(String),
    );
  });

  it("keeps them active until a future last day", async () => {
    const result = await applyResignation({
      employeeId: "p1",
      fullName: "Pat Doe",
      effectiveDate: "2026-10-20",
      todayIso: "2026-10-05",
    });
    expect(result).toEqual({ lastDay: "2026-10-20", removedNow: false, scheduleUpdated: false });
    expect(rest.directRpc.mock.calls[0][1].p_directory).toEqual({});
    expect(rest.directRpc.mock.calls[0][1].p_personnel.personnel_details).toEqual({ separation_date: "2026-10-20" });
  });

  it("still succeeds when the schedule can't be updated", async () => {
    rest.directSelectList.mockRejectedValue(new Error("no access"));
    const result = await applyResignation({ employeeId: "p1", fullName: "Pat", effectiveDate: "2026-10-01", todayIso: "2026-10-05" });
    expect(result.removedNow).toBe(true);
    expect(result.scheduleUpdated).toBe(false);
  });

  it("reports a failure to update the staff record", async () => {
    rest.directRpc.mockRejectedValue(new Error("Manager access required"));
    await expect(
      applyResignation({ employeeId: "p1", fullName: "Pat", effectiveDate: "2026-10-01", todayIso: "2026-10-05" }),
    ).rejects.toThrow("Manager access required");
  });
});

describe("deactivateDepartedStaff", () => {
  it("marks inactive only people still active whose last day has passed, once a day", async () => {
    rest.directSelectList.mockImplementation(async (table: string, opts: { filters?: string[] }) => {
      if (table === "staff_personnel_private") {
        expect(opts.filters).toEqual(["personnel_details->>separation_date=lt.2026-10-05"]);
        return [
          { employee_id: "gone", personnel_details: { separation_date: "2026-10-01" } },
          { employee_id: "already", personnel_details: { separation_date: "2026-09-01" } },
        ];
      }
      expect(opts.filters).toEqual(["id=in.(gone,already)", "is_active=eq.true"]);
      return [{ id: "gone" }];
    });
    expect(await deactivateDepartedStaff("2026-10-05")).toBe(1);
    expect(rest.directRpc).toHaveBeenCalledTimes(1);
    expect(rest.directRpc).toHaveBeenCalledWith(
      "update_staff_profile",
      { p_employee_id: "gone", p_directory: { is_active: false }, p_personnel: {} },
      expect.any(String),
    );
    // Same day again: no second round of queries.
    expect(await deactivateDepartedStaff("2026-10-05")).toBe(0);
    expect(rest.directSelectList).toHaveBeenCalledTimes(2);
  });

  it("never throws, and tries again after a failure", async () => {
    rest.directSelectList.mockRejectedValueOnce(new Error("offline"));
    expect(await deactivateDepartedStaff("2026-10-05")).toBe(0);
    expect(await deactivateDepartedStaff("2026-10-05")).toBe(0);
    expect(rest.directSelectList).toHaveBeenCalledTimes(2);
  });
});

describe("clearPastSeparation (rehire)", () => {
  it("drops a last day that has passed and keeps the rest", async () => {
    rest.directSelectRow.mockResolvedValue({ personnel_details: { pay_plan: "NF", separation_date: "2026-09-01" } });
    expect(await clearPastSeparation("p1", "2026-10-05")).toBe(true);
    expect(rest.directRpc).toHaveBeenCalledWith(
      "update_staff_profile",
      { p_employee_id: "p1", p_directory: {}, p_personnel: { personnel_details: { pay_plan: "NF" } } },
      expect.any(String),
    );
  });

  it("leaves a future last day and records without one alone", async () => {
    rest.directSelectRow.mockResolvedValueOnce({ personnel_details: { separation_date: "2026-10-20" } });
    expect(await clearPastSeparation("p1", "2026-10-05")).toBe(false);
    rest.directSelectRow.mockResolvedValueOnce({ personnel_details: { pay_plan: "NF" } });
    expect(await clearPastSeparation("p1", "2026-10-05")).toBe(false);
    rest.directSelectRow.mockResolvedValueOnce(null);
    expect(await clearPastSeparation("p1", "2026-10-05")).toBe(false);
    expect(rest.directRpc).not.toHaveBeenCalled();
  });
});
