import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fiscalYearPeriod } from "@/lib/evaluations/period";

const db = vi.hoisted(() => ({ patches: [] as { id: string; patch: Record<string, unknown> }[] }));

vi.mock("@/lib/utils/date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/date")>("@/lib/utils/date");
  return { ...actual, todayLocal: () => "2026-10-08" };
});
vi.mock("@/lib/staff/separation", () => ({ deactivateDepartedStaff: async () => undefined }));
vi.mock("@/lib/staff/sf52-files", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff/sf52-files")>("@/lib/staff/sf52-files");
  return { ...actual, loadSf52Files: async () => [] };
});

const evaluation = (id: string, employee_id: string, extra: Record<string, unknown>) => ({
  id,
  employee_id,
  period_start: "2025-10-01",
  period_end: "2026-09-30",
  period_label: "FY2026",
  status: "draft",
  rating_reason: "annual",
  supervisory: false,
  ratings: {},
  overall_rating: null,
  awards: {},
  answers: {},
  narrative: {},
  facts: {},
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

vi.mock("@/lib/supabase/rest", () => ({
  getCachedUserId: () => "gm",
  directSelectList: async (table: string, opts: { label?: string }) => {
    if (table === "profiles")
      return [
        { id: "gm", full_name: "Tyson Bruce", role: "gm", is_active: true, supervisor_id: null },
        { id: "new", full_name: "New Hire", role: "crew", is_active: true, supervisor_id: null },
        { id: "newdone", full_name: "New Done", role: "crew", is_active: true, supervisor_id: null },
        { id: "vet", full_name: "Veteran", role: "crew", is_active: true, supervisor_id: null },
      ];
    if (table === "staff_personnel_private")
      return [
        { employee_id: "new", hire_date: "2026-08-01" },
        { employee_id: "newdone", hire_date: "2026-08-01" },
        { employee_id: "vet", hire_date: "2015-04-01" },
      ];
    if (opts?.label === "evaluations.roster.evaluations")
      return [
        evaluation("e-new", "new", { ratings: { quality: 4 }, answers: { strengths: "fast" } }),
        evaluation("e-newdone", "newdone", { status: "final", ratings: { quality: 5 }, overall_rating: 5 }),
        evaluation("e-vet", "vet", { ratings: { quality: 3 } }),
      ];
    return [];
  },
  directPatchRow: async (_table: string, _col: string, id: string, patch: Record<string, unknown>) => {
    db.patches.push({ id, patch });
  },
  directInsertRow: async () => null,
  directPatchRowReturning: async () => null,
  directSelectRow: async () => null,
  directStorageUpload: async () => "",
}));

describe("useEvaluationRoster", () => {
  it("blanks a yearly draft started for a new hire, leaves finished and due ones alone, and keeps new hires off the list", async () => {
    const { useEvaluationRoster } = await import("@/lib/evaluations/use-evaluations");
    const period = fiscalYearPeriod(2026);
    const { result } = renderHook(() => useEvaluationRoster(period, { id: "gm", isManager: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(db.patches).toEqual([
      { id: "e-new", patch: { ratings: {}, overall_rating: null, awards: {}, answers: {}, narrative: {}, facts: {} } },
    ]);
    // The new hire with an unfinished draft is off; the finished one shows as finished.
    expect(result.current.entries.map((e) => [e.profile.id, e.progress])).toEqual([
      ["vet", "in_progress"],
      ["newdone", "final"],
    ]);
  });
});
