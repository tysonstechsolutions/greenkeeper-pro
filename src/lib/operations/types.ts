// Operating-rhythm types — mirror the 20260702_operating_rhythm.sql tables.

export type ObligationCadence = "monthly" | "quarterly" | "annual";
export type ObligationWorkspace =
  | "course"
  | "restaurant"
  | "pro_shop"
  | "money"
  | "people"
  | "general";
export type DutyArea = "course" | "restaurant" | "pro_shop";
export type DutySeason = "in_season" | "year_round";

export interface Obligation {
  id: string;
  slug: string;
  title: string;
  detail: string | null;
  workspace: ObligationWorkspace;
  cadence: ObligationCadence;
  /** 1..28, or -1 = last day of the due month. */
  due_day: number;
  /** annual: calendar month 1..12; quarterly: month within quarter 1..3. */
  due_month: number | null;
  lead_days: number;
  delegable: boolean;
  link_href: string | null;
  is_active: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ObligationCompletion {
  id: string;
  obligation_id: string;
  /** '2026-07' (monthly) | '2026-Q3' (quarterly) | '2026' (annual). */
  period: string;
  completed_at: string;
  completed_by: string | null;
  note: string | null;
}

export type ObligationStatus = "done" | "overdue" | "due_soon" | "upcoming";

/** One obligation evaluated against today — what the UI renders. */
export interface EvaluatedObligation {
  obligation: Obligation;
  /** Period key of the occurrence being shown. */
  period: string;
  /** Due date of that occurrence, local YYYY-MM-DD. */
  dueDate: string;
  status: ObligationStatus;
  /** Days from today to the due date (negative = overdue by that many). */
  daysUntil: number;
}

export interface OperationDuty {
  id: string;
  title: string;
  area: DutyArea;
  /** Weekday keys, e.g. ["mon","wed"] — same convention as pro_shop_duties. */
  days: string[];
  season: DutySeason;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DutyCompletion {
  id: string;
  duty_id: string;
  duty_date: string;
  completed_at: string;
  completed_by: string | null;
}
