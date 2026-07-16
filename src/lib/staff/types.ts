import type { Profile, StaffPersonnelPrivate } from "@/types/database";

/** Manager-facing projection combining directory and restricted personnel rows. */
export type FullProfile = Profile &
  Pick<
    StaffPersonnelPrivate,
    "hire_date" | "certifications" | "emergency_contact" | "personnel_details"
  > & { supervisor_id?: string | null };

export type StaffRecordType =
  | "holiday_pay"
  | "call_out"
  | "sick_time"
  | "disciplinary"
  | "one_on_one"
  | "note";

export interface StaffRecord {
  id: string;
  employee_id: string;
  type: StaffRecordType;
  event_date: string;
  title: string | null;
  details: string | null;
  hours: number | null;
  amount: number | null;
  follow_up: string | null;
  attachment_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffDocument {
  id: string;
  employee_id: string;
  name: string;
  category: string;
  storage_path: string | null;
  url: string | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** One dated note in a concern's running thread. */
export interface ConcernUpdate {
  date: string;
  note: string;
}

/**
 * An employee concern raised in a 1:1. It lives across later 1:1s — gathering
 * a thread of dated notes — until it's reconciled (archived but kept as
 * history). See [[staff-management-system]].
 */
export interface StaffConcern {
  id: string;
  employee_id: string;
  title: string;
  opened_on: string;
  status: "open" | "reconciled";
  reconciled_on: string | null;
  updates: ConcernUpdate[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const RECORD_TYPE_LABELS: Record<StaffRecordType, string> = {
  holiday_pay: "Holiday Pay",
  call_out: "Call-Out",
  sick_time: "Sick Time",
  disciplinary: "Disciplinary",
  one_on_one: "1:1 Meeting",
  note: "Note",
};

export const RECORD_TYPE_COLORS: Record<StaffRecordType, string> = {
  holiday_pay: "bg-emerald-100 text-emerald-800",
  call_out: "bg-amber-100 text-amber-800",
  sick_time: "bg-sky-100 text-sky-800",
  disciplinary: "bg-red-100 text-red-800",
  one_on_one: "bg-indigo-100 text-indigo-800",
  note: "bg-muted text-muted-foreground",
};

/** Which record types use the hours / amount fields. */
export const RECORD_TYPES_WITH_HOURS: StaffRecordType[] = ["call_out", "sick_time", "holiday_pay"];
export const RECORD_TYPES_WITH_AMOUNT: StaffRecordType[] = ["holiday_pay"];

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  offer: "Offer / Hire",
  certification: "Certification / License",
  tax: "Tax / Payroll (W-4, I-9)",
  review: "Performance Review",
  id: "ID / Personal",
  other: "Other",
};

export const DOC_CATEGORY_ORDER = ["offer", "certification", "tax", "review", "id", "other"];
