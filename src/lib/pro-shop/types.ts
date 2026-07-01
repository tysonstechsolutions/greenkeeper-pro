/**
 * Pro Shop Scheduler — shared types. Mirrors the four tables created in
 * supabase/migrations/20260626_pro_shop_scheduler.sql.
 */

export type ProShopPosition = "rec_aid" | "golf_ops_assistant";
export type ShiftGroup = "inside" | "outside";
export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** One weekday in a person's standing weekly pattern. */
export interface DayPattern {
  works: boolean;
  group?: ShiftGroup;
  /** "HH:MM" 24h. */
  start?: string;
  end?: string;
}

export interface WeeklyAvailability {
  weekly: Record<WeekdayKey, DayPattern>;
  notes?: string;
}

export interface ProShopStaff {
  id: string;
  full_name: string;
  position: ProShopPosition;
  default_group: ShiftGroup;
  availability_text: string | null;
  /** Standing weekly pattern. May be `{}` for a brand-new hire. */
  availability: Partial<WeeklyAvailability>;
  /** Flex employees can be pulled to cover any area (inside or outside). */
  flex: boolean;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

export interface ProShopSchedule {
  id: string;
  /** First-of-month date, e.g. "2026-06-01". */
  month: string;
  title: string;
  status: "draft" | "published";
  notes: string | null;
  /** Per-day dismissed coverage-warning codes (see DismissedWarnings). */
  dismissed_warnings: DismissedWarnings;
}

export interface ProShopShift {
  id: string;
  schedule_id: string | null;
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  /** Postgres returns "HH:MM:SS". */
  start_time: string;
  end_time: string;
  source: "template" | "ai" | "manual";
  note: string | null;
}

export interface ProShopTimeOff {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

/** A duty targets a whole area (rec aids / golf ops / both) or one person. */
export type DutyArea = ShiftGroup | "both";

/** A standing daily duty for the pro-shop jobs, recurring on set weekdays. */
export interface ProShopDuty {
  id: string;
  title: string;
  /** Set iff this duty is assigned to an area (not a specific person). */
  area: DutyArea | null;
  /** Set iff this duty is assigned to one person (not an area). */
  staff_id: string | null;
  /** Weekday keys it recurs on, e.g. ["mon","wed","fri"]. */
  days: WeekdayKey[];
  note: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Stable coverage-warning codes (see dayWarnings). */
export type WarningCode =
  | "no_outside"
  | "no_inside"
  | "no_inside_opener"
  | "no_inside_closer"
  | "no_outside_closer";

export interface DayWarning {
  code: WarningCode;
  message: string;
}

/** Per-day dismissed warning codes, keyed by YYYY-MM-DD. Lives on the schedule row. */
export type DismissedWarnings = Record<string, WarningCode[]>;

export const DUTY_AREA_LABELS: Record<DutyArea, string> = {
  outside: "Rec Aids (Outside)",
  inside: "Golf Ops (Inside)",
  both: "Both areas",
};

export const WEEKDAY_KEYS: WeekdayKey[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export function positionGroup(position: ProShopPosition): ShiftGroup {
  return position === "golf_ops_assistant" ? "inside" : "outside";
}

/** Empty 7-day "off" pattern — the starting point for a new hire's availability. */
export function emptyWeekly(): Record<WeekdayKey, DayPattern> {
  return {
    sun: { works: false },
    mon: { works: false },
    tue: { works: false },
    wed: { works: false },
    thu: { works: false },
    fri: { works: false },
    sat: { works: false },
  };
}
