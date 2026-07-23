// Printable per-role duty sheets — the wall posters. One page per role group
// listing what that role does every day, on specific weekdays, and monthly,
// with seasonal / as-needed work set apart so the daily list stays clean.
// Staff have no app logins; the GM prints these and posts one in each work
// area. Deterministic and self-contained (no network), mirroring
// print-assignments.ts.

import { DUTY_ROLE_GROUP_LABELS, DUTY_ROLE_GROUP_ORDER } from "./duties";
import type { DutyRoleGroup, OperationDuty } from "./types";

const WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export interface RoleDutySheet {
  role: DutyRoleGroup;
  label: string;
  daily: OperationDuty[];
  /** Only weekdays that actually have duties, in Monday-first order. */
  weekdays: Array<{ day: string; label: string; duties: OperationDuty[] }>;
  monthly: OperationDuty[];
  seasonal: OperationDuty[];
  asNeeded: OperationDuty[];
  total: number;
}

type Bucket =
  | { kind: "daily" }
  | { kind: "weekday"; days: string[] }
  | { kind: "monthly" }
  | { kind: "seasonal" }
  | { kind: "asneeded" };

/**
 * Where a duty belongs on the sheet. The seeded dormant duties carry a
 * distinguishing note ("As needed …" / "Seasonal …") because their stored
 * cadence is only a placeholder; everything else classifies by cadence.
 */
function classify(duty: OperationDuty): Bucket {
  const note = duty.note ?? "";
  if (note.startsWith("As needed")) return { kind: "asneeded" };
  if (note.startsWith("Seasonal")) return { kind: "seasonal" };

  const cadence = duty.cadence ?? duty.recurrence_rule?.cadence ?? "weekly";
  if (cadence === "daily") return { kind: "daily" };
  if (cadence === "weekly") {
    const days = (duty.recurrence_rule?.weekdays ?? duty.days ?? [])
      .filter((day): day is string => typeof day === "string");
    // A weekly duty with no recorded weekday still needs to appear somewhere
    // visible — treat it as every-day work rather than silently dropping it.
    return days.length > 0 ? { kind: "weekday", days } : { kind: "daily" };
  }
  if (cadence === "monthly" || cadence === "quarterly") return { kind: "monthly" };
  return { kind: "seasonal" }; // annual
}

function sortDuties(list: OperationDuty[]): OperationDuty[] {
  return [...list].sort(
    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
  );
}

/** Deduplicate by normalized title so old starter duties that overlap the
 *  seeded menu ("Rake bunkers" twice) print once. First occurrence wins. */
function dedupe(list: OperationDuty[]): OperationDuty[] {
  const seen = new Set<string>();
  return list.filter((duty) => {
    const key = duty.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Group active duties into one printable sheet per role group. */
export function buildRoleDutySheets(duties: OperationDuty[]): RoleDutySheet[] {
  const byRole = new Map<DutyRoleGroup, OperationDuty[]>();
  for (const duty of duties) {
    if (!duty.is_active) continue;
    const role = (duty.role_group ?? "unassigned") as DutyRoleGroup;
    byRole.set(role, [...(byRole.get(role) ?? []), duty]);
  }

  const sheets: RoleDutySheet[] = [];
  for (const role of DUTY_ROLE_GROUP_ORDER) {
    const roleDuties = byRole.get(role);
    if (!roleDuties?.length) continue;

    const daily: OperationDuty[] = [];
    const weekdayMap = new Map<string, OperationDuty[]>();
    const monthly: OperationDuty[] = [];
    const seasonal: OperationDuty[] = [];
    const asNeeded: OperationDuty[] = [];

    for (const duty of sortDuties(roleDuties)) {
      const bucket = classify(duty);
      if (bucket.kind === "daily") daily.push(duty);
      else if (bucket.kind === "monthly") monthly.push(duty);
      else if (bucket.kind === "seasonal") seasonal.push(duty);
      else if (bucket.kind === "asneeded") asNeeded.push(duty);
      else {
        for (const day of bucket.days) {
          weekdayMap.set(day, [...(weekdayMap.get(day) ?? []), duty]);
        }
      }
    }

    const weekdays = WEEKDAY_ORDER
      .filter((day) => (weekdayMap.get(day) ?? []).length > 0)
      .map((day) => ({
        day,
        label: WEEKDAY_LABELS[day],
        duties: dedupe(weekdayMap.get(day)!),
      }));

    const sheet: RoleDutySheet = {
      role,
      label: DUTY_ROLE_GROUP_LABELS[role],
      daily: dedupe(daily),
      weekdays,
      monthly: dedupe(monthly),
      seasonal: dedupe(seasonal),
      asNeeded: dedupe(asNeeded),
      total: 0,
    };
    sheet.total = sheet.daily.length
      + sheet.weekdays.reduce((sum, group) => sum + group.duties.length, 0)
      + sheet.monthly.length + sheet.seasonal.length + sheet.asNeeded.length;
    if (sheet.total > 0) sheets.push(sheet);
  }
  return sheets;
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
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function dutyList(list: OperationDuty[]): string {
  return `<ul>${list.map((duty) => `
    <li><span class="box" aria-hidden="true"></span><span class="t">${escapeHtml(duty.title)}</span></li>`).join("")}
  </ul>`;
}

function section(heading: string, list: OperationDuty[], className = ""): string {
  if (list.length === 0) return "";
  return `
    <section class="block ${className}">
      <h3>${escapeHtml(heading)}</h3>
      ${dutyList(list)}
    </section>`;
}

/**
 * Self-contained printable HTML: one poster page per role. Large type for
 * posting on a wall; checkbox squares survive lamination + dry-erase.
 */
export function buildRoleDutySheetsHtml(
  duties: OperationDuty[],
  generatedOn: Date,
): string {
  const sheets = buildRoleDutySheets(duties);
  const printedDate = formatDate(generatedOn);

  const body = sheets.length === 0
    ? `<p class="empty">No active duties are recorded yet. Add duties on the Duty ownership page first.</p>`
    : sheets.map((sheet) => `
      <article class="sheet">
        <header>
          <h2>${escapeHtml(sheet.label)}</h2>
          <p class="sub">Daily duty sheet &middot; ${sheet.total} duties &middot; Printed ${escapeHtml(printedDate)}</p>
        </header>
        ${section("Every day", sheet.daily, "daily")}
        ${sheet.weekdays.map((group) => section(group.label, group.duties)).join("")}
        ${section("Monthly", sheet.monthly)}
        ${section("Seasonal projects (scheduled by the manager)", sheet.seasonal, "quiet")}
        ${section("As needed (do when required)", sheet.asNeeded, "quiet")}
        <footer>Questions or can&#39;t finish something? Tell the General Manager &mdash; don&#39;t leave it unspoken.</footer>
      </article>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Role duty sheets</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 28px; }
    .sheet { page-break-after: always; break-after: page; padding-top: 6px; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .sheet > header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h2 { font-size: 26px; margin: 0; }
    .sub { color: #444; font-size: 13px; margin: 3px 0 0; }
    .block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
    h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; }
    .box { width: 15px; height: 15px; border: 2px solid #333; border-radius: 3px; margin-top: 2px; flex: 0 0 auto; }
    .t { font-size: 15px; font-weight: 600; line-height: 1.35; }
    .quiet .t { font-weight: 400; color: #333; }
    .quiet h3 { color: #555; border-bottom-color: #ccc; }
    footer { margin-top: 18px; font-size: 12px; color: #555; border-top: 1px solid #ddd; padding-top: 8px; }
    .empty { color: #555; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
