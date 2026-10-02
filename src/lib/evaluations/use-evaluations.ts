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
import type { EngagementProfileRow, OneOnOneSession } from "@/lib/oneonone/types";
import type { StaffConcern, StaffRecord } from "@/lib/staff/types";
import type { StaffPersonnelPrivate, UserRole } from "@/types/database";
import { evaluationProgress } from "./compose";
import { applyCrewRating, applyCrewSupervisory, defaultSupervisory, type CrewMember } from "./crew";
import { buildFacts } from "./facts";
import { FORM_VERSION } from "./form";
import { applicableRatings } from "./questions";
import { buildSuggestions, emptySuggestions, type EvaluationSuggestions } from "./suggestions";
import {
  isRatingValue,
  type EvaluationFacts,
  type EvaluationPeriod,
  type EvaluationProgress,
  type RatingValue,
  type StaffEvaluation,
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
  Pick<
    StaffEvaluation,
    | "rating_reason"
    | "supervisory"
    | "ratings"
    | "overall_rating"
    | "awards"
    | "answers"
    | "narrative"
    | "facts"
    | "status"
  >
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
  const [suggestions, setSuggestions] = useState<EvaluationSuggestions>(emptySuggestions());
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
      const [profile, personnel, row, records, sessions, concerns, engagement] = await Promise.all([
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
        directSelectRow<EngagementProfileRow>(
          "staff_engagement_profiles",
          "employee_id",
          employeeId,
          "employee_id,profile",
          "evaluations.engagement",
        ).catch(() => null),
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
      setSuggestions(buildSuggestions({ period, sessions, engagement: engagement?.profile ?? null }));
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

  return { employee, evaluation, facts, suggestions, loadedFor, loading, error, reload: load, save };
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

export type CrewSaveState = "saving" | "saved" | "error";

/**
 * The crew-at-once rating screen. Shows every non-final person on the roster
 * with their current ratings; each change saves on its own (creating the
 * evaluation the first time). Saves for one person run in order, so quick
 * taps can't race into a duplicate insert, and each save sends that person's
 * latest full ratings so later taps always win.
 */
export function useCrewRatings(
  period: EvaluationPeriod,
  viewer: { id: string | null; isManager: boolean },
) {
  const roster = useEvaluationRoster(period, viewer);
  const [members, setMembers] = useState<Record<string, CrewMember>>({});
  const [saveState, setSaveState] = useState<Record<string, CrewSaveState>>({});
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  // Rows created/updated by this screen (the roster's copy goes stale).
  const rowsRef = useRef<Record<string, StaffEvaluation>>({});
  const queuesRef = useRef<Record<string, Promise<unknown>>>({});
  const seqRef = useRef<Record<string, number>>({});

  // Seed local state from the roster once it loads (render-time sync).
  const editable = roster.entries.filter((e) => e.progress !== "final");
  if (!roster.loading && !roster.error && initializedFor !== period.start) {
    setInitializedFor(period.start);
    const allProfiles = roster.entries.map((e) => e.profile);
    const seeded: Record<string, CrewMember> = {};
    for (const e of editable) {
      const ev = e.evaluation;
      seeded[e.profile.id] = {
        ratings: ev?.ratings ?? {},
        supervisory: ev ? !!ev.supervisory : defaultSupervisory(e.profile, allProfiles),
        overall: ev && isRatingValue(ev.overall_rating) ? ev.overall_rating : null,
      };
    }
    setMembers(seeded);
    setSaveState({});
  }

  const persist = useCallback(
    (employeeId: string, member: CrewMember) => {
      const seq = (seqRef.current[employeeId] ?? 0) + 1;
      seqRef.current[employeeId] = seq;
      setSaveState((s) => ({ ...s, [employeeId]: "saving" }));
      const rosterRow = roster.entries.find((e) => e.profile.id === employeeId)?.evaluation ?? null;
      const run = async () => {
        const values = {
          supervisory: member.supervisory,
          ratings: applicableRatings(member.ratings, member.supervisory),
          overall_rating: member.overall,
        };
        const current = rowsRef.current[employeeId] ?? rosterRow;
        const next = current
          ? await directPatchRowReturning<StaffEvaluation>(TABLE, "id", current.id, values, "evaluations.crew.patch")
          : await directInsertRow<StaffEvaluation>(
              TABLE,
              {
                employee_id: employeeId,
                period_start: period.start,
                period_end: period.end,
                period_label: period.label,
                form_version: FORM_VERSION,
                ...values,
              },
              "evaluations.crew.insert",
            );
        if (!next) throw new Error("The rating could not be saved.");
        rowsRef.current[employeeId] = next;
      };
      const previous = queuesRef.current[employeeId] ?? Promise.resolve();
      const result = previous.then(run, run);
      queuesRef.current[employeeId] = result.catch(() => undefined);
      // Only the newest save for a person decides their indicator.
      const settle = (state: CrewSaveState) => {
        if (seqRef.current[employeeId] === seq) setSaveState((s) => ({ ...s, [employeeId]: state }));
      };
      result.then(
        () => settle("saved"),
        () => settle("error"),
      );
    },
    [roster.entries, period.start, period.end, period.label],
  );

  const update = useCallback(
    (employeeId: string, change: (m: CrewMember) => CrewMember) => {
      const member = members[employeeId];
      if (!member) return;
      const next = change(member);
      setMembers({ ...members, [employeeId]: next });
      persist(employeeId, next);
    },
    [members, persist],
  );

  const rate = useCallback(
    (employeeId: string, elementKey: string, value: RatingValue) =>
      update(employeeId, (m) => applyCrewRating(m, elementKey, value)),
    [update],
  );

  const setSupervisory = useCallback(
    (employeeId: string, supervisory: boolean) =>
      update(employeeId, (m) => applyCrewSupervisory(m, supervisory)),
    [update],
  );

  return {
    loading: roster.loading || initializedFor !== period.start,
    error: roster.error,
    people: editable
      .filter((e) => members[e.profile.id])
      .map((e) => ({ profile: e.profile, member: members[e.profile.id] })),
    finalCount: roster.entries.length - editable.length,
    saveState,
    rate,
    setSupervisory,
  };
}
