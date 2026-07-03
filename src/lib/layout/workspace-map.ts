// Route → workspace mapping for the AI assistant (Operation Blueprint
// Phase 3). The chat carries the workspace it was opened from so the edge
// function scopes its guidance, and the empty-state chips match the area.

export type WorkspaceKey =
  | "today"
  | "course"
  | "restaurant"
  | "pro_shop"
  | "money"
  | "people";

export const WORKSPACE_KEYS: readonly WorkspaceKey[] = [
  "today",
  "course",
  "restaurant",
  "pro_shop",
  "money",
  "people",
];

const PREFIXES: [string, WorkspaceKey][] = [
  ["/today", "today"],
  ["/my-day", "today"],
  ["/calendar", "today"],
  ["/grounds", "course"],
  ["/dashboard", "course"],
  ["/course-map", "course"],
  ["/irrigation", "course"],
  ["/parking-lot", "course"],
  ["/clubhouse", "course"],
  ["/weather", "course"],
  ["/environmental", "course"],
  ["/ast-inspections", "course"],
  ["/photos", "course"],
  ["/voice-log", "course"],
  ["/schedule", "course"],
  ["/tasks", "course"],
  ["/work-orders", "course"],
  ["/report-issue", "course"],
  ["/restaurant", "restaurant"],
  ["/pro-shop", "pro_shop"], // also matches /pro-shop-schedule
  ["/tournaments", "pro_shop"],
  ["/money", "money"],
  ["/budget", "money"],
  ["/revenue", "money"],
  ["/fuel", "money"],
  ["/purchase-requests", "money"],
  ["/pr-audit", "money"],
  ["/financial-watch", "money"],
  ["/order-list", "money"],
  ["/vendors", "money"],
  ["/capital-projects", "money"],
  ["/gm", "money"],
  ["/people", "people"],
  ["/staff", "people"],
  ["/onboarding", "people"],
  ["/paperwork", "people"],
  ["/sow", "people"],
  ["/sole-source", "people"],
  ["/dd-forms", "people"],
  ["/documents", "people"],
  ["/knowledge", "people"],
];

/** Workspace the given route belongs to, or null for neutral pages. */
export function workspaceForPath(pathname: string): WorkspaceKey | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  for (const [prefix, ws] of PREFIXES) {
    if (p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix + "-")) {
      // The "-" case covers /pro-shop-schedule under /pro-shop.
      return ws;
    }
  }
  return null;
}

export function isWorkspaceKey(v: unknown): v is WorkspaceKey {
  return typeof v === "string" && (WORKSPACE_KEYS as readonly string[]).includes(v);
}

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  today: "Today",
  course: "Course & Range",
  restaurant: "Restaurant",
  pro_shop: "Pro Shop",
  money: "Money",
  people: "People & Paperwork",
};

/** Empty-state chips per workspace — each one exercises a real tool. */
export const WORKSPACE_PROMPTS: Record<WorkspaceKey, string[]> = {
  today: [
    "What obligations are coming due?",
    "Mark the tank inspections done",
    "Add a duty: blow off the clubhouse patio every Friday",
    "Create a task to change the cups tomorrow",
  ],
  course: [
    "Log a fuel delivery from Reladyne",
    "Create a task to fix the sprinkler on 7",
    "We need more bunker sand on the order list",
    "What tasks are open right now?",
  ],
  restaurant: [
    "Record yesterday's food and beverage revenue",
    "Schedule a party in the restaurant",
    "Add a Friday fryer-cleaning duty",
    "Mark the fire extinguisher checks done",
  ],
  pro_shop: [
    "Schedule a tournament",
    "Record this month's pro shop sales",
    "Mark the pro shop inventory count done",
    "What leagues are on the calendar?",
  ],
  money: [
    "A receipt came back — record the actual cost on a PR",
    "Enter last month's RecTrac rounds total",
    "Log a fuel delivery",
    "How's the budget looking?",
  ],
  people: [
    "Who's on the schedule today?",
    "Look up a staff member's info",
    "Create a task to finish the SF-52 paperwork",
    "What certifications do we track?",
  ],
};
