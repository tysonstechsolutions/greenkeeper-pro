import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/staff/sf52",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const rest = vi.hoisted(() => ({
  directSelectList: vi.fn(),
  directSelectRow: vi.fn(),
  directRpc: vi.fn(),
  directInsertRow: vi.fn(),
  getCachedUserId: vi.fn(() => "gm1"),
}));
vi.mock("@/lib/supabase/rest", () => rest);
vi.mock("@/lib/api/client", () => ({ callApi: vi.fn() }));
vi.mock("@/lib/reports/sf52-report", () => ({
  generateSf52Report: vi.fn(async () => ({ blob: new Blob(["pdf"]) })),
  sf52Filename: () => "SF52.pdf",
}));
vi.mock("@/lib/utils/download-blob", () => ({ saveBlobToDevice: vi.fn(async () => undefined) }));
vi.mock("@/lib/documents/saved-documents", () => ({
  saveCreatedDocument: vi.fn(async () => "doc1"),
  getCreatedDocument: vi.fn(async () => null),
  updateCreatedDocument: vi.fn(async () => undefined),
}));

let profiles: { id: string; full_name: string; is_active: boolean }[];

beforeEach(() => {
  profiles = [
    { id: "p-joe", full_name: "Joe Sordyl", is_active: true },
    { id: "p-left", full_name: "Old Hand", is_active: false },
  ];
  rest.directRpc.mockReset().mockImplementation(async (fn: string, args: { p_employee_id?: string; p_directory?: { is_active?: boolean } }) => {
    if (fn === "update_staff_profile" && args.p_directory?.is_active === false) {
      profiles = profiles.map((p) => (p.id === args.p_employee_id ? { ...p, is_active: false } : p));
    }
    return null;
  });
  rest.directSelectList.mockReset().mockImplementation(async (table: string) => {
    if (table === "profiles") return profiles;
    if (table === "pro_shop_staff") return [{ id: "s1", full_name: "Joe Sordyl", profile_id: "p-joe" }];
    return [];
  });
  rest.directSelectRow.mockReset().mockImplementation(async (table: string) => {
    if (table === "profiles") return { id: "p-joe", full_name: "Joe Sordyl" };
    return { employee_id: "p-joe", personnel_details: { name_last: "Sordyl", name_first: "Joseph", pay_plan: "NF" } };
  });
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/sf52/page");
  return render(<Page />);
}

describe("resignation SF-52", () => {
  it("lists people who left separately, and takes the resigning employee off the active list", async () => {
    await renderPage();
    const employee = (await waitFor(() => document.getElementById("employee") as HTMLSelectElement));
    await waitFor(() => expect(within(employee).getByRole("option", { name: "Joe Sordyl" })).toBeTruthy());
    const leftGroup = employee.querySelector('optgroup[label="No longer active"]');
    expect(leftGroup?.textContent).toBe("Old Hand");

    fireEvent.change(screen.getByLabelText("Personnel action"), { target: { value: "resignation" } });
    fireEvent.change(employee, { target: { value: "p-joe" } });
    const date = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-10-01" } });

    fireEvent.click(screen.getByRole("button", { name: /Generate & Download SF-52/ }));
    expect(await screen.findByText(/Joe Sordyl was taken off the active staff list \(last day 10\/01\/26\)/)).toBeTruthy();
    expect(screen.getByText(/pro shop schedule stops after that day too/)).toBeTruthy();

    // Joe now shows under "No longer active" (still pickable for the Recruitment SF-52).
    await waitFor(() =>
      expect(employee.querySelector('optgroup[label="No longer active"]')?.textContent).toContain("Joe Sordyl"),
    );
  });

  it("does nothing to the staff list for other actions", async () => {
    await renderPage();
    const employee = (await waitFor(() => document.getElementById("employee") as HTMLSelectElement));
    await waitFor(() => expect(within(employee).getByRole("option", { name: "Joe Sordyl" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Personnel action"), { target: { value: "pay_increase" } });
    fireEvent.change(employee, { target: { value: "p-joe" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download SF-52/ }));
    expect(await screen.findByText(/SF-52 downloaded and saved/)).toBeTruthy();
    expect(rest.directRpc).not.toHaveBeenCalledWith("update_staff_profile", expect.anything(), expect.anything());
  });
});
