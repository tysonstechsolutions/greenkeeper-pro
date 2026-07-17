"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { directRpc, directSelectList, getCachedUserId } from "@/lib/supabase/rest";
import { currentStatusOf, scoreProgram, rankStandards } from "./scoring";
import type {
  CorrectiveAction,
  ProgramStandard,
  ProgramStandardEvidence,
  ProgramStandardVersion,
  StandardProgressInput,
  StandardEvaluation,
  StandardSection,
  StandardSubsection,
  StandardWithStatus,
} from "./types";

/**
 * Loads the standards catalog joined to its CURRENT state.
 *
 * Raw REST (directSelectList), never supabase-js — the .from() query path sits
 * on the navigator.locks auth lock and can hang silently. See client.ts.
 *
 * Scale note: the catalog is 93 standards, so fetching evaluations and reducing
 * to "newest per standard" on the client is correct and cheap today. If the
 * evaluation history grows past a few thousand rows this should become a
 * `standard_current_status` view (PostgREST caps at max_rows=1000).
 */
/** A person a standard can be delegated to. */
export interface StandardOwnerOption {
  id: string;
  full_name: string | null;
  role: string | null;
  department?: string | null;
  role_group?: string | null;
}

export function useStandards() {
  const [standards, setStandards] = useState<ProgramStandard[]>([]);
  const [sections, setSections] = useState<StandardSection[]>([]);
  const [subsections, setSubsections] = useState<StandardSubsection[]>([]);
  const [evaluations, setEvaluations] = useState<StandardEvaluation[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [people, setPeople] = useState<StandardOwnerOption[]>([]);
  const [versions, setVersions] = useState<ProgramStandardVersion[]>([]);
  const [evidence, setEvidence] = useState<ProgramStandardEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [std, sec, sub, evals, acts, ppl, versionRows, evidenceRows] = await Promise.all([
        directSelectList<ProgramStandard>("program_standards", {
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "code", ascending: true }],
          label: "standards.catalog",
        }),
        directSelectList<StandardSection>("program_standard_sections", {
          orderBy: [{ column: "sort_order", ascending: true }],
          label: "standards.sections",
        }),
        directSelectList<StandardSubsection>("program_standard_subsections", {
          orderBy: [{ column: "subsection", ascending: true }],
          label: "standards.subsections",
        }),
        directSelectList<StandardEvaluation>("standard_evaluations", {
          columns: "id,standard_id,status,evaluated_at,detail,method,is_automated",
          orderBy: [{ column: "evaluated_at", ascending: false }],
          label: "standards.evaluations",
        }),
        directSelectList<CorrectiveAction>("standard_corrective_actions", {
          filters: ["status=in.(proposed,active,awaiting_verification)"],
          label: "standards.actions",
        }),
        directSelectList<StandardOwnerOption>("staff_directory", {
          columns: "id,full_name,role,department,role_group",
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "full_name", ascending: true }],
          label: "standards.people",
        }),
        directSelectList<ProgramStandardVersion>("program_standard_versions", {
          orderBy: [{ column: "changed_at", ascending: false }],
          label: "standards.versions",
        }),
        directSelectList<ProgramStandardEvidence>("operational_work_evidence", {
          filters: ["work_key=like.standard:*"],
          orderBy: [{ column: "created_at", ascending: false }],
          label: "standards.evidence",
        }),
      ]);
      setStandards(std);
      setSections(sec);
      setSubsections(sub);
      setEvaluations(evals);
      setActions(acts);
      setPeople(ppl);
      setVersions(versionRows);
      setEvidence(evidenceRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load standards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Delegate a standard to someone (or take it back with `null`).
   *
   * Optimistic: the row updates locally first so the picker feels instant, and
   * rolls back on failure rather than lying about who owns the work.
   */
  const delegate = useCallback(
    async (standardId: string, profileId: string | null) => {
      const previous = standards;
      setStandards((prev) =>
        prev.map((s) =>
          s.id === standardId ? { ...s, owner_profile_id: profileId } : s,
        ),
      );
      try {
        await directRpc("delegate_program_standard", {
          p_standard_id: standardId,
          p_profile_id: profileId,
          p_reason: "Owner changed from Program Standards",
        }, "standards.delegate");
      } catch (e) {
        setStandards(previous); // don't leave a false owner on screen
        throw e instanceof Error ? e : new Error("Couldn't change the owner.");
      }
    },
    [standards],
  );

  const recordProgress = useCallback(async (
    standardId: string,
    input: StandardProgressInput,
  ) => {
    await directRpc("record_program_standard_progress", {
      p_standard_id: standardId,
      p_status: input.status,
      p_notes: input.notes,
      p_estimated_minutes: input.estimatedMinutes,
      p_impact_level: input.impactLevel,
      p_manager_target_date: input.managerTargetDate,
      p_not_applicable_reason: input.notApplicableReason ?? null,
      p_evidence_label: input.evidenceLabel ?? null,
      p_evidence_reference: input.evidenceReference ?? null,
    }, "standards.progress");
    await load();
  }, [load]);

  /** id -> display name, for rendering owners without a second query. */
  const peopleById = useMemo(() => {
    const m = new Map<string, StandardOwnerOption>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  /** Standards joined to their newest evaluation + any open corrective action. */
  const withStatus = useMemo<StandardWithStatus[]>(() => {
    const byStandard = new Map<string, StandardEvaluation[]>();
    for (const e of evaluations) {
      const list = byStandard.get(e.standard_id) ?? [];
      list.push(e);
      byStandard.set(e.standard_id, list);
    }
    const openByStandard = new Map<string, CorrectiveAction>();
    for (const a of actions) {
      if (!openByStandard.has(a.standard_id)) openByStandard.set(a.standard_id, a);
    }
    return standards.map((s) => {
      const evs = byStandard.get(s.id) ?? [];
      const newest = evs[0] ?? null;
      return {
        standard: s,
        status: currentStatusOf(evs),
        evaluatedAt: newest?.evaluated_at ?? null,
        detail: newest?.detail ?? null,
        openAction: openByStandard.get(s.id) ?? null,
      };
    });
  }, [standards, evaluations, actions]);

  const score = useMemo(
    () => scoreProgram(sections, subsections, withStatus),
    [sections, subsections, withStatus],
  );

  /** Highest-priority standards needing attention, worst first. */
  const needsAction = useMemo(
    () =>
      rankStandards(
        withStatus.filter((s) =>
          ["critical", "below_standard", "at_risk", "blocked"].includes(s.status),
        ),
      ),
    [withStatus],
  );

  /** Active standards nobody owns — work that lands in nobody's day. */
  const unowned = useMemo(
    () => rankStandards(withStatus.filter((s) => !s.standard.owner_profile_id)),
    [withStatus],
  );

  /** Standards delegated to someone other than the signed-in GM. */
  const delegated = useMemo(() => {
    const me = getCachedUserId();
    return withStatus.filter(
      (s) => s.standard.owner_profile_id && s.standard.owner_profile_id !== me,
    );
  }, [withStatus]);

  return {
    standards,
    sections,
    subsections,
    withStatus,
    score,
    needsAction,
    unowned,
    delegated,
    people,
    peopleById,
    delegate,
    actions,
    versions,
    evidence,
    recordProgress,
    loading,
    error,
    reload: load,
  };
}
