import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "../utils/test-utils";

const nav = vi.hoisted(() => ({ search: "fy=2026", replace: vi.fn() }));
const rpc = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown }[], reload: vi.fn() }));
vi.mock("@/lib/supabase/rest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/rest")>("@/lib/supabase/rest");
  return {
    ...actual,
    directRpc: async (fn: string, args: unknown) => {
      rpc.calls.push({ fn, args });
      return null;
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/staff/evaluations",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "gm1", full_name: "Tyson Bruce", role: "gm" } }),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return {
    ...actual,
    RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useRoleAccess: () => ({ hasRole: () => true }),
  };
});
vi.mock("@/lib/utils/date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/date")>("@/lib/utils/date");
  return { ...actual, todayLocal: () => "2026-11-02" };
});

const profile = (id: string, full_name: string) => ({ id, full_name, role: "crew", is_active: true, supervisor_id: null });
const yearEnd = (id: string, name: string, progress: string, due: string | null) => ({
  profile: profile(id, name),
  evaluation: null,
  progress,
  dueDate: "2026-10-31",
  due,
});

vi.mock("@/lib/evaluations/use-evaluations", () => ({
  useEvaluationRoster: () => ({
    entries: [
      yearEnd("old", "Oscar Gonzalez", "not_started", "overdue"),
      yearEnd("ruben", "Ruben Villalobos", "in_progress", "overdue"),
      yearEnd("done", "Done Person", "final", null),
    ],
    ninetyDay: [
      { profile: profile("colin", "Colin O'Neill"), hireDate: "2026-06-01", dueDate: "2026-08-30", due: "overdue", evaluation: null, progress: "not_started" },
      { profile: profile("new", "New Hire"), hireDate: "2026-08-04", dueDate: "2026-11-02", due: "due_soon", evaluation: null, progress: "not_started" },
    ],
    notDue: [{ profile: profile("late", "Late Hire"), hireDate: "2026-07-20" }],
    departing: [{ profile: profile("quit", "Quinn Leaving"), action: "resignation", uploadedAt: "2026-10-20T15:00:00Z" }],
    missingHireDate: [profile("ruben", "Ruben Villalobos")],
    loading: false,
    error: null,
    reload: rpc.reload,
  }),
}));

beforeEach(() => {
  nav.search = "fy=2026";
  nav.replace.mockClear();
  rpc.calls = [];
  rpc.reload.mockClear();
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/evaluations/page");
  return render(<Page />);
}

describe("evaluations page", () => {
  it("lists people leaving (resignation or transfer SF-52) and links to SF-52 files", async () => {
    await renderPage();
    const leaving = screen.getByLabelText("Leaving");
    expect(leaving).toHaveTextContent("Leaving: not evaluated (1)");
    expect(leaving).toHaveTextContent("Quinn Leaving");
    expect(leaving).toHaveTextContent("resignation SF-52 filed Oct 20, 2026");
    expect(screen.getByRole("link", { name: /Upload SF-52s/ }).getAttribute("href")).toMatch(/^\/staff\/sf52\/files\/?$/);
  });

  it("asks for missing hire dates and saves one to the person's record", async () => {
    const { user } = await renderPage();
    const box = screen.getByRole("region", { name: "Missing hire dates" });
    expect(box).toHaveTextContent("1 person has no hire date");
    const input = within(box).getByLabelText("Hire date for Ruben Villalobos");
    await user.type(input, "2026-08-15");
    await user.click(within(box).getByRole("button", { name: "Save" }));
    expect(rpc.calls).toEqual([
      { fn: "update_staff_profile", args: { p_employee_id: "ruben", p_directory: {}, p_personnel: { hire_date: "2026-08-15" } } },
    ]);
    expect(rpc.reload).toHaveBeenCalled();
  });

  it("has separate Year-end and 90-day tabs with what's left and what's overdue", async () => {
    const { user } = await renderPage();
    const yearTab = screen.getByRole("tab", { name: /Year-end/ });
    const ninetyTab = screen.getByRole("tab", { name: /90-day/ });
    expect(yearTab).toHaveAttribute("aria-selected", "true");
    expect(yearTab).toHaveTextContent("2 to do· 2 overdue");
    expect(ninetyTab).toHaveTextContent("2 to do· 1 overdue");
    await user.click(ninetyTab);
    expect(nav.replace).toHaveBeenCalledWith("/staff/evaluations?tab=90day&fy=2026");
  });

  it("groups year-end evaluations into Overdue and Finished, with the due date", async () => {
    await renderPage();
    expect(screen.getByText(/FY2026 evaluations are due Oct 31, 2026 — 2 days overdue/)).toBeInTheDocument();
    const overdue = screen.getByRole("region", { name: "Overdue (2)" });
    expect(within(overdue).getByText("Oscar Gonzalez")).toBeInTheDocument();
    expect(within(overdue).getByText("Ruben Villalobos")).toBeInTheDocument();
    expect(within(overdue).getAllByText(/2 days overdue/)).toHaveLength(2);
    const finished = screen.getByRole("region", { name: "Finished (1)" });
    expect(within(finished).getByText("Done Person")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Due soon/ })).toBeNull();
    // The 90-day list is on its own tab.
    expect(screen.queryByText("Colin O'Neill")).toBeNull();
    // New hires aren't listed on the year-end page at all; they're on the 90-day tab at their mark.
    expect(screen.queryByText(/Not due a FY2026 evaluation/)).toBeNull();
    expect(screen.queryByText("Late Hire")).toBeNull();
  });

  it("shows 90-day evaluations by due status on their tab", async () => {
    nav.search = "tab=90day&fy=2026";
    await renderPage();
    expect(screen.getByRole("tab", { name: /90-day/ })).toHaveAttribute("aria-selected", "true");
    const overdue = screen.getByRole("region", { name: "Overdue (1)" });
    const colin = within(overdue).getByRole("link", { name: /Colin O'Neill/ });
    expect(colin).toHaveAttribute("href", "/staff/evaluations/edit?employee=colin&kind=90day&start=2026-06-01");
    expect(colin).toHaveTextContent("64 days overdue");
    const soon = screen.getByRole("region", { name: "Due soon (1)" });
    expect(within(soon).getByRole("link", { name: /New Hire/ })).toHaveTextContent("Due today");
    expect(screen.queryByText("Oscar Gonzalez")).toBeNull();
  });
});
