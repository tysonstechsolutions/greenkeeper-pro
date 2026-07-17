import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Operations Command Center route consolidation", () => {
  it("redirects Today and My Day to the canonical route", () => {
    expect(read("src/app/today/page.tsx")).toContain('redirect("/operations")');
    expect(read("src/app/my-day/page.tsx")).toContain('redirect("/operations?view=mine")');
  });

  it("makes Operations the primary desktop and mobile destination", () => {
    expect(read("src/lib/layout/nav-config.ts")).toContain('href: "/operations", label: "Operations"');
    expect(read("src/lib/layout/app-catalog.ts")).toContain('href: "/operations", label: "Operations"');
  });

  it("exposes required filters, sections, and visible actions", () => {
    const page = read("src/app/operations/page.tsx");
    const card = read("src/components/features/operations-command-center/work-card.tsx");
    for (const filter of ["Department", "Employee", "Position", "Status", "Source", "Priority", "Due date", "Duration", "Program Standard", "Delegated", "Blocked", "Leadership"]) {
      expect(page).toContain(filter);
    }
    for (const action of ["Open", "Start", "Delegate", "Postpone", "Mark blocked", "Add dependency", "Send to leadership", "Upload evidence", "Submit for verification", "Complete", "Reopen"]) {
      expect(card).toContain(action);
    }
  });
});
describe("unified operations migration security", () => {
  const migration = read("supabase/migrations/20260716190000_unified_operations_command_center.sql");

  it("enables RLS, removes direct writers, and denies anonymous grants", () => {
    for (const table of ["operational_work_states", "operational_work_assignments", "operational_work_postponements", "operational_work_dependencies", "operational_work_leadership_handoffs", "operational_work_evidence", "operational_work_events"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("REVOKE ALL PRIVILEGES ON TABLE");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("uses fixed-search-path server commands and forced actor attribution", () => {
    expect(migration).toContain("SECURITY DEFINER SET search_path = public");
    expect(migration).toContain("v_actor UUID := (SELECT auth.uid())");
    expect(migration).not.toContain("service_role");
  });

  it("prevents self/circular dependencies and automatically reactivates dependents", () => {
    expect(migration).toContain("A work item cannot depend on itself");
    expect(migration).toContain("WITH RECURSIVE downstream");
    expect(migration).toContain("reactivate_operational_dependents");
    expect(migration).toContain("automatically_reactivated");
  });

  it("protects completed history and requires postponement/leadership accountability", () => {
    expect(migration).toContain("Completed assignment history is immutable");
    expect(migration).toContain("A resume date or review date is required");
    expect(migration).toContain("A leadership follow-up date is required");
    expect(migration).toContain("Program Standard completion must use the audited progress workflow");
  });
});
