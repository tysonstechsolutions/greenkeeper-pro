import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260716150000_staff_privacy_security.sql",
);
const profilePage = read("src/app/staff/profile/page.tsx");
const insightsPage = read("src/app/staff/insights/page.tsx");

describe("private staff security migration contract", () => {
  it("replaces every broad private-staff policy with scoped policies", () => {
    for (const table of [
      "staff_one_on_ones",
      "staff_concerns",
      "staff_one_on_one_sessions",
      "staff_engagement_profiles",
      "staff_records",
      "staff_documents",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain(
      "FUNCTION public.can_manage_staff_member(p_employee_id UUID)",
    );
    expect(migration).toContain("employee.supervisor_id = actor.id");
    expect(migration).toContain("public.is_manager()");
    expect(migration).not.toContain("FOR ALL TO authenticated");
  });

  it("keeps HR records and document metadata manager-only", () => {
    expect(migration).toContain('CREATE POLICY "Managers view private staff records"');
    expect(migration).toContain('CREATE POLICY "Managers view private staff documents"');
    expect(migration).toContain("REVOKE ALL ON public.staff_records FROM authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.staff_records TO authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, DELETE ON public.staff_documents TO authenticated");
  });

  it("forces actor attribution and prevents employee/history rewriting", () => {
    expect(migration).toContain("FUNCTION public.attribute_private_staff_mutation()");
    expect(migration).toContain("v_actor UUID := auth.uid()");
    expect(migration).toContain("NEW.created_by := v_actor");
    expect(migration).toContain("NEW.updated_by := v_actor");
    expect(migration).toContain("NEW.uploaded_by := CASE");
    expect(migration).toContain("Private staff history cannot be moved to another employee");
    expect(migration).toContain("Completed one-on-one sessions are immutable");
    expect(migration).toContain("Private staff history cannot be deleted");
    expect(migration).not.toContain("created_by = auth.uid()");
  });

  it("closes the storage-object bypass instead of only hiding metadata", () => {
    expect(migration).toContain("UPDATE storage.buckets SET public = FALSE");
    expect(migration).toContain("DROP POLICY IF EXISTS staff_docs_select");
    expect(migration).toContain(
      "USING (bucket_id = 'staff-documents' AND public.is_manager())",
    );
    expect(migration).toContain(
      "WITH CHECK (bucket_id = 'staff-documents' AND public.is_manager())",
    );
  });
});

describe("private staff page guards", () => {
  it("does not mount full HR/profile queries for non-admin roles", () => {
    expect(profilePage).toContain("<RoleGuard allowedRoles={ADMIN_ROLES}>");
    expect(profilePage.indexOf("<RoleGuard allowedRoles={ADMIN_ROLES}>")).toBeLessThan(
      profilePage.indexOf("<ProfileContent />"),
    );
  });

  it("does not mount cross-employee one-on-one insights for non-admin roles", () => {
    expect(insightsPage).toContain("function OneOnOneInsightsContent()");
    expect(insightsPage).toContain("<RoleGuard allowedRoles={ADMIN_ROLES}>");
    expect(insightsPage.indexOf("<RoleGuard allowedRoles={ADMIN_ROLES}>")).toBeLessThan(
      insightsPage.indexOf("<OneOnOneInsightsContent />"),
    );
  });
});
