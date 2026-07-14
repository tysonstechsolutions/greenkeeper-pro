import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260713190000_daily_operations_phase1a.sql"),
  "utf8",
);

const existingSeriesFollowUp = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260713210000_daily_operations_phase1a_existing_series.sql",
  ),
  "utf8",
);

const correctiveMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260713230000_daily_operations_phase1a_corrective.sql",
  ),
  "utf8",
);

describe("daily operations Phase 1A migration contract", () => {
  it("keeps all approved role groups distinct", () => {
    for (const roleGroup of [
      "recreation_aide",
      "golf_operations_assistant",
      "maintenance_staff",
      "restaurant_staff",
      "pro_shop_staff",
      "general_manager",
      "contractor",
      "unassigned",
    ]) {
      expect(migration).toContain(`'${roleGroup}'`);
    }
  });

  it("stores non-overlapping temporal ownership and an immutable occurrence key", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.duty_assignments");
    expect(migration).toContain("duty_assignments_no_overlap");
    expect(migration).toContain("occurrence_key TEXT");
    expect(migration).toContain("idx_tasks_series_occurrence_key");
    expect(migration).toContain("ON CONFLICT (series_id, occurrence_key)");
  });

  it("provides manager-gated individual and bulk reassignment commands", () => {
    expect(migration).toContain("public.can_manage_daily_operations()");
    expect(migration).toContain("public.set_duty_assignment(");
    expect(migration).toContain("public.reassign_active_duties(");
    expect(migration).toContain("role IN ('super','asst_super','director','gm')");
  });

  it("preserves unknown ownership as explicitly unassigned", () => {
    expect(migration).toContain("Phase 1A migration: ownership not recorded");
    expect(migration).toContain("ELSE 'unassigned'");
    expect(migration).not.toContain("estimated_minutes = 0");
  });

  it("fires the series trigger for duties that predate Phase 1A", () => {
    expect(migration).toContain("AFTER INSERT OR UPDATE OF");
    expect(existingSeriesFollowUp).toContain("title = od.title");
    expect(existingSeriesFollowUp).toContain(
      "public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + 60)",
    );
  });
});

describe("daily operations Phase 1A corrective security contract", () => {
  it("replaces every tasks policy before installing least-privilege policies", () => {
    expect(correctiveMigration).toContain("FOR p IN SELECT policyname FROM pg_policies");
    expect(correctiveMigration).toContain("CREATE POLICY tasks_select_authorized");
    expect(correctiveMigration).toContain("CREATE POLICY tasks_update_authorized");
    expect(correctiveMigration).toContain("AND assigned_by = (SELECT auth.uid())");
    expect(correctiveMigration).toContain("AND duty_id IS NULL");
    expect(correctiveMigration).toContain("Completed and verified tasks are protected history");
  });

  it("uses atomic manager commands and retires direct competing writers", () => {
    expect(correctiveMigration).toContain("public.save_operation_duty(");
    expect(correctiveMigration).toContain("public.set_temporary_duty_coverage(");
    expect(correctiveMigration).toContain("public.change_future_duty_recurrence(");
    expect(correctiveMigration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.operation_duties FROM authenticated",
    );
    expect(correctiveMigration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.pro_shop_duties FROM authenticated",
    );
  });

  it("allows an individual GM profile without a synthetic superintendent identity", () => {
    expect(correctiveMigration).toContain("DROP CONSTRAINT IF EXISTS profiles_role_check");
    expect(correctiveMigration).toContain("'seasonal','pro','gm'");
  });

  it("restricts occurrence generation to trusted service jobs", () => {
    expect(correctiveMigration).toContain(
      "REVOKE ALL ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) FROM PUBLIC, authenticated",
    );
    expect(correctiveMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) TO service_role",
    );
  });

  it("preserves moved and protected occurrences during recurrence revisions", () => {
    expect(correctiveMigration).toContain(
      "WHEN t.due_date IS DISTINCT FROM t.original_due_date THEN 'preserve'",
    );
    expect(correctiveMigration).toContain(
      "AND t.due_date IS NOT DISTINCT FROM t.original_due_date",
    );
    expect(correctiveMigration).toContain("WHEN t.status <> 'pending' THEN 'preserve'");
  });

  it("does not invent missing seasonal dates or evidence facts", () => {
    expect(correctiveMigration).toContain("IF v_start IS NULL OR v_end IS NULL THEN");
    expect(correctiveMigration).not.toContain("COALESCE(p_start_mmdd, '03-20')");
    expect(correctiveMigration).not.toContain("estimated_minutes = 0");
    expect(correctiveMigration).toContain("evidence_requirement_state");
  });
});
