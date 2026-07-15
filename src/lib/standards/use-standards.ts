"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { directSelectList } from "@/lib/supabase/rest";
import { currentStatusOf, scoreProgram, rankStandards } from "./scoring";
import type {
  CorrectiveAction,
  ProgramStandard,
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
export function useStandards() {
  const [standards, setStandards] = useState<ProgramStandard[]>([]);
  const [sections, setSections] = useState<StandardSection[]>([]);
  const [subsections, setSubsections] = useState<StandardSubsection[]>([]);
  const [evaluations, setEvaluations] = useState<StandardEvaluation[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [std, sec, sub, evals, acts] = await Promise.all([
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
      ]);
      setStandards(std);
      setSections(sec);
      setSubsections(sub);
      setEvaluations(evals);
      setActions(acts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load standards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  return {
    standards,
    sections,
    subsections,
    withStatus,
    score,
    needsAction,
    unowned,
    actions,
    loading,
    error,
    reload: load,
  };
}
