import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260713190000_daily_operations_phase1a.sql"),
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
});
