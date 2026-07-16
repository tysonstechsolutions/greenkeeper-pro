export type ObligationPeriodCadence = "weekly" | "monthly" | "quarterly" | "annual";

export const FACILITY_TIME_ZONE = "America/Chicago";

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

function calendarParts(date: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function ymdUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Current facility-calendar period for assistant obligation reads/writes.
 * Weekly periods run Sunday through Saturday and are keyed by their Sunday.
 * Converting the facility calendar date to a UTC-only date keeps DST from
 * changing the day arithmetic.
 */
export function obligationPeriodKey(
  cadence: ObligationPeriodCadence,
  date: Date,
  timeZone = FACILITY_TIME_ZONE,
): string {
  const local = calendarParts(date, timeZone);
  if (cadence === "weekly") {
    const sunday = new Date(Date.UTC(local.year, local.month - 1, local.day));
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
    return `W${ymdUtc(sunday)}`;
  }
  if (cadence === "monthly") {
    return `${local.year}-${String(local.month).padStart(2, "0")}`;
  }
  if (cadence === "quarterly") {
    return `${local.year}-Q${Math.floor((local.month - 1) / 3) + 1}`;
  }
  return `${local.year}`;
}
