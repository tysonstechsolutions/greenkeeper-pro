/**
 * Deterministic builder for the crew-wide 1:1 insights snapshot. Turns raw
 * sessions + open follow-ups + the profile directory into the compact,
 * per-employee shape the one-on-one-report edge function reads. Pure (no I/O)
 * so it's testable and the snapshot handed to the AI is reproducible.
 */
import type { OneOnOneSession } from "./types";

export interface InsightsEmployee {
  name: string;
  role: string;
  sessions: { date: string; template: string; summary: string; answers: string[] }[];
  open_follow_ups: string[];
}

export interface InsightsPayload {
  period_label: string;
  employees: InsightsEmployee[];
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  role: string | null;
}

interface ConcernLite {
  employee_id: string;
  title: string;
  status: string;
}

/**
 * @param sessions   completed sessions (any date; filter by cutoff here)
 * @param concerns   open follow-ups (staff_concerns rows, status open)
 * @param profiles   directory for id → name/role
 * @param cutoffIso  only include sessions on/after this YYYY-MM-DD (or null for all)
 * @param periodLabel human label for the window, e.g. "the last 60 days"
 */
export function buildInsightsPayload(
  sessions: OneOnOneSession[],
  concerns: ConcernLite[],
  profiles: ProfileLite[],
  cutoffIso: string | null,
  periodLabel: string,
): InsightsPayload {
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || "Unknown"]));
  const roleOf = new Map(profiles.map((p) => [p.id, p.role || ""]));

  const inRange = sessions.filter(
    (s) => !cutoffIso || s.session_date >= cutoffIso,
  );

  const followUpsByEmployee = new Map<string, string[]>();
  for (const c of concerns) {
    if (c.status !== "open") continue;
    const list = followUpsByEmployee.get(c.employee_id) ?? [];
    list.push(c.title);
    followUpsByEmployee.set(c.employee_id, list);
  }

  const byEmployee = new Map<string, OneOnOneSession[]>();
  for (const s of inRange) {
    const list = byEmployee.get(s.employee_id) ?? [];
    list.push(s);
    byEmployee.set(s.employee_id, list);
  }

  // Include anyone with a session in range OR an open follow-up.
  const employeeIds = new Set<string>([
    ...byEmployee.keys(),
    ...followUpsByEmployee.keys(),
  ]);

  const employees: InsightsEmployee[] = [];
  for (const id of employeeIds) {
    const sess = (byEmployee.get(id) ?? []).map((s) => ({
      date: s.session_date,
      template: s.template,
      summary: s.summary ?? "",
      answers: s.questions
        .filter((q) => q.answer.trim())
        .map((q) => `${q.prompt} — ${q.answer.trim()}`),
    }));
    employees.push({
      name: nameOf.get(id) ?? "Unknown",
      role: roleOf.get(id) ?? "",
      sessions: sess,
      open_follow_ups: followUpsByEmployee.get(id) ?? [],
    });
  }

  return { period_label: periodLabel, employees };
}

/** Total answered data points across the snapshot — used to gate the report. */
export function snapshotDataPoints(payload: InsightsPayload): number {
  return payload.employees.reduce(
    (sum, e) =>
      sum +
      e.open_follow_ups.length +
      e.sessions.reduce((s, sess) => s + sess.answers.length, 0),
    0,
  );
}
