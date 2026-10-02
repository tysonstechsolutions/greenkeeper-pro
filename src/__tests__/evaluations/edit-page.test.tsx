import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "../utils/test-utils";
import { PERFORMANCE_ELEMENTS } from "@/lib/evaluations/form";
import type { EvaluationPatch } from "@/lib/evaluations/use-evaluations";
import type { StaffEvaluation } from "@/lib/evaluations/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/staff/evaluations/edit",
  useSearchParams: () => new URLSearchParams("employee=emp1&fy=2026"),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "gm1", full_name: "Tyson Bruce", role: "gm" } }),
}));

vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>(
    "@/components/auth/role-guard",
  );
  return {
    ...actual,
    RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useRoleAccess: () => ({ hasRole: () => true }),
  };
});

// The AI is "down" so the built-in writer drafts — the path that must always work.
vi.mock("@/lib/api/client", () => ({
  callApi: async () => {
    throw new Error("not deployed");
  },
}));

const saveBlobToDevice = vi.fn<(opts: unknown) => Promise<void>>(async () => undefined);
vi.mock("@/lib/utils/download-blob", () => ({
  saveBlobToDevice: (opts: unknown) => saveBlobToDevice(opts),
}));

// Data layer: a tiny in-memory stand-in for the Supabase-backed hook.
const saves: EvaluationPatch[] = [];
const filed: string[] = [];
vi.mock("@/lib/evaluations/use-evaluations", async () => {
  const React = await import("react");
  return {
    useEvaluationRoster: () => ({
      entries: [
        { profile: { id: "emp1", full_name: "Jane Smith", role: "crew", is_active: true, supervisor_id: null }, evaluation: null, progress: "not_started" },
        { profile: { id: "emp2", full_name: "Sam Lee", role: "crew", is_active: true, supervisor_id: null }, evaluation: null, progress: "not_started" },
      ],
      loading: false,
      error: null,
      reload: async () => undefined,
    }),
    useEvaluation: (employeeId: string, period: { start: string; end: string; label: string }) => {
      const [evaluation, setEvaluation] = React.useState<StaffEvaluation | null>(null);
      const save = React.useCallback(
        async (patch: EvaluationPatch) => {
          saves.push(patch);
          let next: StaffEvaluation | null = null;
          setEvaluation((prev) => {
            next = {
              id: "ev1",
              employee_id: employeeId,
              period_start: period.start,
              period_end: period.end,
              period_label: period.label,
              status: "draft",
              ratings: {},
              overall_rating: null,
              answers: {},
              narrative: {},
              facts: {},
              form_version: "generic-v1",
              finalized_at: null,
              created_by: "gm1",
              updated_by: "gm1",
              created_at: "",
              updated_at: "",
              ...(prev ?? {}),
              ...patch,
              ...(patch.status === "final" ? { finalized_at: "2026-10-02T16:00:00Z" } : {}),
            } as StaffEvaluation;
            return next;
          });
          return next as unknown as StaffEvaluation;
        },
        [employeeId, period.start, period.end, period.label],
      );
      return {
        employee: { id: employeeId, full_name: "Jane Smith", role: "crew", supervisor_id: null, personnel: null },
        evaluation,
        facts: {
          hire_date: "2021-04-12",
          position_title: "Laborer",
          pay_plan_grade: "NA-5703-05",
          call_outs: { count: 2, hours: 12 },
          sick_time: { count: 0, hours: 0 },
          disciplinary: [],
          one_on_ones: { count: 1, summaries: [{ date: "2026-05-01", summary: "Wants the pesticide license" }] },
          follow_ups: { opened: 0, reconciled: 0, open_titles: [] },
          certifications: [],
        },
        loadedFor: `${employeeId}|${period.start}`,
        loading: false,
        error: null,
        reload: async () => undefined,
        save,
      };
    },
    fileEvaluationPdf: async (args: { filename: string }) => {
      filed.push(args.filename);
      return true;
    },
  };
});

beforeEach(() => {
  saves.length = 0;
  filed.length = 0;
  push.mockClear();
  saveBlobToDevice.mockClear();
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/evaluations/edit/page");
  return render(<Page />);
}

describe("evaluation interview", () => {
  it("goes from ratings to a finalized, filed evaluation with the AI down", async () => {
    const { user } = await renderPage();

    expect(await screen.findByRole("heading", { name: "Jane Smith" })).toBeInTheDocument();
    expect(screen.getByText(/Laborer · FY2026/)).toBeInTheDocument();
    expect(screen.getByText("2 call-outs (12 hrs)")).toBeInTheDocument();

    // Can't skip the ratings.
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));
    expect(screen.getByText("Rate every item to keep going.")).toBeInTheDocument();

    // Tap a 4 on every element, and add one example.
    for (const el of PERFORMANCE_ELEMENTS) {
      const group = screen.getByRole("radiogroup", { name: el.label });
      await user.click(within(group).getByRole("radio", { name: /^4/ }));
    }
    await user.type(screen.getAllByPlaceholderText("Example (optional)")[0], "greens looked great");
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));

    // Required question is enforced.
    await user.click(screen.getByRole("button", { name: /Write it up/ }));
    expect(screen.getByText("This one is needed.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /What did they do well this year/ }), "rebuilt the bunkers on 7");
    await user.click(screen.getByRole("button", { name: /Write it up/ }));

    // Review: suggested overall picked, built-in draft filled in.
    expect(await screen.findByText(/The AI wasn't available/)).toBeInTheDocument();
    const overall = screen.getByRole("radiogroup", { name: "Overall rating" });
    expect(within(overall).getByRole("radio", { name: /^4/ })).toHaveAttribute("aria-checked", "true");
    const summary = screen.getByRole("textbox", { name: "Overall Performance Summary" }) as HTMLTextAreaElement;
    expect(summary.value).toContain("Jane's overall performance for FY2026 is rated Exceeds Expectations.");
    const strengths = screen.getByRole("textbox", { name: "Strengths & Accomplishments" }) as HTMLTextAreaElement;
    expect(strengths.value).toContain("Rebuilt the bunkers on 7.");
    expect(strengths.value).toContain("Greens looked great.");

    // Finalize.
    await user.click(screen.getByRole("button", { name: /Finalize/ }));
    expect(await screen.findByText(/evaluation is final/)).toBeInTheDocument();
    const finalSave = saves.find((s) => s.status === "final");
    expect(finalSave).toBeDefined();
    expect(finalSave?.overall_rating).toBe(4);
    expect(finalSave?.ratings?.quality).toBe(4);
    expect(finalSave?.answers?.highlights).toBe("rebuilt the bunkers on 7");
    expect(finalSave?.facts).toMatchObject({ call_outs: { count: 2 } });
    await waitFor(() => expect(filed).toEqual(["Evaluation_FY2026_Jane_Smith.pdf"]));
    expect(screen.getByText(/filed on their profile/)).toBeInTheDocument();

    // Download, then straight on to the next person.
    await user.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(saveBlobToDevice).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Next: Sam Lee/ }));
    expect(push).toHaveBeenCalledWith("/staff/evaluations/edit?employee=emp2&fy=2026");
  }, 30_000);
});
