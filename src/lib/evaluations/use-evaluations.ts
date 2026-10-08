"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  directInsertRow,
  directPatchRow,
  directPatchRowReturning,
  directSelectList,
  directSelectRow,
  directStorageUpload,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { EngagementProfileRow, OneOnOneSession } from "@/lib/oneonone/types";
import type { StaffConcern, StaffRecord } from "@/lib/staff/types";
import type { StaffPersonnelPrivate, UserRole } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";
import { deactivateDepartedStaff } from "@/lib/staff/separation";
import { isFbStaff } from "@/lib/auth/fb-manager";
import { departuresByEmployee, loadSf52Files, type Departure } from "@/lib/staff/sf52-files";
import { evaluationProgress } from "./compose";
import { applyCrewRating, applyCrewSupervisory, defaultSupervisory, type CrewMember } from "./crew";
import { buildFacts } from "./facts";
import { FORM_VERSION } from "./form";
import {
  addDays,
  dueStatus,
  employedLongEnough,
  isIsoDate,
  NEW_HIRE_DAYS,
  needsAnnualEvaluation,
  ninetyDayTiming,
  yearEndDueDate,
  type DueStatus,
} from "./period";
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
  department?: string | null;
}

/**
 * Who is looking. Managers see every active employee; the F&B Manager sees
 * the Food & Beverage staff; anyone else sees their direct reports.
 */
export interface EvaluationViewer {
  id: string | null;
  isManager: boolean;
  isFbManager?: boolean;
}

export interface RosterEntry {
  profile: RosterProfile;
  evaluation: StaffEvaluation | null;
  progress: EvaluationProgress;
  /** When the year-end evaluation is due (Oct 31 for an FY ending Sep 30). */
  dueDate: string;
  /** Overdue / due soon / upcoming; null once it's final. */
  due: DueStatus | null;
}

/** Someone whose 90-day evaluation is due or overdue. */
export interface NinetyDayEntry {
  profile: RosterProfile;
  hireDate: string;
  /** The 90-day mark (hire date + 90 days), when it's due. */
  dueDate: string;
  /** Overdue / due soon (today); null once it's final. */
  due: DueStatus | null;
  evaluation: StaffEvaluation | null;
  progress: EvaluationProgress;
}

/** Overdue first, then due soon, upcoming, and finished last. */
const DUE_ORDER = (d: DueStatus | null): number =>
  d === "overdue" ? 0 : d === "due_soon" ? 1 : d === "upcoming" ? 2 : 3;

/** Left off the yearly list: hired fewer than 90 days before the period ended. */
export interface NotDueEntry {
  profile: RosterProfile;
  hireDate: string;
}

/** Taken off the evaluation lists: a resignation or transfer SF-52 is on file. */
export interface DepartingEntry {
  profile: RosterProfile;
  action: Departure["action"];
  /** When the SF-52 was filed. */
  uploadedAt: string;
}

/** Which evaluation an editor or query is about. */
export type EvaluationKind = "annual" | "ninety_day";

/** PostgREST filter that keeps one kind of evaluation row. */
export function kindFilter(kind: EvaluationKind): string {
  return kind === "ninety_day" ? "rating_reason=eq.ninety_day" : "rating_reason=neq.ninety_day";
}

/** Order the roster by what still needs doing, then by name. */
const PROGRESS_ORDER: Record<EvaluationProgress, number> = {
  in_progress: 0,
  not_started: 1,
  ready: 2,
  final: 3,
};

interface RosterSplitInput {
  profiles: RosterProfile[];
  annual: StaffEvaluation[];
  ninetyDay: StaffEvaluation[];
  hireDates: Map<string, string | null>;
  /** False when the viewer couldn't read hire dates (then nobody is flagged as missing one). */
  hireDatesKnown?: boolean;
  /** People with a resignation or transfer SF-52 on file (see lib/staff/sf52-files). */
  departures?: Map<string, Departure>;
  period: EvaluationPeriod;
  viewer: EvaluationViewer;
  todayIso: string;
}

/**
 * Sort everyone the viewer evaluates into the yearly list, the 90-day list,
 * and the "not due this year" note. Pure, for testing.
 * - Nobody shows until they've been employed 90 days (an evaluation that was
 *   already started always shows).
 * - Yearly: active staff, except people hired fewer than 90 days before the
 *   period ended. They get only the 90-day evaluation, even if a yearly one
 *   was started for them (a finished one still shows as finished). Due Oct 31
 *   (period end + 31 days).
 * - 90-day: due on the 90-day mark, overdue from the next day; shown until
 *   90 days past the mark, and any unfinished 90-day evaluation.
 * - A resignation or transfer SF-52 on file (see lib/staff/sf52-files) takes
 *   the person off both lists, except an evaluation that's already final.
 * - Anyone on the yearly list without a hire date is flagged, since the app
 *   can't tell whether they're new.
 */
