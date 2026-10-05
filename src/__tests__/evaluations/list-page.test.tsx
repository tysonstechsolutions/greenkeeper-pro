import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../utils/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/staff/evaluations",
  useSearchParams: () => new URLSearchParams("fy=2026"),
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

const profile = (id: string, full_name: string) => ({ id, full_name, role: "crew", is_active: true, supervisor_id: null });

vi.mock("@/lib/evaluations/use-evaluations", () => ({
  useEvaluationRoster: () => ({
    entries: [{ profile: profile("old", "Oscar Gonzalez"), evaluation: null, progress: "not_started" }],
    ninetyDay: [
      { profile: profile("colin", "Colin O'Neill"), hireDate: "2026-06-01", dueDate: "2026-08-30", timing: "overdue", evaluation: null, progress: "not_started" },
    ],
    notDue: [{ profile: profile("late", "Late Hire"), hireDate: "2026-08-20" }],
    loading: false,
    error: null,
    reload: async () => undefined,
  }),
}));

describe("evaluations list", () => {
  it("shows 90-day evaluations and who isn't due a yearly one", async () => {
    const { default: Page } = await import("@/app/staff/evaluations/page");
    render(<Page />);
    expect(await screen.findByText("90-day evaluations")).toBeInTheDocument();
    const colin = screen.getByRole("link", { name: /Colin O'Neill/ });
    expect(colin).toHaveAttribute("href", "/staff/evaluations/edit?employee=colin&kind=90day&start=2026-06-01");
    expect(colin).toHaveTextContent("Overdue");
    expect(colin).toHaveTextContent("90-day mark Aug 30, 2026");
    expect(screen.getByText("Not due a FY2026 evaluation")).toBeInTheDocument();
    expect(screen.getByText(/Hired fewer than 90 days before Sep 30, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/90-day mark Nov 18, 2026/)).toBeInTheDocument();
    // His row and "Start next" both open the yearly evaluation.
    for (const link of screen.getAllByRole("link", { name: /Oscar Gonzalez/ })) {
      expect(link).toHaveAttribute("href", "/staff/evaluations/edit?employee=old&fy=2026");
    }
  });
});
