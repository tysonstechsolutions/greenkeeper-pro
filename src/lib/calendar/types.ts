export type CalendarEventCategory =
  | "fb_event"
  | "appointment"
  | "meeting"
  | "deadline"
  | "other";

export interface CalendarEvent {
  id: string;
  title: string;
  category: CalendarEventCategory;
  event_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  expected_guests: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OneOnOneStatus = "scheduled" | "completed" | "canceled";

/** A scheduled (reschedulable) 1:1 meeting — the discussion is logged separately. */
export interface OneOnOneMeeting {
  id: string;
  employee_id: string;
  scheduled_on: string;
  scheduled_time: string | null;
  status: OneOnOneStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CalendarSource =
  | "tournament"
  | "one_on_one"
  | "calendar_event"
  | "daily_goal";

/** Normalized item the calendar view renders (from any of the 3 sources). */
export interface CalendarItem {
  source: CalendarSource;
  sourceId: string;
  /** "golf" | "one_on_one" | CalendarEventCategory */
  kind: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate: string | null;
  time: string | null;
  href: string | null;
  subtitle: string | null;
}

/** Per-kind label + Tailwind colors for chips/dots. */
export const CALENDAR_KIND_META: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  golf: { label: "Golf", chip: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300", dot: "bg-green-500" },
  task: { label: "Task", chip: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300", dot: "bg-violet-500" },
  one_on_one: { label: "1:1", chip: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300", dot: "bg-blue-500" },
  fb_event: { label: "F&B", chip: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300", dot: "bg-amber-500" },
  appointment: { label: "Appointment", chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-500" },
  meeting: { label: "Meeting", chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-500" },
  deadline: { label: "Deadline", chip: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300", dot: "bg-red-500" },
  other: { label: "Other", chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-500" },
};

export function kindMeta(kind: string) {
  return CALENDAR_KIND_META[kind] ?? CALENDAR_KIND_META.other;
}

export const CALENDAR_CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  fb_event: "F&B event",
  appointment: "Appointment",
  meeting: "Meeting",
  deadline: "Deadline",
  other: "Other",
};
