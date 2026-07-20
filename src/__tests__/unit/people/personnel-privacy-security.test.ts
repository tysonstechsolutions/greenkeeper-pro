import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260716170000_profiles_personnel_privacy.sql",
);
const employeeHook = read("src/lib/staff/use-employee.ts");
const profilesHook = read("src/lib/hooks/useProfiles.ts");
const sf52Page = read("src/app/staff/sf52/page.tsx");
const settingsStaffPage = read("src/app/settings/staff/view/page.tsx");
const assistant = read("supabase/functions/ai-assistant/index.ts");

describe("personnel privacy migration contract", () => {
  it("copies and verifies every private field before dropping source columns", () => {
    expect(migration).toContain("CREATE TABLE public.staff_personnel_private");
    for (const field of [
      "hire_date",
      "certifications",
      "emergency_contact",
      "personnel_details",
    ]) {
      expect(migration).toContain(`s.${field} IS DISTINCT FROM`);
      expect(migration).toContain(`DROP COLUMN ${field}`);
    }
    expect(migration.indexOf("copied values did not match profiles")).toBeLessThan(
      migration.indexOf("DROP COLUMN hire_date"),
    );
    expect(migration).not.toContain("DROP COLUMN hire_date CASCADE");
  });

  it("keeps private personnel rows self-readable and manager-maintained", () => {
    expect(migration).toContain('CREATE POLICY "Employees view their own private personnel row"');
    expect(migration).toContain("USING (employee_id = auth.uid())");
    expect(migration).toContain('CREATE POLICY "Managers view private personnel rows"');
    expect(migration).toContain('CREATE POLICY "Managers update private personnel rows"');
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE ON public.staff_personnel_private TO authenticated",
    );
    expect(migration).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_personnel_private");
  });

  it("publishes a narrow directory and blocks self-service authority changes", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.staff_directory");
    expect(migration).toContain("security_invoker = TRUE");
    expect(migration).toContain("FUNCTION public.protect_profile_authority_fields()");
    expect(migration).toContain("Only an active manager may change profile authority fields");
    expect(migration).toContain("NEW.role IS DISTINCT FROM OLD.role");
    expect(migration).toContain("NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id");
    expect(migration).toContain("NEW.department IS DISTINCT FROM OLD.department");
  });

  it("uses one allowlisted manager command for atomic directory/private updates", () => {
    expect(migration).toContain("FUNCTION public.update_staff_profile(");
    expect(migration).toContain("Unsupported staff directory field");
    expect(migration).toContain("Unsupported private personnel field");
    expect(migration).toContain("UPDATE public.profiles");
    expect(migration).toContain("UPDATE public.staff_personnel_private");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.update_staff_profile");
  });
});

describe("personnel privacy application routing", () => {
  it("loads private facts separately and saves through the atomic command", () => {
    expect(employeeHook).toContain('"staff_personnel_private"');
    expect(employeeHook).toContain('"update_staff_profile"');
    expect(employeeHook).not.toContain(
      'directPatchRow("profiles", "id", employeeId, patch',
    );
  });

  it("does not require the optional legacy preferences column to load an employee", () => {
    const profileQuery = employeeHook.match(/"id,email,[^"]+"/)?.[0] ?? "";

    expect(profileQuery).toContain("avatar_url,is_active");
    expect(profileQuery).not.toContain("user_preferences");
  });

  it("uses the safe directory for ordinary staff lists", () => {
    expect(profilesHook).toContain("/rest/v1/staff_directory?");
  });

  it("does not mount SF-52 or staff-edit personnel queries for non-admin roles", () => {
    expect(sf52Page).toContain("<RoleGuard allowedRoles={ADMIN_ROLES}>");
    expect(settingsStaffPage).toContain("<RoleGuard allowedRoles={ADMIN_ROLES}>");
    expect(sf52Page.indexOf("<RoleGuard allowedRoles={ADMIN_ROLES}>")).toBeLessThan(
      sf52Page.indexOf("<Sf52Content />"),
    );
    expect(settingsStaffPage.indexOf("<RoleGuard allowedRoles={ADMIN_ROLES}>")).toBeLessThan(
      settingsStaffPage.indexOf("<PageContent />"),
    );
  });

  it("keeps general AI staff search on the safe directory", () => {
    const searchStaff = assistant.slice(
      assistant.indexOf('case "search_staff"'),
      assistant.indexOf('case "get_schedule"'),
    );
    expect(searchStaff).toContain('.from("staff_directory")');
    expect(searchStaff).not.toContain("hire_date");
    expect(searchStaff).not.toContain("certifications");
    expect(searchStaff).not.toContain("personnel_details");
  });
});
