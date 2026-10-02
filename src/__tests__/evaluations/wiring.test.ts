import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchCapability } from "@/lib/my-day/capabilities";
import { HUB_PEOPLE } from "@/lib/layout/app-catalog";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261002120000_staff_evaluations.sql");

describe("evaluations wiring", () => {
  it("is reachable from People & Paperwork", () => {
    expect(HUB_PEOPLE.children?.some((c) => c.href === "/staff/evaluations")).toBe(true);
  });

  it("routes evaluation to-dos in My Day without stealing other forms", () => {
    for (const t of ["do yearly evals", "finish performance evaluations", "annual appraisal for Jane", "performance review"]) {
      expect(matchCapability(t)?.href).toBe("/staff/evaluations");
    }
    expect(matchCapability("fill out sf 52")?.key).toBe("sf52");
    expect(matchCapability("evaluate the new mower")).toBeNull();
  });

  it("keeps evaluations behind the private-staff trust boundary", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (public.can_manage_staff_member(employee_id))");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.staff_evaluations TO authenticated");
    expect(migration).not.toMatch(/GRANT[^;]*DELETE[^;]*staff_evaluations/);
    expect(migration).toContain("EXECUTE FUNCTION public.attribute_private_staff_mutation()");
    expect(migration).toContain("Only a manager can reopen a finalized evaluation");
  });
});
