/**
 * Pro Shop duties — pure grouping/display helpers (no I/O).
 *
 * Duties are standing weekly tasks for the pro-shop jobs. Each attaches to an
 * area (outside/inside/both) OR a specific person, and recurs on a set of
 * weekdays. The Duties page renders them grouped into area sections then a
 * section per person; this file is the single source of that organization.
 */
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  DUTY_AREA_LABELS,
  type DutyArea,
  type ProShopDuty,
  type ProShopStaff,
  type WeekdayKey,
} from "./types";

/** 7 booleans (sun..sat) marking which weekdays a duty recurs on. */
export function dutyDayFlags(days: WeekdayKey[]): boolean[] {
  const set = new Set(days);
  return WEEKDAY_KEYS.map((k) => set.has(k));
}

const SHORT_DAY: Record<WeekdayKey, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

/** "Mon · Wed · Fri", or "Daily" when all seven are set. */
export function summarizeDutyDays(days: WeekdayKey[]): string {
  const set = new Set(days);
  const inOrder = WEEKDAY_KEYS.filter((k) => set.has(k));
  if (inOrder.length === 0) return "No days set";
  if (inOrder.length === 7) return "Daily";
  return inOrder.map((k) => SHORT_DAY[k]).join(" · ");
}

export interface DutySection {
  /** Stable key: an area name or `person:<staffId>`. */
  key: string;
  label: string;
  duties: ProShopDuty[];
}

function sortDuties(duties: ProShopDuty[]): ProShopDuty[] {
  return [...duties].sort(
    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
  );
}

/**
 * Group active duties into display sections: the three area buckets (outside,
 * inside, both) in that order, then one section per person who has personal
 * duties (in staff sort order). Empty sections are omitted.
 */
export function groupDuties(
  duties: ProShopDuty[],
  staff: ProShopStaff[],
): DutySection[] {
  const active = duties.filter((d) => d.is_active);
  const sections: DutySection[] = [];

  const areaOrder: DutyArea[] = ["outside", "inside", "both"];
  for (const area of areaOrder) {
    const inArea = active.filter((d) => d.area === area);
    if (inArea.length) {
      sections.push({ key: area, label: DUTY_AREA_LABELS[area], duties: sortDuties(inArea) });
    }
  }

  const nameById = new Map(staff.map((s) => [s.id, s.full_name] as const));
  const orderById = new Map(staff.map((s, i) => [s.id, i] as const));
  const personIds = Array.from(
    new Set(active.filter((d) => d.staff_id).map((d) => d.staff_id as string)),
  ).sort((a, b) => (orderById.get(a) ?? 999) - (orderById.get(b) ?? 999));

  for (const id of personIds) {
    const personDuties = active.filter((d) => d.staff_id === id);
    sections.push({
      key: `person:${id}`,
      label: nameById.get(id) ?? "Unknown staff",
      duties: sortDuties(personDuties),
    });
  }

  return sections;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Clean, self-styled print markup for the Duties sheet — one heading + table per
 * section (Duty / Days / Notes). Rendered by printHtml(), independent of the
 * on-screen DOM so it prints tidily on its own (never bloats the schedule).
 */
export function buildDutiesPrintHtml(sections: DutySection[]): string {
  if (sections.length === 0) return "<p>No duties yet.</p>";
  return sections
    .map((sec) => {
      const rows = sec.duties
        .map(
          (d) =>
            `<tr><td>${esc(d.title)}</td><td>${esc(summarizeDutyDays(d.days))}</td><td>${esc(d.note ?? "")}</td></tr>`,
        )
        .join("");
      return `<h2>${esc(sec.label)}</h2><table><thead><tr><th>Duty</th><th>Days</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
}

/** All weekday keys, for building day-toggle rows. */
export { WEEKDAY_KEYS, WEEKDAY_LABELS };
