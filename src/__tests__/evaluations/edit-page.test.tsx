import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "../utils/test-utils";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { FORM_TEMPLATE_URL, elementsFor } from "@/lib/evaluations/form";
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
const filedBlobs: Blob[] = [];

// The page fetches the blank form from /templates; serve the real file
// through the suite's MSW server (it owns fetch in tests).
const TEMPLATE = fs.readFileSync(path.resolve(process.cwd(), "public", FORM_TEMPLATE_URL.replace(/^\//, "")));

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
      void employeeId;
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
              rating_reason: "annual",
              supervisory: false,
              ratings: {},
              overall_rating: null,
              awards: {},
              answers: {},
              narrative: {},
              facts: {},
              form_version: "cnic-5300-rev-2025-09",
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
        employee: {
          id: employeeId,
          full_name: "Jane Smith",
          role: "crew",
          supervisor_id: null,
          personnel: {
            hire_date: "2021-04-12",
            certifications: [],
            personnel_details: { name_last: "Smith", name_first: "Jane", name_middle: "Quinn", work_schedule: "RFT" },
          },
        },
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
        suggestions: {
          highlights: [{ text: "Fixed the irrigation pump", date: "2026-05-01", source: "1:1 May 1" }],
          improve: [],
          goals: [
            { text: "Wants the spray license", date: "2026-05-01", source: "1:1 May 1" },
            { text: "Become an equipment operator", date: null, source: "Career goals" },
          ],
          training: [],
        },
        loadedFor: `${employeeId}|${period.start}`,
        loading: false,
        error: null,
        reload: async () => undefined,
        save,
      };
    },
    fileEvaluationPdf: async (args: { filename: string; blob: Blob }) => {
      filed.push(args.filename);
      filedBlobs.push(args.blob);
      return true;
    },
  };
});

