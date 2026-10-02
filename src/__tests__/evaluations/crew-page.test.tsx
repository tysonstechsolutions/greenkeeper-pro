import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "../utils/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/staff/evaluations/crew",
  useSearchParams: () => new URLSearchParams("fy=2026"),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "gm1", full_name: "Tyson Bruce", role: "gm" } }),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>, useRoleAccess: () => ({ hasRole: () => true }) };
});

// A small fake of the REST layer: profiles + the evaluations table.
type Row = Record<string, unknown> & { id: string; employee_id: string };
const db: { rows: Row[]; inserts: Row[]; patches: { id: string; patch: Record<string, unknown> }[] } = {
  rows: [],
  inserts: [],
  patches: [],
};
const PROFILES = [
  { id: "gm1", full_name: "Tyson Bruce", role: "gm", is_active: true, supervisor_id: null },
  { id: "a", full_name: "Ann Lead", role: "crew", is_active: true, supervisor_id: null },
  { id: "b", full_name: "Bo Crew", role: "crew", is_active: true, supervisor_id: "a" },
  { id: "c", full_name: "Cy Done", role: "crew", is_active: true, supervisor_id: null },
];
const delay = () => new Promise((r) => setTimeout(r, 15));
vi.mock("@/lib/supabase/rest", () => ({
  getCachedUserId: () => "gm1",
  directSelectList: async (table: string) => (table === "profiles" ? PROFILES : db.rows),
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    await delay();
    const r = { ...row, id: `ev-${db.inserts.length + 1}` } as Row;
    db.inserts.push(r);
    db.rows.push(r);
    return r;
  },
  directPatchRowReturning: async (_t: string, _c: string, id: string, patch: Record<string, unknown>) => {
    await delay();
    db.patches.push({ id, patch });
    const r = db.rows.find((x) => x.id === id)!;
    Object.assign(r, patch);
    return r;
  },
}));

beforeEach(() => {
  push.mockClear();
  db.inserts = [];
  db.patches = [];
  db.rows = [
    { id: "ev-final", employee_id: "c", period_start: "2025-10-01", status: "final", supervisory: false, ratings: {}, overall_rating: 3, answers: {}, narrative: {}, awards: {} },
  ];
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/evaluations/crew/page");
  return render(<Page />);
}

describe("rate the crew side by side", () => {
  it("rates everyone one element at a time and saves each person once, in order", async () => {
    const { user } = await renderPage();

    // Step 1: supervisors. Ann has a report, so she's pre-checked; Cy is final and hidden.
    expect(await screen.findByText("Who supervises other people?")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ann Lead/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Bo Crew/ })).not.toBeChecked();
    expect(screen.queryByText("Cy Done")).toBeNull();
    expect(screen.getByText("1 already final (not shown)")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 9")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next: Quality of Work/ }));
    expect(screen.getByRole("heading", { name: "a. Quality of Work" })).toBeInTheDocument();
    expect(screen.getByText("2 left to rate")).toBeInTheDocument();

    // Quick double tap for Bo: one insert, then a patch with the latest rating.
    const bo = screen.getByRole("radiogroup", { name: "Bo Crew — Quality of Work" });
    await user.click(within(bo).getByRole("radio", { name: "3 Satisfactory" }));
    await user.click(within(bo).getByRole("radio", { name: "4 Highly Satisfactory" }));
    const ann = screen.getByRole("radiogroup", { name: "Ann Lead — Quality of Work" });
    await user.click(within(ann).getByRole("radio", { name: "5 Outstanding" }));
    expect(screen.getByText("Everyone rated")).toBeInTheDocument();

    await waitFor(() => expect(db.inserts).toHaveLength(2));
    await waitFor(() => expect(db.patches).toHaveLength(1));
    const boRow = db.rows.find((r) => r.employee_id === "b")!;
    expect(boRow.ratings).toEqual({ quality: 4 });
    expect(boRow.supervisory).toBe(false);
    expect(boRow.period_start).toBe("2025-10-01");
    const annRow = db.rows.find((r) => r.employee_id === "a")!;
    expect(annRow).toMatchObject({ ratings: { quality: 5 }, supervisory: true });

    // Unsatisfactory forces the overall and shows the form's warning.
    await user.click(screen.getByRole("button", { name: /Next: Productivity/ }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Bo Crew — Productivity" })).getByRole("radio", { name: "1 Unsatisfactory" }));
    expect(screen.getByText(/Letter of Caution/)).toBeInTheDocument();
    await waitFor(() => expect(db.rows.find((r) => r.employee_id === "b")).toMatchObject({ ratings: { quality: 4, productivity: 1 }, overall_rating: 1 }));

    // f-h only list supervisors.
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: /^Next:/ }));
    expect(screen.getByRole("heading", { name: "f. Leadership" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Ann Lead — Leadership" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Bo Crew — Leadership" })).toBeNull();

    // Last step hands off to the first person's questions.
    await user.click(screen.getByRole("button", { name: /^Next:/ }));
    await user.click(screen.getByRole("button", { name: /^Next:/ }));
    await user.click(screen.getByRole("button", { name: /Done rating/ }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/staff\/evaluations\/edit\?employee=(a|b)&fy=2026$/));
  }, 30_000);
});
