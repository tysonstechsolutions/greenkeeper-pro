"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  directInsertRow,
  directPatchRowReturning,
  directSelectList,
  directSelectRow,
  directStorageUpload,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { OneOnOneSession } from "@/lib/oneonone/types";
import type { StaffConcern, StaffRecord } from "@/lib/staff/types";
import type { StaffPersonnelPrivate, UserRole } from "@/types/database";
import { evaluationProgress } from "./compose";
import { buildFacts } from "./facts";
import { FORM_VERSION } from "./form";
import type {
  EvaluationFacts,
  EvaluationPeriod,
  EvaluationProgress,
  StaffEvaluation,
} from "./types";

const TABLE = "staff_evaluations";

export interface RosterProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean | null;
  supervisor_id: string | null;
}

export interface RosterEntry {
  profile: RosterProfile;
  evaluation: StaffEvaluation | null;
  progress: EvaluationProgress;
}

/** Order the roster by what still needs doing, then by name. */
const PROGRESS_ORDER: Record<EvaluationProgress, number> = {
  in_progress: 0,
  not_started: 1,
  ready: 2,
  final: 3,
};

/**
 * Everyone who needs an evaluation this period, and where each one stands.
 * Managers see every active employee; a supervisor sees their direct reports.
 * The signed-in user is never on their own list.
 */
export function useEvaluationRoster(
  period: EvaluationPeriod,
  viewer: { id: string | null; isManager: boolean },
) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profiles, evaluations] = await Promise.all([
        directSelectList<RosterProfile>("profiles", {
          columns: "id,full_name,role,is_active,supervisor_id",
          orderBy: [{ column: "full_name", ascending: true }],
          label: "evaluations.roster.profiles",
        }),
        directSelectList<StaffEvaluation>(TABLE, {
          filters: [`period_start=eq.${period.start}`],
          label: "evaluations.roster.evaluations",
        }),
      ]);
      const byEmployee = new Map(evaluations.map((e) => [e.employee_id, e]));
      const list = profiles
        .filter((p) => p.is_active !== false && p.id !== viewer.id)
        .filter((p) => viewer.isManager || (viewer.id !== null && p.supervisor_id === viewer.id))
        .map((profile) => {
          const evaluation = byEmployee.get(profile.id) ?? null;
          return { profile, evaluation, progress: evaluationProgress(evaluation) };
        })
        .sort(
          (a, b) =>
            PROGRESS_ORDER[a.progress] - PROGRESS_ORDER[b.progress] ||
            (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? ""),
        );
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load evaluations.");
    } finally {
      setLoading(false);
    }
  }, [period.start, viewer.id, viewer.isManager]);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, loading, error, reload: load };
}

export interface EvaluationEmployee {
  id: string;
  full_name: string;
  role: UserRole;
  supervisor_id: string | null;
  personnel: Pick<StaffPersonnelPrivate, "hire_date" | "certifications" | "personnel_details"> | null;
}

export type EvaluationPatch = Partial<
  Pick<StaffEvaluation, "ratings" | "overall_rating" | "answers" | "narrative" | "facts" | "status">
>;

/**
 * One employee's evaluation for a period, plus the facts the app knows about
 * them. `save` creates the row on first write and patches it after; saves
 * run one at a time so quick autosaves can't race into a duplicate insert.
 */
