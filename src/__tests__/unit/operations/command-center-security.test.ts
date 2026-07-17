import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { obligationPeriodKey } from "../../../../supabase/functions/_shared/obligation-period";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260716010000_command_center_security.sql");
const operationsHook = read("src/lib/operations/use-operations.ts");
const assistant = read("supabase/functions/ai-assistant/index.ts");
const todayPage = read("src/app/today/page.tsx");
const workspaceLanding = read("src/components/layout/workspace-landing.tsx");

describe("command-center security migration contract", () => {
  it("replaces all named-environment policy drift with scoped policies", () => {
    for (const table of [
      "obligations",
      "obligation_completions",
      "obligation_completion_audit_events",
      "daily_goals",
      "daily_steps",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("Managers and owners view obligations");
    expect(migration).toContain("owner_profile_id = (SELECT auth.uid())");
    expect(migration).toContain("backup_profile_id = (SELECT auth.uid())");
    expect(migration).not.toContain("FOR ALL TO authenticated");
  });

  it("makes completion a server-attributed, authorized, idempotent command", () => {
    expect(migration).toContain("FUNCTION public.can_execute_obligation(p_obligation_id UUID)");
    expect(migration).toContain("FUNCTION public.complete_operational_obligation(");
    expect(migration).toContain("v_actor UUID := (SELECT auth.uid())");
    expect(migration).toContain("public.can_execute_obligation(v_obligation.id)");
    expect(migration).toContain("ON CONFLICT (obligation_id, period) DO NOTHING");
    expect(migration).not.toContain("p_completed_by");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.obligation_completions FROM authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.complete_operational_obligation(UUID, TEXT, TEXT) TO authenticated");
  });

  it("validates every supported period-key shape", () => {
    expect(migration).toContain("v_obligation.cadence = 'weekly' AND p_period !~ '^W[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(migration).toContain("v_obligation.cadence = 'monthly' AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'");
    expect(migration).toContain("v_obligation.cadence = 'quarterly' AND p_period !~ '^[0-9]{4}-Q[1-4]$'");
    expect(migration).toContain("v_obligation.cadence = 'annual' AND p_period !~ '^[0-9]{4}$'");
  });

  it("preserves existing history and makes future correction auditable", () => {
    expect(migration).toContain("'baseline'");
    expect(migration).toContain("TO_JSONB(c)");
    expect(migration).toContain("trg_audit_obligation_completion_insert");
    expect(migration).toContain("trg_protect_obligation_completion_history");
    expect(migration).toContain("Obligation completion history is immutable");
    expect(migration).toContain("Only an active operations manager may correct");
    expect(migration).toContain("A correction reason is required");
    expect(migration).toContain("SET_CONFIG('app.obligation_void_reason', v_reason, TRUE)");
    expect(migration).toContain("completion_snapshot");
    expect(migration).toContain("Obligation completion audit events are append-only");
  });

  it("scopes My Day rows to the authenticated creator and owned parent goal", () => {
    expect(migration).toContain('CREATE POLICY "Creators view daily goals"');
    expect(migration).toContain('CREATE POLICY "Creators insert daily steps"');
    expect(migration).toContain("created_by = (SELECT auth.uid())");
    expect(migration).toContain("SELECT 1 FROM public.daily_goals g");
    expect(migration).toContain("g.id = daily_steps.goal_id");
    expect(migration).toContain("g.created_by = (SELECT auth.uid())");
  });
});

describe("command-center callers", () => {
  it("uses RPCs instead of raw completion writes in the operations hook", () => {
    expect(operationsHook).toContain('"complete_operational_obligation"');
    expect(operationsHook).toContain('"void_operational_obligation_completion"');
    expect(operationsHook).not.toContain("directInsertRow");
    expect(operationsHook).not.toContain("directDeleteByFilter");
    expect(operationsHook).not.toContain("completed_by: profile");
  });

  it("only offers correction to database-aligned manager roles and requires a reason", () => {
    expect(operationsHook).toContain('["super", "asst_super", "director", "gm"]');
    expect(operationsHook).toContain("canUndoObligations");
    expect(workspaceLanding).toContain("ops.canUndoObligations");
    expect(workspaceLanding).toContain("Why is this completion being corrected?");
    expect(workspaceLanding).toContain("if (!reason) return");
    expect(todayPage).toContain('redirect("/operations")');
  });

  it("keeps the assistant on the same command and weekly-key convention", () => {
    expect(assistant).toContain('import { obligationPeriodKey } from "../_shared/obligation-period.ts"');
    expect(assistant).toContain('obligationPeriodKey("weekly", now)');
    expect(assistant).toContain('supabase.rpc("complete_operational_obligation"');
    expect(assistant).not.toContain('.from("obligation_completions").insert');
    expect(assistant).toContain("due_weekday");
  });
});

describe("assistant obligation period boundary", () => {
  it("does not roll the facility week while it is still Saturday in Chicago", () => {
    expect(obligationPeriodKey("weekly", new Date("2026-07-19T04:30:00Z")))
      .toBe("W2026-07-12");
    expect(obligationPeriodKey("weekly", new Date("2026-07-19T05:30:00Z")))
      .toBe("W2026-07-19");
  });

  it("uses facility calendar dates through the DST transition", () => {
    expect(obligationPeriodKey("weekly", new Date("2026-03-08T05:30:00Z")))
      .toBe("W2026-03-01");
    expect(obligationPeriodKey("weekly", new Date("2026-03-08T06:30:00Z")))
      .toBe("W2026-03-08");
  });

  it("keeps monthly, quarterly, and annual keys on the facility side of New Year", () => {
    const chicagoNewYearsEve = new Date("2027-01-01T05:30:00Z");
    expect(obligationPeriodKey("monthly", chicagoNewYearsEve)).toBe("2026-12");
    expect(obligationPeriodKey("quarterly", chicagoNewYearsEve)).toBe("2026-Q4");
    expect(obligationPeriodKey("annual", chicagoNewYearsEve)).toBe("2026");
  });
});
