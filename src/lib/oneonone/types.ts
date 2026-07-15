/**
 * Types for the dynamic 1:1 system. Sessions capture a structured Q&A; the
 * engagement profile is the per-employee memory the AI grows over time; and
 * proposed actions are the routed outcomes ("add to my to-do", "vacation",
 * "wants more hours") the GM approves after a 1:1.
 */

export type OneOnOneTemplate = "transition" | "thirty_day" | "monthly" | "custom";

export const TEMPLATE_LABELS: Record<OneOnOneTemplate, string> = {
  transition: "Transition 1:1",
  thirty_day: "New Hire 30-Day",
  monthly: "Monthly 1:1",
  custom: "Custom",
};

/** When to reach for each template — shown under the Start a 1:1 buttons. */
export const TEMPLATE_HINTS: Record<OneOnOneTemplate, string> = {
  monthly: "Your recurring check-in. Questions get more personal each time.",
  transition: "Your first 1:1 as GM. Run once per person.",
  thirty_day: "For a new hire, around their 30-day mark.",
  custom: "",
};

/** The section ad-hoc questions added mid-session are filed under. */
export const ADHOC_SECTION = "Added during the 1:1";

/** One question + its captured answer within a session. */
export interface OneOnOneQuestion {
  id: string;
  section: string;
  prompt: string;
  answer: string;
}

export interface OneOnOneSession {
  id: string;
  employee_id: string;
  session_date: string;
  template: OneOnOneTemplate;
  status: "draft" | "completed";
  questions: OneOnOneQuestion[];
  summary: string | null;
  scheduled_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The per-employee memory that makes monthly 1:1s personal. */
export interface EngagementProfile {
  interests: string[];
  family: string[];
  career_goals: string[];
  sports: string[];
  life_goals: string[];
  communication_notes: string;
  misc: string[];
}

export function emptyEngagementProfile(): EngagementProfile {
  return {
    interests: [],
    family: [],
    career_goals: [],
    sports: [],
    life_goals: [],
    communication_notes: "",
    misc: [],
  };
}

export interface EngagementProfileRow {
  employee_id: string;
  profile: EngagementProfile;
  created_at: string;
  updated_at: string;
}

// ── Post-session action routing ────────────────────────────────────────────

export type OneOnOneActionType =
  | "task" // something for the GM to do → My Day
  | "hours_pref" // wants more/fewer hours → scheduling preference on their page
  | "time_off" // day off / vacation → time_off_requests
  | "follow_up" // something to revisit → staff_concerns (Follow-ups)
  | "profile" // a personal fact → engagement profile
  | "calendar"; // a dated event → calendar_events

/**
 * A change the AI proposes after reading the 1:1 answers. Nothing is written
 * until the GM approves it in the review card. Fields are per-type; unused
 * ones are omitted.
 */
export interface ProposedAction {
  type: OneOnOneActionType;
  /** Human summary shown in the review checklist. */
  label: string;

  // task
  title?: string;
  detail?: string | null;
  due_date?: string | null;

  // hours_pref
  preference?: string;

  // time_off
  start_date?: string;
  end_date?: string;
  request_type?: "vacation" | "sick" | "personal" | "military" | "other";
  reason?: string;

  // follow_up
  follow_up_title?: string;
  follow_up_note?: string;

  // calendar
  event_title?: string;
  event_date?: string;
  event_category?: "fb_event" | "appointment" | "meeting" | "deadline" | "other";

  // profile
  profile_updates?: Partial<EngagementProfile>;
}

/** Result of the one-on-one-digest edge function. */
export interface DigestResult {
  summary: string;
  profile_updates: Partial<EngagementProfile>;
  actions: ProposedAction[];
}
