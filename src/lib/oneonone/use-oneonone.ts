"use client";

import { useCallback, useEffect, useState } from "react";
import {
  directSelectList,
  directSelectRow,
  directInsertRow,
  directPatchRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import {
  emptyEngagementProfile,
  type EngagementProfile,
  type EngagementProfileRow,
  type OneOnOneQuestion,
  type OneOnOneSession,
  type OneOnOneTemplate,
} from "./types";

/** Merge new profile facts into the existing one, de-duplicating list items. */
function mergeEngagement(
  base: EngagementProfile,
  updates: Partial<EngagementProfile>,
): EngagementProfile {
  const mergeList = (a: string[], b?: string[]): string[] => {
    if (!b || b.length === 0) return a;
    const seen = new Set(a.map((x) => x.toLowerCase().trim()));
    const out = [...a];
    for (const item of b) {
      const key = item.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(item.trim());
      }
    }
    return out;
  };
  return {
    interests: mergeList(base.interests, updates.interests),
    family: mergeList(base.family, updates.family),
    career_goals: mergeList(base.career_goals, updates.career_goals),
    sports: mergeList(base.sports, updates.sports),
    life_goals: mergeList(base.life_goals, updates.life_goals),
    communication_notes:
      updates.communication_notes && updates.communication_notes.trim()
        ? updates.communication_notes.trim()
        : base.communication_notes,
    misc: mergeList(base.misc, updates.misc),
  };
}

export function useOneOnOne(employeeId: string) {
  const [sessions, setSessions] = useState<OneOnOneSession[]>([]);
  const [engagement, setEngagement] = useState<EngagementProfile>(
    emptyEngagementProfile(),
  );
  const [hasProfileRow, setHasProfileRow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [sess, prof] = await Promise.all([
        directSelectList<OneOnOneSession>("staff_one_on_one_sessions", {
          filters: [`employee_id=eq.${employeeId}`],
          orderBy: [{ column: "session_date", ascending: false }],
          label: "oneonone.sessions",
        }),
        directSelectRow<EngagementProfileRow>(
          "staff_engagement_profiles",
          "employee_id",
          employeeId,
          "*",
          "oneonone.engagement",
        ),
      ]);
      setSessions(sess);
      if (prof?.profile) {
        setEngagement({ ...emptyEngagementProfile(), ...prof.profile });
        setHasProfileRow(true);
      } else {
        setEngagement(emptyEngagementProfile());
        setHasProfileRow(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load 1:1 history.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSession = useCallback(
    async (payload: {
      template: OneOnOneTemplate;
      session_date: string;
      questions: OneOnOneQuestion[];
      summary?: string | null;
      scheduled_id?: string | null;
    }): Promise<void> => {
      await directInsertRow(
        "staff_one_on_one_sessions",
        {
          employee_id: employeeId,
          session_date: payload.session_date,
          template: payload.template,
          status: "completed",
          questions: payload.questions,
          summary: payload.summary ?? null,
          scheduled_id: payload.scheduled_id ?? null,
          created_by: getCachedUserId(),
        },
        "oneonone.sessions.save",
      );
      await load();
    },
    [employeeId, load],
  );

  /** Merge AI-derived facts into the employee's engagement profile. */
  const applyProfileUpdates = useCallback(
    async (updates: Partial<EngagementProfile>): Promise<void> => {
      const merged = mergeEngagement(engagement, updates);
      if (hasProfileRow) {
        await directPatchRow(
          "staff_engagement_profiles",
          "employee_id",
          employeeId,
          { profile: merged },
          "oneonone.engagement.patch",
        );
      } else {
        await directInsertRow(
          "staff_engagement_profiles",
          { employee_id: employeeId, profile: merged },
          "oneonone.engagement.insert",
        );
      }
      await load();
    },
    [employeeId, engagement, hasProfileRow, load],
  );

  return {
    sessions,
    engagement,
    loading,
    error,
    reload: load,
    saveSession,
    applyProfileUpdates,
  };
}