export function splitRoster(input: RosterSplitInput): {
  entries: RosterEntry[];
  ninetyDay: NinetyDayEntry[];
  notDue: NotDueEntry[];
  departing: DepartingEntry[];
  missingHireDate: RosterProfile[];
} {
  const { period, viewer, todayIso } = input;
  const annualBy = new Map(input.annual.map((e) => [e.employee_id, e]));
  // Newest 90-day row per person.
  const ninetyBy = new Map<string, StaffEvaluation>();
  for (const e of input.ninetyDay) {
    const prev = ninetyBy.get(e.employee_id);
    if (!prev || e.created_at > prev.created_at) ninetyBy.set(e.employee_id, e);
  }

  const visible = input.profiles
    .filter((p) => p.is_active !== false && p.id !== viewer.id)
    .filter(
      (p) =>
        viewer.isManager ||
        (viewer.id !== null && p.supervisor_id === viewer.id) ||
        (!!viewer.isFbManager && isFbStaff(p)),
    );

  const yearEndDue = yearEndDueDate(period);
  const entries: RosterEntry[] = [];
  const notDue: NotDueEntry[] = [];
  const ninetyDay: NinetyDayEntry[] = [];
  const departing: DepartingEntry[] = [];
  const missingHireDate: RosterProfile[] = [];
  const hireDatesKnown = input.hireDatesKnown ?? true;
  for (const profile of visible) {
    const hireDate = input.hireDates.get(profile.id) ?? null;
    const evaluation = annualBy.get(profile.id) ?? null;
    const row = ninetyBy.get(profile.id) ?? null;
    const departure = input.departures?.get(profile.id) ?? null;
    if (departure) departing.push({ profile, action: departure.action, uploadedAt: departure.uploadedAt });
    // Too new to evaluate at all (unless someone already started one).
    if (!employedLongEnough(hireDate, todayIso) && !evaluation && !row) continue;

    const annualProgress = evaluationProgress(evaluation);
    if (annualProgress === "final" || needsAnnualEvaluation(hireDate, period)) {
      // Leaving: only a finished evaluation stays (as finished).
      if (!departure || annualProgress === "final") {
        entries.push({
          profile,
          evaluation,
          progress: annualProgress,
          dueDate: yearEndDue,
          due: annualProgress === "final" ? null : dueStatus(yearEndDue, todayIso),
        });
        if (hireDatesKnown && annualProgress !== "final" && !isIsoDate(hireDate)) missingHireDate.push(profile);
      }
    } else if (hireDate && hireDate <= period.end) {
      notDue.push({ profile, hireDate });
    }

    // A started 90-day evaluation keeps its own dates; otherwise use the hire date.
    const start = row?.period_start ?? hireDate;
    if (!start) continue;
    const timing = ninetyDayTiming(start, todayIso);
    if (timing || (row && row.status !== "final")) {
      const dueDate = row?.period_end ?? addDays(start, NEW_HIRE_DAYS);
      const progress = evaluationProgress(row);
      if (departure && progress !== "final") continue;
      ninetyDay.push({
        profile,
        hireDate: start,
        dueDate,
        due: progress === "final" ? null : dueStatus(dueDate, todayIso),
        evaluation: row,
        progress,
      });
    }
  }

  entries.sort(
    (a, b) =>
      DUE_ORDER(a.due) - DUE_ORDER(b.due) ||
      PROGRESS_ORDER[a.progress] - PROGRESS_ORDER[b.progress] ||
      (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? ""),
  );
  ninetyDay.sort(
    (a, b) =>
      DUE_ORDER(a.due) - DUE_ORDER(b.due) ||
      a.dueDate.localeCompare(b.dueDate) ||
      (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? ""),
  );
  const byName = (a: { full_name: string | null }, b: { full_name: string | null }) =>
    (a.full_name ?? "").localeCompare(b.full_name ?? "");
  notDue.sort((a, b) => byName(a.profile, b.profile));
  departing.sort((a, b) => byName(a.profile, b.profile));
  missingHireDate.sort(byName);
  return { entries, ninetyDay, notDue, departing, missingHireDate };
}

/** What a reset draft goes back to: blank, still a draft, same period. */
export const RESET_EVALUATION_PATCH = {
  ratings: {},
  overall_rating: null,
  awards: {},
  answers: {},
  narrative: {},
  facts: {},
} as const;

const isEmptyObject = (v: unknown) => !v || (typeof v === "object" && Object.keys(v as object).length === 0);

/**
 * Yearly evaluations started for people too new to get one (hired fewer than
 * 90 days before the period ended): unfinished drafts with anything in them.
 * They get reset to blank. Finished ones are never touched.
 */
