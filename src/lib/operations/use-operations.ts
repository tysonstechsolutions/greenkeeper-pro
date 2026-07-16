"use client";

// Data hook for the operating rhythm: obligations + completions + weekly
// duties + today's duty check-offs. Uses the app's direct REST helpers
// (offline-aware, lock-free) like the other feature hooks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  directRpc,
  directSelectAll,
} from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  assignmentForDate,
  dutiesForTodayFromOccurrences,
} from "./duties";
import {
  evaluateObligations,
  periodKey,
  ymdLocal,
} from "./engine";
import type {
  DutyCompletion,
  DutyAssignment,
  DutyTaskOccurrence,
  DutyTodayItem,
  EvaluatedObligation,
  Obligation,
  ObligationCompletion,
  OperationDuty,
} from "./types";

export interface UseOperations {
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** All active obligations evaluated against today, display-sorted. */
  evaluated: EvaluatedObligation[];
  /** Duties that run today, with per-duty done state. */
  dutiesToday: DutyTodayItem[];
  allDuties: OperationDuty[];
  /** UI guard aligned to the database's daily-operations management roles. */
  canUndoObligations: boolean;
  completeObligation: (e: EvaluatedObligation, note?: string) => Promise<void>;
  /** Correct a completion through the audited manager-only command. */
  uncompleteObligation: (obligationId: string, period: string, reason: string) => Promise<void>;
  toggleDuty: (dutyId: string, done: boolean) => Promise<void>;
  transitionDuty: (
    dutyId: string,
    status: "in_progress" | "completed" | "blocked" | "verified",
    blockedReason?: string,
  ) => Promise<boolean>;
  today: string;
}

