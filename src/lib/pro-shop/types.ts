/**
 * Pro Shop Scheduler — shared types. Mirrors the four tables created in
 * supabase/migrations/20260626_pro_shop_scheduler.sql.
 */

/**
 * Which schedule a person and their shifts belong to. The two areas are kept
 * entirely separate — separate staff, separate months, separate shifts.
 *
 * (The `pro_shop_*` table names predate this and now cover both areas.)
 */
export type ScheduleArea = "pro_shop" | "maintenance";

export const SCHEDULE_AREA_LABELS: Record<ScheduleArea, string> = {
  pro_shop: "Pro Shop",
  maintenance: "Maintenance Crew",
};

export type ProShopPosition =
  | "rec_aid"
  | "golf_ops_assistant"
  | "maintenance_crew"
  | "mechanic";

export type ShiftGroup = "inside" | "outside" | "grounds" | "shop";

/** The groups that belong to each area's schedule. */
export const AREA_GROUPS: Record<ScheduleArea, ShiftGroup[]> = {
  pro_shop: ["inside", "outside"],
  maintenance: ["grounds", "shop"],
};

/** The positions that belong to each area. */
export const AREA_POSITIONS: Record<ScheduleArea, ProShopPosition[]> = {
  pro_shop: ["rec_aid", "golf_ops_assistant"],
  maintenance: ["maintenance_crew", "mechanic"],
};
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
  /**
   * Last day this person works, inclusive. NULL/absent = open-ended, which is
   * the normal case. The schedule engine stops stamping shifts after it, so a
   * leaver can be recorded once and then forgotten about.
   */
  employed_through?: string | null;
  /** Which schedule this person is on. Absent on legacy rows = pro_shop. */
  area?: ScheduleArea;
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
  /** Per-day exceptions to the coverage rules (see DayOverrides). */
  day_overrides?: DayOverrides;
}

/** How many people one group needs on one specific date. */
export interface DayGroupOverride {
  /** People splitting open..close back-to-back. */
  base: number;
  /** Added cover on top, arriving at the rule's extra_start. */
  extra: number;
}

/**
 * One date's exception to the weekday coverage rules. A group with no entry
 * falls back to the rule, so a day nobody has touched behaves as it always did.
 */
export interface DayOverride {
  /** A rebuild skips this day entirely and keeps every shift already on it. */
  locked?: boolean;
  groups?: Partial<Record<ShiftGroup, DayGroupOverride>>;
}

/** Per-day coverage exceptions, keyed by YYYY-MM-DD. Lives on the schedule row. */
export type DayOverrides = Record<string, DayOverride>;

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
  /**
   * A hand-placed shift the GM pinned. Regenerate rebuilds the month around it
   * instead of retiring it. Absent on rows read before the column existed.
   */
  locked?: boolean;
}

/**
 * What a given weekday REQUIRES, rather than what the standing patterns happen
 * to add up to. `base_staff` people split open..close back-to-back — that is
 * what makes a day gap-free — and `extra_staff` more come in at `extra_start`
 * and work to close (the Thu–Sun afternoon rec aid).
 */
export interface CoverageRule {
  id: string;
  area: ScheduleArea;
  /** 0 = Sunday … 6 = Saturday, matching Date.getDay() and WEEKDAY_KEYS. */
  weekday: number;
  group: ShiftGroup;
  open_time: string;
  close_time: string;
  base_staff: number;
  extra_staff: number;
  extra_start: string | null;
}

/** Per-area pay and shift settings. Staff are not paid for lunch. */
export interface ScheduleSettings {
  area: ScheduleArea;
  /** Past this much time on shift, the shift carries an unpaid lunch. */
  lunch_threshold_minutes: number;
  /** How long that unpaid lunch is. */
  lunch_minutes: number;
  /** Longest single shift the generator will build. */
  max_shift_hours: number;
}

/** Matches the column defaults, so the UI works before settings are loaded. */
export const DEFAULT_SCHEDULE_SETTINGS: Omit<ScheduleSettings, "area"> = {
  lunch_threshold_minutes: 360,
  lunch_minutes: 30,
  max_shift_hours: 9,
};

export interface ProShopTimeOff {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

/**
 * A pro-shop duty targets a whole area (rec aids / golf ops / both) or one
 * person. Pinned to the two pro-shop groups on purpose — this is the pro-shop
 * duty roster and must not widen when new schedule areas are added.
 */
export type DutyArea = "inside" | "outside" | "both";

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
  | "no_crew"
  | "no_outside_closer"
  /** Part of the required window has nobody on it — the hole the rules exist to prevent. */
  | "coverage_gap_inside"
  | "coverage_gap_outside"
  /** Fewer people than the day's rule asks for. */
  | "short_staffed_inside"
  | "short_staffed_outside";

export interface DayWarning {
  code: WarningCode;
  message: string;
}

/** Per-day dismissed warning codes, keyed by YYYY-MM-DD. Lives on the schedule row. */
export type DismissedWarnings = Record<string, WarningCode[]>;

/** What each shift group is called on screen and on the printout. */
export const GROUP_LABELS: Record<ShiftGroup, string> = {
  outside: "Rec aids (outside)",
  inside: "Golf ops (inside)",
  grounds: "Grounds crew",
  shop: "Shop / mechanic",
};

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
