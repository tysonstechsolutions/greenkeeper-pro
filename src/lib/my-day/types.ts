import type { RecurrenceFrequency } from "./recurrence";

export interface DailyGoal {
  id: string;
  title: string;
  detail: string | null;
  deadline: string | null; // YYYY-MM-DD
  buffer_days: number;
  status: "active" | "done" | "archived";
  // Recurring tasks: how often the task repeats, whether the series is still
  // live, and the id shared by every occurrence of the same recurring task.
  recurrence: RecurrenceFrequency;
  recurrence_active: boolean;
  series_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyStep {
  id: string;
  goal_id: string | null;
  title: string;
  target_date: string | null; // YYYY-MM-DD, null = backlog
  done: boolean;
  done_at: string | null;
  sort_order: number;
  urgent: boolean;
  source: string; // 'manual' | 'ai' | 'pr_received' | ...
  source_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
