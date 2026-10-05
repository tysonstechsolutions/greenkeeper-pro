import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const rest = vi.hoisted(() => ({
  directSelectList: vi.fn(),
  directRpc: vi.fn(),
  directInsertRow: vi.fn(),
  getCachedUserId: vi.fn(),
}));
const api = vi.hoisted(() => ({ callApi: vi.fn() }));

vi.mock("@/lib/supabase/rest", () => rest);
vi.mock("@/lib/api/client", () => api);

import { HrRosterImportSheet } from "@/components/features/staff/hr-roster-import-sheet";

const PASTE = [
  "Personnel subarea\tEmployee Name\tPosition\tEmployment Status\tEmployee subgroup\tActivity Start Date\tPay Plan, Series, Grade\tCost ctr\tCost Center\tPersonnel area\tStart Date\tSupervisor Position",
  "NS GREAT LAKES\tSKINNER DAVID JAMES\tGolf Operations Asst\tActive\tFlex Continuing\t08/15/2024\tNF 0303 02\t20087\tGLK VM GOLF PROGRAM\tMWR NAVY REGION MID-ATLANTIC\t08/15/2024\tNo",
  "NS GREAT LAKES\tVILLALOBOS RUBEN MABUEL\tFood Service Worker\tActive\tFlex Continuing\t09/15/2025\tNA 7408 03\t20091\tGLK BUCKLEY'S F&B\tMWR NAVY REGION MID-ATLANTIC\t09/15/2025\tNo",
  "NS GREAT LAKES\tSORDYL MARTIN E\tGolf Operations Asst\tActive\tFlex Continuing\t04/29/2022\tNF 0303 02\t20087\tGLK VM GOLF PROGRAM\tMWR NAVY REGION MID-ATLANTIC\t10/22/2023\tNo",
].join("\n");

const STAFF = [
  {
    id: "p-dj",
    full_name: "DJ Skinner",
    is_active: true,
    hire_date: null,
    personnel_details: { hourly_rate: "17.25", position_title: "Golf Operations Assistant" },
  },
  { id: "p-marty", full_name: "Marty Sordyl", is_active: false, hire_date: "2022-04-29", personnel_details: null },
];

describe("HrRosterImportSheet", () => {
  beforeEach(() => {
    rest.directSelectList.mockReset().mockResolvedValue([]);
    rest.directRpc.mockReset().mockResolvedValue(null);
    rest.directInsertRow.mockReset().mockResolvedValue({ token: "tok-1" });
    rest.getCachedUserId.mockReset().mockReturnValue("mgr-1");
    api.callApi.mockReset().mockResolvedValue({ success: true, user: { id: "new-ruben", name: "Ruben Villalobos", role: "seasonal" } });
  });

  it("previews, then updates matches and creates the rest", async () => {
    const onDone = vi.fn();
    render(<HrRosterImportSheet open onOpenChange={() => {}} staff={STAFF} onDone={onDone} />);

    fireEvent.change(screen.getByLabelText(/paste the rows/i), { target: { value: PASTE } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("2 to update · 1 to add · 0 skipped")).toBeTruthy();
    expect(screen.getByText("Position: Golf Operations Assistant → Golf Operations Asst")).toBeTruthy();
    expect(screen.getByText("Status: Inactive → Active")).toBeTruthy();
    expect(screen.getByText(/Creates Ruben Villalobos/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply 3" }));
    await waitFor(() => expect(screen.getByText("All 3 saved.")).toBeTruthy());

    // DJ: personnel updated, hourly rate kept, hire date from HR.
    const calls = rest.directRpc.mock.calls.map((c) => c[1]);
    const dj = calls.find((c) => c.p_employee_id === "p-dj");
    expect(dj.p_directory).toEqual({});
    expect(dj.p_personnel.hire_date).toBe("2024-08-15");
    expect(dj.p_personnel.personnel_details).toMatchObject({
      name_first: "David",
      name_middle: "James",
      name_last: "Skinner",
      pay_plan: "NF",
      occ_series: "0303",
      pay_band: "02",
      hourly_rate: "17.25",
      work_schedule: "FLEX",
    });

    // Marty: reactivated because HR lists him as Active.
    const marty = calls.find((c) => c.p_employee_id === "p-marty");
    expect(marty.p_directory).toEqual({ is_active: true });

    // Ruben: created through invite + pin-signup, then placed in F&B.
    expect(rest.directInsertRow).toHaveBeenCalledWith(
      "invites",
      { role: "seasonal", email: null, created_by: "mgr-1" },
      expect.any(String),
    );
    expect(api.callApi.mock.calls[0][1].body.fullName).toBe("Ruben Villalobos");
    const ruben = calls.find((c) => c.p_employee_id === "new-ruben");
    expect(ruben.p_directory).toEqual({ department: "food_and_beverage", role_group: "restaurant_staff" });
    expect(ruben.p_personnel.personnel_details).toMatchObject({ pay_plan: "NA", occ_series: "7408", pay_band: "03", cost_center: "20091" });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("retries a failed save without creating the person twice", async () => {
    rest.directRpc.mockImplementation(async (_fn: string, args: { p_employee_id: string }) => {
      if (args.p_employee_id === "new-ruben" && rest.directRpc.mock.calls.filter((c) => c[1].p_employee_id === "new-ruben").length === 1) {
        throw new Error("network down");
      }
      return null;
    });
    render(<HrRosterImportSheet open onOpenChange={() => {}} staff={STAFF} />);
    fireEvent.change(screen.getByLabelText(/paste the rows/i), { target: { value: PASTE } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply 3" }));

    expect(await screen.findByText("network down")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry 1 failed" }));
    await waitFor(() => expect(screen.getByText("All 3 saved.")).toBeTruthy());
    expect(api.callApi).toHaveBeenCalledTimes(1);
    // DJ and Marty were saved once each, Ruben twice (fail + retry).
    expect(rest.directRpc).toHaveBeenCalledTimes(4);
  });

  it("uses the schedule's name for a new person who is on the pro shop schedule", async () => {
    rest.directSelectList.mockResolvedValue([{ id: "s1", full_name: "Rube Villalobos" }]);
    render(<HrRosterImportSheet open onOpenChange={() => {}} staff={STAFF} />);
    fireEvent.change(screen.getByLabelText(/paste the rows/i), { target: { value: PASTE } });
    await waitFor(() => expect(rest.directSelectList).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/Creates Rube Villalobos/)).toBeTruthy();
  });
});
