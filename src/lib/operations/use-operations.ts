"use client";

// Data hook for the operating rhythm: obligations + completions + weekly
// duties + today's duty check-offs. Uses the app's direct REST helpers
// (offline-aware, lock-free) like the other feature hooks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  directDeleteByFilter,
  directInsertRow,
  directSelectList,
} from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  dutiesForDate,
  evaluateObligations,
  periodKey,
  ymdLocal,
} from "./engine";
import type {
  DutyCompletion,
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
  dutiesToday: { duty: OperationDuty; done: boolean }[];
  allDuties: OperationDuty[];
  completeObligation: (e: EvaluatedObligation, note?: string) => Promise<void>;
  /** Undo a completion recorded for the given period. */
  uncompleteObligation: (obligationId: string, period: string) => Promise<void>;
  toggleDuty: (dutyId: string, done: boolean) => Promise<void>;
  today: string;
}

export function useOperations(): UseOperations {
  const { session, profile } = useAuth();
  const ready = !!session?.access_token;

  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [completions, setCompletions] = useState<ObligationCompletion[]>([]);
  const [duties, setDuties] = useState<OperationDuty[]>([]);
  const [dutyDone, setDutyDone] = useState<DutyCompletion[]>([]);
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
          directSelectList<Obligation>("obligations", {
            columns: "*",
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "sort_order", ascending: true }],
            limit: 200,
            label: "operations.obligations",
          }),
          // Completions are one row per obligation per period — the table
          // grows by ~obligation-count rows a month, so fetching the recent
          // window is plenty.
          directSelectList<ObligationCompletion>("obligation_completions", {
            columns: "*",
            orderBy: [{ column: "completed_at", ascending: false }],
            limit: 500,
            label: "operations.completions",
          }),
          directSelectList<OperationDuty>("operation_duties", {
            columns: "*",
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "sort_order", ascending: true }],
            limit: 200,
            label: "operations.duties",
          }),
          directSelectList<DutyCompletion>("duty_completions", {
            columns: "*",
            filters: [`duty_date=eq.${ymdLocal(new Date())}`],
            limit: 200,
            label: "operations.dutyDone",
          }),
        ]);
        if (cancelled) return;
        setObligations(obs);
        setCompletions(comps);
        setDuties(duts);
        setDutyDone(done);
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
  }, [ready, nonce]);

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
    return dutiesForDate(duties, new Date()).map((duty) => ({
      duty,
      done: doneIds.has(duty.id),
    }));
  }, [duties, dutyDone, today]);

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
        const row = await directInsertRow<ObligationCompletion>(
          "obligation_completions",
          {
            obligation_id: e.obligation.id,
            period: e.period,
            completed_by: profile?.id ?? null,
            note: note ?? null,
          },
          "operations.complete",
        );
        setCompletions((prev) => [row, ...prev]);
      } catch (err) {
        // Resync — the row may exist already (409) or the write failed.
        setError(err instanceof Error ? err.message : String(err));
        reload();
      } finally {
        busyObligations.current.delete(key);
      }
    },
    [profile?.id, reload],
  );

  const uncompleteObligation = useCallback(
    async (obligationId: string, period: string) => {
      const key = `${obligationId}:${period}`;
      if (busyObligations.current.has(key)) return;
      busyObligations.current.add(key);
      try {
        await directDeleteByFilter(
          "obligation_completions",
          [`obligation_id=eq.${obligationId}`, `period=eq.${encodeURIComponent(period)}`],
          "operations.uncomplete",
        );
        setCompletions((prev) =>
          prev.filter((c) => !(c.obligation_id === obligationId && c.period === period)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        reload();
      } finally {
        busyObligations.current.delete(key);
      }
    },
    [reload],
  );

  const toggleDuty = useCallback(
    async (dutyId: string, done: boolean) => {
      if (busyDuties.current.has(dutyId)) return;
      busyDuties.current.add(dutyId);
      try {
        const date = ymdLocal(new Date());
        if (done) {
          const row = await directInsertRow<DutyCompletion>(
            "duty_completions",
            { duty_id: dutyId, duty_date: date, completed_by: profile?.id ?? null },
            "operations.dutyCheck",
          );
          setDutyDone((prev) => [...prev, row]);
        } else {
          await directDeleteByFilter(
            "duty_completions",
            [`duty_id=eq.${dutyId}`, `duty_date=eq.${date}`],
            "operations.dutyUncheck",
          );
          setDutyDone((prev) => prev.filter((d) => !(d.duty_id === dutyId && d.duty_date === date)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        reload();
      } finally {
        busyDuties.current.delete(dutyId);
      }
    },
    [profile?.id, reload],
  );

  return {
    loading,
    error,
    reload,
    evaluated,
    dutiesToday,
    allDuties: duties,
    completeObligation,
    uncompleteObligation,
    toggleDuty,
    today,
  };
}

/** Current period key for an evaluated obligation — exported for UI labels. */
export { periodKey };
