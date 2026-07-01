/**
 * Pro Shop AI quick-update — pure helpers (no I/O).
 *
 * The "quick update" box sends a plain-English instruction to pro-shop-ai, which
 * returns structured time-off + availability changes. These helpers resolve the
 * AI's staff names to real people and SANITIZE the AI's weekly patterns before
 * anything is written — a malformed pattern must never silently wipe someone's
 * schedule, so a pattern with no valid working day is rejected (returns null).
 */
import {
  WEEKDAY_KEYS,
  emptyWeekly,
  type DayPattern,
  type ProShopStaff,
  type ShiftGroup,
  type WeekdayKey,
} from "./types";

/** Resolve an AI-provided name to a roster member (exact → prefix → first name). */
export function matchStaffName(
  name: string,
  staff: ProShopStaff[],
): ProShopStaff | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  const first = n.split(" ")[0];
  return (
    staff.find((s) => s.full_name.toLowerCase() === n) ||
    staff.find((s) => s.full_name.toLowerCase().startsWith(n)) ||
    staff.find((s) => s.full_name.split(" ")[0].toLowerCase() === first) ||
    null
  );
}

/** Normalize a time to "HH:MM" (accepts "8:00"), or null if not a valid clock time. */
export function validTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** YYYY-MM-DD? */
export function validDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/**
 * Validate an AI weekly pattern into a clean 7-day map. A day is only "works"
 * if it has valid start+end times; group falls back to `fallbackGroup`. Returns
 * null when NO day ends up valid — so a garbled reply can't zero out a schedule.
 */
export function sanitizeWeekly(
  raw: unknown,
  fallbackGroup: ShiftGroup,
): Record<WeekdayKey, DayPattern> | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = emptyWeekly();
  let anyWorks = false;

  for (const k of WEEKDAY_KEYS) {
    const day = src[k];
    if (!day || typeof day !== "object") {
      out[k] = { works: false };
      continue;
    }
    const d = day as Record<string, unknown>;
    if (d.works !== true) {
      out[k] = { works: false };
      continue;
    }
    const start = validTime(d.start);
    const end = validTime(d.end);
    if (!start || !end || start >= end) {
      // "works" but unusable times — treat as off rather than inventing hours.
      out[k] = { works: false };
      continue;
    }
    const group: ShiftGroup =
      d.group === "inside" || d.group === "outside" ? d.group : fallbackGroup;
    out[k] = { works: true, group, start, end };
    anyWorks = true;
  }

  return anyWorks ? out : null;
}