export function newHireDraftsToReset(
  annual: StaffEvaluation[],
  hireDates: Map<string, string | null>,
  period: Pick<EvaluationPeriod, "end">,
): StaffEvaluation[] {
  return annual.filter((e) => {
    if (e.status === "final" || e.rating_reason === "ninety_day") return false;
    const hire = hireDates.get(e.employee_id) ?? null;
    if (!isIsoDate(hire) || needsAnnualEvaluation(hire, period)) return false;
    return !(
      isEmptyObject(e.ratings) &&
      isEmptyObject(e.answers) &&
      isEmptyObject(e.narrative) &&
      isEmptyObject(e.awards) &&
      isEmptyObject(e.facts) &&
      e.overall_rating == null
    );
  });
}

/**
 * Everyone who needs an evaluation this period, and where each one stands.
 * Managers see every active employee; a supervisor sees their direct reports.
 * The signed-in user is never on their own list. New hires are split off
 * into 90-day evaluations (see splitRoster).
 */
export function useEvaluationRoster(
  period: EvaluationPeriod,
  viewer: EvaluationViewer,
) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [ninetyDay, setNinetyDay] = useState<NinetyDayEntry[]>([]);
  const [notDue, setNotDue] = useState<NotDueEntry[]>([]);
  const [departing, setDeparting] = useState<DepartingEntry[]>([]);
  const [missingHireDate, setMissingHireDate] = useState<RosterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Someone whose resignation last day has passed is no longer evaluated.
      if (viewer.isManager) await deactivateDepartedStaff(todayLocal());
      let hireDatesKnown = true;
      const [profiles, annual, ninety, personnel, sf52Files] = await Promise.all([
        directSelectList<RosterProfile>("profiles", {
          columns: "id,full_name,role,is_active,supervisor_id,department",
          orderBy: [{ column: "full_name", ascending: true }],
          label: "evaluations.roster.profiles",
        }),
        directSelectList<StaffEvaluation>(TABLE, {
          filters: [`period_start=eq.${period.start}`, kindFilter("annual")],
          label: "evaluations.roster.evaluations",
        }),
        directSelectList<StaffEvaluation>(TABLE, {
          filters: [kindFilter("ninety_day")],
          label: "evaluations.roster.ninety_day",
        }),
        // Hire dates decide who's new. A supervisor who can't read them just
        // sees everyone on the yearly list, as before.
        directSelectList<Pick<StaffPersonnelPrivate, "employee_id" | "hire_date">>("staff_personnel_private", {
          columns: "employee_id,hire_date",
          label: "evaluations.roster.hire_dates",
        }).catch(() => {
          hireDatesKnown = false;
          return [];
        }),
        // Resignation / transfer SF-52s take people off; without access to them, nobody is.
        loadSf52Files().catch(() => []),
      ]);
      const hireDates = new Map(personnel.map((p) => [p.employee_id, p.hire_date]));
      // New hires get only the 90-day evaluation: blank any yearly draft
      // someone started for them (finished ones stay as they are).
      if (viewer.isManager && hireDatesKnown) {
        for (const e of newHireDraftsToReset(annual, hireDates, period)) {
          await directPatchRow(TABLE, "id", e.id, { ...RESET_EVALUATION_PATCH }, "evaluations.resetNewHire").catch(() => undefined);
        }
      }
      const split = splitRoster({
        profiles,
        annual,
        ninetyDay: ninety,
        hireDates,
        hireDatesKnown,
        departures: departuresByEmployee(sf52Files),
        period,
        viewer,
        todayIso: todayLocal(),
      });
      setEntries(split.entries);
      setNinetyDay(split.ninetyDay);
      setNotDue(split.notDue);
      setDeparting(split.departing);
      setMissingHireDate(split.missingHireDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load evaluations.");
    } finally {
      setLoading(false);
    }
    // period is identified by its start/end; viewer by id + manager flag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end, viewer.id, viewer.isManager, viewer.isFbManager]);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, ninetyDay, notDue, departing, missingHireDate, loading, error, reload: load };
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
    | "approved_on"
    | "discussed_on"
    | "copy_given_on"
  >
>;

/**
 * One employee's evaluation for a period, plus the facts the app knows about
 * them. `save` creates the row on first write and patches it after; saves
 * run one at a time so quick autosaves can't race into a duplicate insert.
 */
export function useEvaluation(employeeId: string, period: EvaluationPeriod, kind: EvaluationKind = "annual") {
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
        // A yearly evaluation is found by its period; a person's 90-day
        // evaluation by its kind (its dates come from the hire date).
        directSelectList<StaffEvaluation>(TABLE, {
          filters:
            kind === "ninety_day"
              ? [`employee_id=eq.${employeeId}`, kindFilter("ninety_day")]
              : [`employee_id=eq.${employeeId}`, `period_start=eq.${period.start}`, kindFilter("annual")],
          orderBy: [{ column: "created_at", ascending: false }],
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
  }, [employeeId, period.start, kind]);

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
  viewer: EvaluationViewer,
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
