/**
 * Printable month schedule — the sheet that goes on the wall.
 *
 * Self-contained HTML, no network, mirroring print-role-sheets.ts. Landscape,
 * because a seven-column month does not fit portrait at a readable size.
 *
 * An unstaffed shift is NOT left off. It prints as its time followed by a
 * ruled blank line, so whoever picks the shift up can write their name on the
 * posted copy — a hole you can see and fill beats a hole you cannot see.
 */
import { openSlotsForDay, type OpenSlot } from "./coverage";
import { computeStaffHours, formatHours } from "./hours";
import { compactTime, parseYmd } from "./schedule-engine";
import {
  SCHEDULE_AREA_LABELS,
  type CoverageRule,
  type ProShopShift,
  type ProShopStaff,
  type ScheduleArea,
  type ScheduleSettings,
} from "./types";

const WEEKDAY_HEADS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function firstName(name: string): string {
  return name.split(" ")[0];
}

export interface PrintScheduleInput {
  area: ScheduleArea;
  year: number;
  /** 0-based. */
  month0: number;
  shifts: ProShopShift[];
  staff: ProShopStaff[];
  rules: CoverageRule[];
  settings: Pick<ScheduleSettings, "lunch_threshold_minutes" | "lunch_minutes">;
  status?: "draft" | "published";
  generatedOn: Date;
}

