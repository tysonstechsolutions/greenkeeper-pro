// Types for the FY24 Navy Standards gap plan.

export type Priority = "P1" | "P2" | "P3" | "P4";
export type Effort = "Low" | "Medium" | "High";
export type Status = "Not Started" | "Planned" | "In Progress" | "Blocked" | "Done";

export interface PlanEntry {
  id: string;
  section: string;
  section_name: string;
  subsection: string;
  answer: "N" | "Blank";
  short_title: string;
  standard_text: string;
  possible_score: number;
  current_state: string;
  target_state: string;
  actions: string[];
  owner: string;
  secondary_owners: string[];
  timeline: string;
  cost_estimate: string;
  cost_value: number;
  dependencies: string[];
  priority: Priority;
  effort: Effort;
  status: Status;
  notes: string;
}

export interface SubsectionScore {
  earned: number;
  possible: number;
  y: number;
  n: number;
  na: number;
  blank: number;
  percent: number;
}

export interface GapPlan {
  course: string;
  installation: string;
  superintendent: string;
  as_of: string;
  summary: {
    total_gaps: number;
    by_section: Record<string, number>;
    by_priority: Record<string, number>;
    by_owner: Record<string, number>;
    total_cost_estimate: number;
  };
  section_names: Record<string, string>;
  section_weights: Record<string, number>;
  subsection_scores: Record<string, SubsectionScore>;
  entries: PlanEntry[];
}
