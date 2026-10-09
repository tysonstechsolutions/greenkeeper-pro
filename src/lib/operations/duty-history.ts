// Duty check-off history — the paper trail behind standing duties.
//
// Two sources, merged:
//   * tasks (duty_id set, completed/verified) — where every check-off has
//     been recorded since the Phase 1A duty system (2026-07-13);
//   * duty_completions — the original table, kept for history. Rows from
//     before Phase 1A were copied onto their task where one existed, so the
//     same check-off can appear in both; it is shown once.
//
// The old Duty & Cleaning Log only read duty_completions, so it stopped
// showing anything new after July 13. This module is what fixes that.

import type { DutyArea, OperationDuty } from "./types";

export interface DutyHistoryTaskRow {
  id: string;
  duty_id: string;
  title: string | null;
  original_due_date: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  verified_at: string | null;
}

export interface DutyHistoryLegacyRow {
  id: string;
  duty_id: string;
  duty_date: string;
  completed_at: string;
  completed_by: string | null;
  profiles?: { full_name: string | null } | null;
}

export interface DutyHistoryEntry {
  key: string;
  dutyId: string;
  /** The day the duty was scheduled for (local YYYY-MM-DD). */
  date: string;
  title: string;
  area: DutyArea | null;
  completedBy: string | null;
  verified: boolean;
}

export interface DutyHistoryMonth {
  /** 'YYYY-MM' */
  key: string;
  label: string;
  entries: DutyHistoryEntry[];
}

export function mergeDutyHistory(
  tasks: DutyHistoryTaskRow[],
  legacy: DutyHistoryLegacyRow[],
  duties: Pick<OperationDuty, "id" | "title" | "area">[],
  nameById: ReadonlyMap<string, string>,
): DutyHistoryEntry[] {
  const dutyById = new Map(duties.map((duty) => [duty.id, duty]));
  const byKey = new Map<string, DutyHistoryEntry>();

  for (const task of tasks) {
    const date = (task.original_due_date ?? task.due_date ?? task.completed_at ?? "").slice(0, 10);
    if (!date) continue;
    const duty = dutyById.get(task.duty_id);
    const key = `${task.duty_id}:${date}`;
    byKey.set(key, {
      key,
      dutyId: task.duty_id,
      date,
      title: duty?.title ?? task.title ?? "(deleted duty)",
      area: duty?.area ?? null,
      completedBy: task.completed_by ? nameById.get(task.completed_by) ?? null : null,
      verified: task.status === "verified" || !!task.verified_at,
    });
  }

  for (const row of legacy) {
    const date = row.duty_date.slice(0, 10);
    const key = `${row.duty_id}:${date}`;
    if (byKey.has(key)) continue;
    const duty = dutyById.get(row.duty_id);
    byKey.set(key, {
      key,
      dutyId: row.duty_id,
      date,
      title: duty?.title ?? "(deleted duty)",
      area: duty?.area ?? null,
      completedBy: row.profiles?.full_name
        ?? (row.completed_by ? nameById.get(row.completed_by) ?? null : null),
      verified: false,
    });
  }

  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** Newest month first, entries already newest first. */
export function groupDutyHistoryByMonth(entries: DutyHistoryEntry[]): DutyHistoryMonth[] {
  const groups = new Map<string, DutyHistoryEntry[]>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => {
      const [y, m] = key.split("-").map(Number);
      return {
        key,
        label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        entries: list,
      };
    });
}
