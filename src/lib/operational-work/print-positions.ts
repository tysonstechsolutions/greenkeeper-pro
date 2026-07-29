// Printable per-position work lists — the sheets the GM hands to employees or
// posts on a wall.
//
// The crew have no app logins, and duty occurrences are assigned by role group
// ("recreation_aide", "maintenance_staff", …) rather than to a named person —
// `tasks.assigned_to` is null across the whole table. Grouping printouts by
// employee therefore produced an empty sheet every time. These lists group the
// real dated work by the position that owns it: what that role does, on what
// day, and who is responsible when a name is recorded.
//
// These are crew documents. The GM and other managers work out of the command
// center, so manager work never prints — see CREW_PRINT_ROLE_GROUPS.
//
// Deterministic and self-contained (no network), mirroring print-assignments.ts
// and print-role-sheets.ts.

import type { DutyRoleGroup } from "@/lib/operations/types";
import { normalizePosition, positionDisplayLabel } from "./position";
import { daysFrom } from "./priority";
import type { OperationalWorkItem } from "./types";

const FINISHED = new Set(["completed", "verified", "cancelled"]);

/**
 * The positions that get a printed sheet: the duty catalogue's employee and
 * contractor role groups.
 *
 * Deliberately excluded:
 *  - `general_manager` and `unassigned` — the GM's own queue.
 *  - Free-text owner roles that only ever arrive on Program Standards
 *    ("GCM", "Superintendent", "Leadership", "Crew", "Mechanic") and the
 *    hard-coded "mechanic" on equipment alerts. None is a staffed position in
 *    the duty catalogue, and all of that work is the GM's.
 *
 * Nothing is lost by excluding them — the GM sees every one of these in the
 * command center, which is where he works.
 *
 * Values are post-`normalizePosition`, so a retired role group (`pro_shop_staff`)
 * is absent on purpose: it resolves to the position it merged into.
 */
export const CREW_PRINT_ROLE_GROUPS: ReadonlySet<DutyRoleGroup> = new Set<DutyRoleGroup>([
  "recreation_aide",
  "golf_operations_assistant",
  "maintenance_staff",
  "restaurant_staff",
  "contractor",
]);

export interface PositionPrintRange {
  key: "today" | "week";
  label: string;
  /** Inclusive number of days forward from today that the sheet covers. */
  daysAhead: number;
}

export const POSITION_PRINT_RANGES: Record<PositionPrintRange["key"], PositionPrintRange> = {
  today: { key: "today", label: "Today", daysAhead: 0 },
  week: { key: "week", label: "Next 7 days", daysAhead: 7 },
};

/**
 * Whether an item belongs on a sheet for the given range.
 *
 * Anything already overdue stays on the sheet regardless of range — a missed
 * duty should not disappear from the crew's list. Undated work is kept too, so
 * nothing is silently dropped by a date filter it never had a value for.
 */
export function workInPrintRange(
  item: OperationalWorkItem,
  today: Date,
  range: PositionPrintRange,
): boolean {
  if (!item.dueDate) return true;
  return daysFrom(today, item.dueDate) <= range.daysAhead;
}

/**
 * Whether an item belongs on a crew sheet at all.
 *
 * Program Standards are the GM's course-improvement programme — he works
 * through them in the command center's improvement backlog when time allows,
 * and they are never crew shift work regardless of the owner role recorded
 * against them.
 */
function isCrewWork(item: OperationalWorkItem): boolean {
  if (item.sourceType === "standard") return false;
  const position = normalizePosition(item.responsiblePosition);
  return !!position && CREW_PRINT_ROLE_GROUPS.has(position as DutyRoleGroup);
}

export interface PositionDayGroup {
  /** ISO date, or "undated". */
  key: string;
  label: string;
  items: OperationalWorkItem[];
}

export interface PositionGroup {
  key: string;
  label: string;
  days: PositionDayGroup[];
  total: number;
}

/** Only called for work that already passed `isCrewWork`, so a position exists. */
function positionKeyAndLabel(item: OperationalWorkItem): { key: string; label: string } {
  const position = normalizePosition(item.responsiblePosition)!;
  return { key: position, label: positionDisplayLabel(item.responsiblePosition!) };
}

function dayLabel(dueDate: string | null, today: Date): { key: string; label: string } {
  if (!dueDate) return { key: "undated", label: "No due date" };
  const offset = daysFrom(today, dueDate);
  const [year, month, day] = dueDate.slice(0, 10).split("-").map(Number);
  const pretty = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (offset < 0) {
    return { key: dueDate, label: `Overdue — ${pretty}` };
  }
  if (offset === 0) return { key: dueDate, label: `Today — ${pretty}` };
  return { key: dueDate, label: pretty };
}