beforeEach(() => {
  server.use(
    http.get(`*${FORM_TEMPLATE_URL}`, () =>
      HttpResponse.arrayBuffer(TEMPLATE.buffer.slice(TEMPLATE.byteOffset, TEMPLATE.byteOffset + TEMPLATE.byteLength) as ArrayBuffer, {
        headers: { "Content-Type": "application/pdf" },
      }),
    ),
  );
  saves.length = 0;
  filed.length = 0;
  filedBlobs.length = 0;
  push.mockClear();
  saveBlobToDevice.mockClear();
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/evaluations/edit/page");
  return render(<Page />);
}

describe("evaluation interview", () => {
  it("goes from ratings to a finalized, filed CNIC 5300 with the AI down", async () => {
    const { user } = await renderPage();

    expect(await screen.findByRole("heading", { name: "Jane Smith" })).toBeInTheDocument();
    expect(screen.getByText(/Laborer · FY2026/)).toBeInTheDocument();
    expect(screen.getByText("2 call-outs (12 hrs)")).toBeInTheDocument();

    // A crew member is rated on a-e only; f-h appear when marked supervisory.
    expect(screen.queryByRole("radiogroup", { name: "Leadership" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /Supervises other people/ }));
    expect(screen.getByRole("radiogroup", { name: "Leadership" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Supervises other people/ }));

    // Can't skip the ratings.
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));
    expect(screen.getByText("Rate every item to keep going.")).toBeInTheDocument();

    // Tap Highly Satisfactory on every element and add one example.
    for (const el of elementsFor(false)) {
      const group = screen.getByRole("radiogroup", { name: el.label });
      await user.click(within(group).getByRole("radio", { name: "4 Highly Satisfactory" }));
    }
    expect(screen.getAllByText(/^Highly Satisfactory:/)).toHaveLength(5);
    await user.type(screen.getAllByPlaceholderText("Example (optional)")[0], "greens looked great");
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));

    // Required question and award amount are enforced.
    const pay = screen.getByRole("radiogroup", { name: "Pay increase" });
    await user.click(within(pay).getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /Write it up/ }));
    expect(screen.getByText("This one is needed.")).toBeInTheDocument();
    expect(screen.getByText("Enter the amount.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /What did they do well this year/ }), "rebuilt the bunkers on 7");
    await user.type(screen.getByRole("textbox", { name: "Pay increase amount" }), "500");
    await user.type(screen.getByRole("textbox", { name: /learn or get trained on/ }), "mower training");
    await user.click(screen.getByRole("button", { name: /Write it up/ }));

    // Review: suggested overall picked, built-in draft filled in.
    expect(await screen.findByText(/The AI wasn't available/)).toBeInTheDocument();
    const overall = screen.getByRole("radiogroup", { name: "Overall rating" });
    expect(within(overall).getByRole("radio", { name: "4 Highly Satisfactory" })).toHaveAttribute("aria-checked", "true");
    const summary = screen.getByRole("textbox", { name: "Summary that supports the ratings" }) as HTMLTextAreaElement;
    expect(summary.value).toContain("Jane's overall performance for FY2026 is rated Highly Satisfactory.");
    const strengths = screen.getByRole("textbox", { name: "Special accomplishments" }) as HTMLTextAreaElement;
    expect(strengths.value).toBe("Rebuilt the bunkers on 7. Greens looked great.");
    expect((screen.getByRole("textbox", { name: "Learning opportunity a" }) as HTMLInputElement).value).toBe("mower training");

    // Finalize.
    await user.click(screen.getByRole("button", { name: /Finalize/ }));
    expect(await screen.findByText(/evaluation is final/)).toBeInTheDocument();
    const finalSave = saves.find((s) => s.status === "final");
    expect(finalSave).toBeDefined();
    expect(finalSave?.overall_rating).toBe(4);
    expect(finalSave?.supervisory).toBe(false);
    expect(finalSave?.rating_reason).toBe("annual");
    expect(Object.keys(finalSave?.ratings ?? {})).toHaveLength(5);
    expect(finalSave?.awards?.pay_increase).toEqual({ granted: true, amount: "500" });
    expect(finalSave?.answers?.highlights).toBe("rebuilt the bunkers on 7");
    expect(finalSave?.facts).toMatchObject({ call_outs: { count: 2 } });

    // The filed copy is the real form, filled in.
    await waitFor(() => expect(filed).toEqual(["Evaluation_FY2026_Jane_Smith.pdf"]));
    const filledForm = (await PDFDocument.load(await filedBlobs[0].arrayBuffer())).getForm();
    expect(filledForm.getTextField("1 Name Last First MI").getText()).toBe("Smith, Jane Q.");
    expect(filledForm.getTextField("Highly Satisfactorya Quality of Work").getText()).toBe("X");
    expect(filledForm.getCheckBox("Check Box1").isChecked()).toBe(true);
    expect(filledForm.getTextField("Text5").getText()).toBe("500");
    expect(screen.getByText(/filed on their profile/)).toBeInTheDocument();
    expect(screen.getByText(/last 4 of their SSN/)).toBeInTheDocument();

    // Download, then straight on to the next person.
    await user.click(screen.getByRole("button", { name: /Download the form/ }));
    await waitFor(() => expect(saveBlobToDevice).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Next: Sam Lee/ }));
    expect(push).toHaveBeenCalledWith("/staff/evaluations/edit?employee=emp2&fy=2026");
  }, 30_000);

  it("offers the GM's own 1:1 notes as one-tap answers", async () => {
    const { user } = await renderPage();
    await screen.findByRole("heading", { name: "Jane Smith" });
    for (const el of elementsFor(false)) {
      await user.click(within(screen.getByRole("radiogroup", { name: el.label })).getByRole("radio", { name: "3 Satisfactory" }));
    }
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));

    expect(screen.getByText("Fixed the irrigation pump")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add: Fixed the irrigation pump" }));
    const did = screen.getByRole("textbox", { name: /What did they do well this year/ }) as HTMLTextAreaElement;
    expect(did.value).toBe("Fixed the irrigation pump");
    // Added items drop off the list.
    expect(screen.queryByRole("button", { name: "Add: Fixed the irrigation pump" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add all" }));
    const goals = screen.getByRole("textbox", { name: /goals for next year/ }) as HTMLTextAreaElement;
    expect(goals.value).toBe("Wants the spray license\nBecome an equipment operator");
    await waitFor(() => expect(saves.at(-1)?.answers?.goals).toBe("Wants the spray license\nBecome an equipment operator"));
  }, 30_000);

  it("applies the form's Unsatisfactory rule", async () => {
    const { user } = await renderPage();
    await screen.findByRole("heading", { name: "Jane Smith" });
    for (const el of elementsFor(false)) {
      const group = screen.getByRole("radiogroup", { name: el.label });
      await user.click(within(group).getByRole("radio", { name: el.key === "dependability" ? "1 Unsatisfactory" : "5 Outstanding" }));
    }
    expect(screen.getByText(/Letter of Caution/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next: a few questions/ }));
    await user.type(screen.getByRole("textbox", { name: /What did they do well this year/ }), "fast mower");
    await user.click(screen.getByRole("button", { name: /Write it up/ }));
    await screen.findByText(/The AI wasn't available/);
    const overall = screen.getByRole("radiogroup", { name: "Overall rating" });
    expect(within(overall).getByRole("radio", { name: "1 Unsatisfactory" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(overall).getByRole("radio", { name: "5 Outstanding" }));
    expect(screen.getByText(/overall rating must be Unsatisfactory/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Finalize/ }));
    expect(screen.getByText("Before finalizing:")).toBeInTheDocument();
    expect(saves.some((s) => s.status === "final")).toBe(false);
  }, 30_000);
});
