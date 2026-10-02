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

  it("stores what CNIC 5300 needs", () => {
    expect(migration).toContain("CHECK (rating_reason IN ('ninety_day', 'interim', 'annual', 'separation'))");
    expect(migration).toContain("supervisory     BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration).toContain("awards          JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("DEFAULT 'cnic-5300-rev-2025-09'");
  });
});

describe("adding staff for evaluations", () => {
  it("lets any active manager (including the GM) create staff invites", () => {
    const fix = read("supabase/migrations/20261002170000_invites_any_manager.sql");
    expect(fix).toContain('DROP POLICY IF EXISTS "invites_insert_manager" ON public.invites;');
    expect(fix).toContain('DROP POLICY IF EXISTS "Managers can create invites" ON public.invites;');
    expect(fix).toContain("WITH CHECK (created_by = auth.uid() AND public.is_manager());");
  });
});