/**
 * Group open, in-range work into one printable list per position, split into
 * dated day sections (earliest first; undated last).
 */
export function groupOpenWorkByPosition(
  items: OperationalWorkItem[],
  today: Date,
  range: PositionPrintRange,
): PositionGroup[] {
  const byPosition = new Map<string, { label: string; items: OperationalWorkItem[] }>();

  for (const item of items) {
    if (FINISHED.has(item.status)) continue;
    if (!isCrewWork(item)) continue;
    if (!workInPrintRange(item, today, range)) continue;
    const { key, label } = positionKeyAndLabel(item);
    const group = byPosition.get(key) ?? { label, items: [] };
    group.items.push(item);
    byPosition.set(key, group);
  }

  const groups: PositionGroup[] = [];
  for (const [key, group] of byPosition) {
    const byDay = new Map<string, PositionDayGroup>();
    for (const item of group.items) {
      const { key: dayKey, label } = dayLabel(item.dueDate, today);
      const day = byDay.get(dayKey) ?? { key: dayKey, label, items: [] };
      day.items.push(item);
      byDay.set(dayKey, day);
    }
    const days = [...byDay.values()].sort((a, b) => {
      if (a.key === "undated") return 1;
      if (b.key === "undated") return -1;
      return a.key.localeCompare(b.key);
    });
    for (const day of days) {
      day.items.sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));
    }
    groups.push({ key, label: group.label, days, total: group.items.length });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function dayBlock(day: PositionDayGroup): string {
  const rows = day.items.map((item) => {
    // Who is responsible, when the duty has a named owner. Most duties are
    // owned by the role rather than a person, so this is often absent.
    const owner = item.responsibleEmployee
      ? `<span class="owner">${escapeHtml(item.responsibleEmployee.name)}</span>`
      : "";
    const meta = [item.sourceLabel, item.department?.replaceAll("_", " ")]
      .filter(Boolean)
      .map((value) => escapeHtml(String(value)))
      .join(" &middot; ");
    return `
      <li>
        <span class="box" aria-hidden="true"></span>
        <span class="task">
          <span class="title">${escapeHtml(item.title)}${owner}</span>
          <span class="meta">${meta}</span>
        </span>
      </li>`;
  }).join("");
  return `
    <section class="day">
      <h3>${escapeHtml(day.label)}</h3>
      <ul>${rows}</ul>
    </section>`;
}

/**
 * Self-contained printable HTML: one page per position, day by day, with
 * checkbox squares and a sign-off line.
 */
export function buildPositionListsPrintHtml(
  items: OperationalWorkItem[],
  generatedOn: Date,
  range: PositionPrintRange,
): string {
  const groups = groupOpenWorkByPosition(items, generatedOn, range);
  const printedDate = formatDate(generatedOn);

  const body = groups.length === 0
    ? `<p class="empty">No open crew work falls in this range. Try the &ldquo;Next 7 days&rdquo; list, or check that duties are active on the Duty ownership page. Your own work is not printed &mdash; it stays in the Operations Command Center.</p>`
    : groups.map((group) => `
      <article class="sheet">
        <header>
          <h2>${escapeHtml(group.label)}</h2>
          <p class="sub">${escapeHtml(range.label)} &middot; ${group.total} item${group.total === 1 ? "" : "s"} &middot; Printed ${escapeHtml(printedDate)}</p>
        </header>
        ${group.days.map(dayBlock).join("")}
        <p class="sign">Completed by ______________________  Date __________</p>
        <footer>Something you can&#39;t finish or don&#39;t understand? Tell the General Manager &mdash; don&#39;t leave it unspoken.</footer>
      </article>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Position work lists &middot; ${escapeHtml(range.label)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 28px; }
    .sheet { page-break-after: always; break-after: page; padding-top: 6px; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .sheet > header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h2 { font-size: 24px; margin: 0; }
    .sub { color: #444; font-size: 13px; margin: 3px 0 0; }
    .day { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
    h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; border-bottom: 1px solid #e3e3e3; }
    .box { width: 15px; height: 15px; border: 2px solid #333; border-radius: 3px; margin-top: 3px; flex: 0 0 auto; }
    .task { display: flex; flex-direction: column; }
    .title { font-size: 14px; font-weight: 600; line-height: 1.35; }
    .owner { font-weight: 400; color: #333; }
    .owner::before { content: " — "; }
    .meta { font-size: 11px; color: #555; }
    .sign { font-size: 12px; color: #333; margin-top: 14px; }
    footer { margin-top: 10px; font-size: 12px; color: #555; border-top: 1px solid #ddd; padding-top: 8px; }
    .empty { color: #555; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