export function useEvaluation(employeeId: string, period: EvaluationPeriod) {
  const [employee, setEmployee] = useState<EvaluationEmployee | null>(null);
  const [evaluation, setEvaluation] = useState<StaffEvaluation | null>(null);
  const [facts, setFacts] = useState<EvaluationFacts | null>(null);
  // "<employeeId>|<period start>" the loaded data belongs to, so the editor
  // never shows one employee's answers while the next one is loading.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowRef = useRef<StaffEvaluation | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      // Records, 1:1s, and follow-ups are supporting facts — a supervisor who
      // isn't a manager can't read staff_records, so a failure there just
      // means fewer facts, never a broken page.
      const optional = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
      const [profile, personnel, row, records, sessions, concerns] = await Promise.all([
        directSelectRow<Omit<EvaluationEmployee, "personnel">>(
          "profiles",
          "id",
          employeeId,
          "id,full_name,role,supervisor_id",
          "evaluations.employee.profile",
        ),
        directSelectRow<EvaluationEmployee["personnel"]>(
          "staff_personnel_private",
          "employee_id",
          employeeId,
          "hire_date,certifications,personnel_details",
          "evaluations.employee.personnel",
        ).catch(() => null),
        directSelectList<StaffEvaluation>(TABLE, {
          filters: [`employee_id=eq.${employeeId}`, `period_start=eq.${period.start}`],
          limit: 1,
          label: "evaluations.row",
        }).then((rows) => rows[0] ?? null),
        optional(
          directSelectList<StaffRecord>("staff_records", {
            filters: [`employee_id=eq.${employeeId}`],
            label: "evaluations.records",
          }),
        ),
        optional(
          directSelectList<OneOnOneSession>("staff_one_on_one_sessions", {
            filters: [`employee_id=eq.${employeeId}`],
            orderBy: [{ column: "session_date", ascending: false }],
            label: "evaluations.sessions",
          }),
        ),
        optional(
          directSelectList<StaffConcern>("staff_concerns", {
            filters: [`employee_id=eq.${employeeId}`],
            label: "evaluations.concerns",
          }),
        ),
      ]);
      if (!profile) throw new Error("Employee not found.");
      setEmployee({ ...profile, personnel: personnel ?? null });
      setEvaluation(row);
      rowRef.current = row;
      setFacts(
        buildFacts({
          period,
          hireDate: personnel?.hire_date ?? null,
          personnel: personnel?.personnel_details ?? null,
          certifications: personnel?.certifications ?? null,
          records,
          sessions,
          concerns,
        }),
      );
      setLoadedFor(`${employeeId}|${period.start}`);
    } catch (e) {
      setLoadedFor(null);
      setError(e instanceof Error ? e.message : "Failed to load the evaluation.");
    } finally {
      setLoading(false);
    }
    // period is identified by its start date
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, period.start]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    (patch: EvaluationPatch): Promise<StaffEvaluation> => {
      const run = async () => {
        const current = rowRef.current;
        let next: StaffEvaluation | null;
        if (!current) {
          next = await directInsertRow<StaffEvaluation>(
            TABLE,
            {
              employee_id: employeeId,
              period_start: period.start,
              period_end: period.end,
              period_label: period.label,
              form_version: FORM_VERSION,
              ...patch,
            },
            "evaluations.insert",
          );
        } else {
          next = await directPatchRowReturning<StaffEvaluation>(
            TABLE,
            "id",
            current.id,
            patch,
            "evaluations.patch",
          );
        }
        if (!next) throw new Error("The evaluation could not be saved.");
        rowRef.current = next;
        setEvaluation(next);
        return next;
      };
      // Chain onto the previous save whether it succeeded or not.
      const result = queueRef.current.then(run, run);
      queueRef.current = result.catch(() => undefined);
      return result;
    },
    [employeeId, period.start, period.end, period.label],
  );

  return { employee, evaluation, facts, loadedFor, loading, error, reload: load, save };
}

/**
 * File a finished evaluation PDF on the employee's profile (Documents →
 * Performance Review) in the private staff-documents bucket. Best-effort:
 * returns false instead of throwing, so the GM's download never fails
 * because filing a copy did.
 */
export async function fileEvaluationPdf(args: {
  employeeId: string;
  blob: Blob;
  filename: string;
  title: string;
}): Promise<boolean> {
  try {
    const path = `${args.employeeId}/${Date.now()}-${args.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const file = new File([args.blob], args.filename, { type: "application/pdf" });
    await directStorageUpload("staff-documents", path, file, "evaluations.file.upload");
    await directInsertRow(
      "staff_documents",
      {
        employee_id: args.employeeId,
        name: args.title,
        category: "review",
        storage_path: path,
        url: null,
        file_type: "application/pdf",
        uploaded_by: getCachedUserId(),
      },
      "evaluations.file.insert",
    );
    return true;
  } catch {
    return false;
  }
}