/** Local YYYY-MM-DD without the UTC shift. */
function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The Sunday-aligned grid of dates covering the month, same as the screen. */
export function printGrid(year: number, month0: number): Array<string | null> {
  const first = new Date(year, month0, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymdLocal(new Date(year, month0, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftRow(time: string, name: string, inside: boolean): string {
  return `<div class="s ${inside ? "in" : "out"}"><span class="t">${escapeHtml(time)}</span><span class="n">${escapeHtml(name)}</span></div>`;
}

/** A shift with nobody on it: the time, then a line to write a name on. */
function openRow(slot: OpenSlot): string {
  const time = `${compactTime(slot.start)}-${compactTime(slot.end)}`;
  return `<div class="s open ${slot.group === "inside" ? "in" : "out"}"><span class="t">${escapeHtml(time)}</span><span class="blank"></span></div>`;
}

export function buildSchedulePrintHtml(input: PrintScheduleInput): string {
  const { area, year, month0, shifts, staff, rules, settings, status, generatedOn } = input;
  const nameById = new Map(staff.map((person) => [person.id, person.full_name]));
  const hours = computeStaffHours(shifts, settings);

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const printedOn = generatedOn.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const byDate = new Map<string, ProShopShift[]>();
  for (const shift of shifts) {
    byDate.set(shift.shift_date, [...(byDate.get(shift.shift_date) ?? []), shift]);
  }

  const cells = printGrid(year, month0).map((date) => {
    if (!date) return `<td class="blankday"></td>`;
    const dayShifts = [...(byDate.get(date) ?? [])].sort((a, b) => {
      if (a.group !== b.group) return a.group === "outside" ? -1 : 1;
      return a.start_time.localeCompare(b.start_time);
    });
    const weekday = parseYmd(date).getDay();
    const dayRules = rules.filter((rule) => rule.weekday === weekday);
    const open = openSlotsForDay(
      dayShifts.map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time })),
      dayRules,
    );

    const rows = dayShifts.map((shift) => shiftRow(
      `${compactTime(shift.start_time)}-${compactTime(shift.end_time)}`,
      firstName(nameById.get(shift.staff_id) ?? "?"),
      shift.group === "inside",
    )).join("");
    const openRows = open.map(openRow).join("");

    return `<td>
      <div class="d">${Number(date.slice(8, 10))}</div>
      ${rows}${openRows}
    </td>`;
  });

  const weeks: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  }

  // Hours per person, so the sheet answers "who is at how many" without a
  // second document. Paid hours — the unpaid lunch is already out.
  const totals = staff
    .map((person) => ({ person, minutes: hours.totalByStaff.get(person.id) ?? 0 }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const totalsRows = totals.map(({ person, minutes }) => `
    <tr><td>${escapeHtml(person.full_name)}</td>
        <td>${escapeHtml(person.position === "golf_ops_assistant" ? "Golf Ops" : person.position === "rec_aid" ? "Rec Aid" : person.position.replaceAll("_", " "))}</td>
        <td class="num">${escapeHtml(formatHours(minutes))}</td></tr>`).join("");

  const openCount = printGrid(year, month0).reduce((sum, date) => {
    if (!date) return sum;
    const dayShifts = byDate.get(date) ?? [];
    const weekday = parseYmd(date).getDay();
    return sum + openSlotsForDay(
      dayShifts.map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time })),
      rules.filter((rule) => rule.weekday === weekday),
    ).length;
  }, 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(SCHEDULE_AREA_LABELS[area])} schedule &middot; ${escapeHtml(monthLabel)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 16px; }
    header { border-bottom: 3px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    h1 { font-size: 20px; margin: 0; }
    .sub { color: #444; font-size: 11px; margin: 2px 0 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid #999; padding: 3px; background: #f0f0f0; }
    td { border: 1px solid #999; vertical-align: top; height: 92px; padding: 2px 3px; }
    td.blankday { background: #fafafa; }
    .d { font-size: 11px; font-weight: 700; margin-bottom: 1px; }
    .s { display: flex; gap: 4px; font-size: 9.5px; line-height: 1.5; white-space: nowrap; }
    .s .t { font-variant-numeric: tabular-nums; }
    .s .n { overflow: hidden; text-overflow: ellipsis; }
    .in .t { font-weight: 600; }
    .out { color: #7a4b00; }
    .in { color: #23408e; }
    /* An unstaffed shift: the time, then a line to write a name on. */
    .open .blank { flex: 1; border-bottom: 1px solid #555; margin-bottom: 2px; min-width: 42px; }
    .open { color: #111; }
    .legend { display: flex; gap: 14px; font-size: 10px; color: #444; margin: 8px 0 4px; }
    .legend .swatch { display: inline-block; width: 10px; height: 10px; border: 1px solid #999; vertical-align: -1px; margin-right: 3px; }
    h2 { font-size: 13px; margin: 14px 0 4px; }
    .totals { width: auto; min-width: 300px; }
    .totals td { height: auto; padding: 3px 8px; font-size: 11px; }
    .totals th { text-align: left; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    footer { margin-top: 10px; font-size: 10px; color: #555; border-top: 1px solid #ddd; padding-top: 5px; }
    @media print { body { margin: 0; } .totals { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(SCHEDULE_AREA_LABELS[area])} Schedule &middot; ${escapeHtml(monthLabel)}</h1>
    <p class="sub">${status ? escapeHtml(status === "published" ? "Published" : "Draft") + " &middot; " : ""}Printed ${escapeHtml(printedOn)}${
      openCount > 0 ? ` &middot; ${openCount} shift${openCount === 1 ? "" : "s"} still open` : ""
    }</p>
  </header>

  <div class="legend">
    <span><span class="swatch" style="background:#fff3e0"></span>Outside / rec aids</span>
    <span><span class="swatch" style="background:#e8eeff"></span>Inside / golf ops</span>
    <span>A time with a blank line is an open shift &mdash; write your name on it.</span>
  </div>

  <table>
    <thead><tr>${WEEKDAY_HEADS.map((d) => `<th>${d}</th>`).join("")}</tr></thead>
    <tbody>${weeks.join("")}</tbody>
  </table>

  <h2>Hours this month</h2>
  <table class="totals">
    <thead><tr><th>Name</th><th>Position</th><th class="num">Hours</th></tr></thead>
    <tbody>${totalsRows || `<tr><td colspan="3">Nobody is scheduled yet.</td></tr>`}</tbody>
  </table>

  <footer>Hours are paid hours &mdash; the unpaid lunch is already deducted. Questions, or can&#39;t make a shift? Tell the General Manager.</footer>
</body>
</html>`;
}