export function useOperations(): UseOperations {
  const { session, profile } = useAuth();
  const ready = !!session?.access_token;
  const canUndoObligations = !!profile?.is_active
    && ["super", "asst_super", "director", "gm"].includes(profile.role);

  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [completions, setCompletions] = useState<ObligationCompletion[]>([]);
  const [duties, setDuties] = useState<OperationDuty[]>([]);
  const [dutyDone, setDutyDone] = useState<DutyCompletion[]>([]);
  const [dutyAssignments, setDutyAssignments] = useState<DutyAssignment[]>([]);
  const [dutyOccurrences, setDutyOccurrences] = useState<DutyTaskOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // The kiosk stays open across midnight — track the local date and refetch
  // when it flips so duties/obligations never show yesterday's plan.
  const [today, setToday] = useState(() => ymdLocal(new Date()));
  useEffect(() => {
    const tick = setInterval(() => {
      const d = ymdLocal(new Date());
      setToday((prev) => {
        if (prev !== d) setNonce((n) => n + 1);
        return d;
      });
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [obs, comps, duts, done] = await Promise.all([
          directSelectAll<Obligation>("obligations", {
            columns: "*",
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "sort_order", ascending: true }, { column: "id" }],
            label: "operations.obligations",
          }),
          // Completions are one row per obligation per period — the table
          // grows by ~obligation-count rows a month, so fetching the recent
          // window is plenty.
          directSelectAll<ObligationCompletion>("obligation_completions", {
            columns: "*",
            orderBy: [{ column: "completed_at", ascending: false }, { column: "id" }],
            label: "operations.completions",
          }),
          directSelectAll<OperationDuty>("operation_duties", {
            columns: "*",
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "sort_order", ascending: true }, { column: "id" }],
            label: "operations.duties",
          }),
          directSelectAll<DutyCompletion>("duty_completions", {
            columns: "*",
            filters: [`duty_date=eq.${ymdLocal(new Date())}`],
            orderBy: [{ column: "id" }],
            label: "operations.dutyDone",
          }),
        ]);
        if (cancelled) return;
        setObligations(obs);
        setCompletions(comps);
        setDuties(duts);
        setDutyDone(done);

        // Phase 1A ownership/occurrence reads are isolated so the Today page
        // remains usable during a migration rollout.
        try {
          const [assignmentRows, occurrenceRows] = await Promise.all([
            directSelectAll<DutyAssignment>("duty_assignments", {
              columns:
                "*,primary:profiles!duty_assignments_primary_profile_id_fkey(id,full_name,role,department,role_group)," +
                "backup:profiles!duty_assignments_backup_profile_id_fkey(id,full_name,role,department,role_group)," +
                "contractor:vendors!duty_assignments_contractor_vendor_id_fkey(id,name,company)",
              filters: [
                `effective_from=lte.${today}`,
              ],
              or: `effective_through.is.null,effective_through.gte.${today}`,
              orderBy: [{ column: "effective_from", ascending: false }, { column: "id" }],
              label: "operations.dutyAssignments",
            }),
            directSelectAll<DutyTaskOccurrence>("tasks", {
              columns:
                "id,duty_id,duty_assignment_id,series_id,occurrence_key,original_due_date," +
                "duty_coverage_id,duty_recurrence_version_id,due_date,assigned_to,status," +
                "completed_at,completed_by,verified_at,verified_by,duty_department,duty_role_group," +
                "duty_recurrence_rule,duty_instructions,estimated_minutes,equipment_needed," +
                "duty_evidence_requirements,duty_evidence_requirement_state," +
                "duty_verification_requirement_state,duty_equipment_requirement_state," +
                "duty_owner_type,duty_primary_profile_id,duty_backup_profile_id," +
                "duty_contractor_vendor_id,duty_primary_name,duty_backup_name," +
                "duty_contractor_name,blocked_reason",
              filters: [
                "duty_id=not.is.null",
                `due_date=eq.${today}`,
                "status=not.eq.cancelled",
              ],
              orderBy: [{ column: "due_date" }, { column: "id" }],
              label: "operations.dutyOccurrences",
            }),
          ]);
          if (!cancelled) {
            setDutyAssignments(assignmentRows);
            const evidenceRows = occurrenceRows.length > 0
              ? await directRpc<{ task_id: string; evidence_satisfied: boolean }[]>(
                  "get_task_execution_requirements",
                  { p_task_ids: occurrenceRows.map((row) => row.id) },
                  "operations.evidenceStatus",
                )
              : [];
            const evidenceByTask = new Map(evidenceRows.map((row) => [row.task_id, row.evidence_satisfied]));
            setDutyOccurrences(occurrenceRows.map((row) => ({
              ...row,
              duty_evidence_satisfied: evidenceByTask.get(row.id) ?? null,
            })));
          }
        } catch {
          if (!cancelled) {
            setDutyAssignments([]);
            setDutyOccurrences([]);
          }
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, nonce, today]);

  // `today` is deliberately in these deps: it's not read inside, but its
  // midnight flip is what forces re-evaluation against the new date.
  const evaluated = useMemo(
    () => evaluateObligations(obligations, completions, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obligations, completions, today],
  );

  const dutiesToday = useMemo(() => {
    // Filter by duty_date too: after the midnight tick, yesterday's rows are
    // still in state until the refetch lands — they must not check off the
    // new day's list.
    const doneIds = new Set(
      dutyDone.filter((d) => d.duty_date === today).map((d) => d.duty_id),
    );
    const todayDuties = dutiesForTodayFromOccurrences(duties, dutyOccurrences, today);
    return todayDuties.map((duty): DutyTodayItem => {
      const occurrence = dutyOccurrences.find((item) => item.duty_id === duty.id) ?? null;
      const assignment = occurrence?.duty_assignment_id
        ? dutyAssignments.find((item) => item.id === occurrence.duty_assignment_id) ?? null
        : assignmentForDate(dutyAssignments, duty.id, today);
      return {
        duty,
        occurrence,
        assignment,
        done: occurrence
          ? occurrence.status === "completed" || occurrence.status === "verified"
          : doneIds.has(duty.id),
        primaryName: assignment?.primary?.full_name ?? null,
        backupName: assignment?.backup?.full_name ?? null,
        contractorName: assignment?.contractor?.name ?? null,
      };
    });
  }, [duties, dutyDone, dutyOccurrences, dutyAssignments, today]);

  // In-flight guards: a double-tap must not fire a second insert for the
  // same row (the UNIQUE constraints would 409) or race a delete.
  const busyObligations = useRef(new Set<string>());
  const busyDuties = useRef(new Set<string>());

  const completeObligation = useCallback(
    async (e: EvaluatedObligation, note?: string) => {
      const key = `${e.obligation.id}:${e.period}`;
      if (busyObligations.current.has(key)) return;
      busyObligations.current.add(key);
      try {
        const row = await directRpc<ObligationCompletion>(
          "complete_operational_obligation",
          {
            p_obligation_id: e.obligation.id,
            p_period: e.period,
            p_note: note ?? null,
          },
          "operations.complete",
        );
        setCompletions((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
        setError(null);
      } catch (err) {
        // Resync because the idempotent command may have committed before a
        // transport failure reached the browser.
        setError(err instanceof Error ? err.message : String(err));
        reload();
      } finally {
        busyObligations.current.delete(key);
      }
    },
    [reload],
  );

  const uncompleteObligation = useCallback(
    async (obligationId: string, period: string, reason: string) => {
      const key = `${obligationId}:${period}`;
      if (busyObligations.current.has(key)) return;
      busyObligations.current.add(key);
      try {
        await directRpc<string>(
          "void_operational_obligation_completion",
          {
            p_obligation_id: obligationId,
            p_period: period,
            p_reason: reason,
          },
          "operations.uncomplete",
        );
        setCompletions((prev) =>
          prev.filter((c) => !(c.obligation_id === obligationId && c.period === period)),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        reload();
      } finally {
        busyObligations.current.delete(key);
      }
    },
    [reload],
  );

  const transitionDuty = useCallback(
    async (
      dutyId: string,
      status: "in_progress" | "completed" | "blocked" | "verified",
      blockedReason?: string,
    ): Promise<boolean> => {
      if (busyDuties.current.has(dutyId)) return false;
      busyDuties.current.add(dutyId);
      try {
        const occurrence = dutyOccurrences.find((item) => item.duty_id === dutyId) ?? null;
        if (!occurrence) throw new Error("This duty has no executable task occurrence for today.");
        const updated = await directRpc<DutyTaskOccurrence>("transition_task_status", {
          p_task_id: occurrence.id,
          p_status: status,
          p_blocked_reason: status === "blocked" ? blockedReason?.trim() || null : null,
        }, "operations.transitionDuty");
        setDutyOccurrences((previous) => previous.map((item) => item.id === occurrence.id ? { ...item, ...updated } : item));
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        reload();
        return false;
      } finally {
        busyDuties.current.delete(dutyId);
      }
    },
    [dutyOccurrences, reload],
  );

  const toggleDuty = useCallback(async (dutyId: string, done: boolean) => {
    if (!done) {
      setError("Completed duty work cannot be reopened from Today. Open the task for manager review.");
      return;
    }
    await transitionDuty(dutyId, "completed");
  }, [transitionDuty]);

  return {
    loading,
    error,
    reload,
    evaluated,
    dutiesToday,
    allDuties: duties,
    canUndoObligations,
    completeObligation,
    uncompleteObligation,
    toggleDuty,
    transitionDuty,
    today,
  };
}

/** Current period key for an evaluated obligation — exported for UI labels. */
export { periodKey };
