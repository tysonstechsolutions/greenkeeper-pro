// Auto-generated route inventory for the route-audit spider.
// Order: recent changes first, then core flows, then everything else.

export type RouteSpec = {
  path: string;
  // Routes that need a query param to render meaningfully. Bogus IDs are fine —
  // the audit just needs the page to attempt to render so we can catch
  // overlap / console errors. Pages that genuinely need a real id will surface
  // as "no data" empty states; those still get inspected for overlap.
  query?: string;
  // Skip if true (e.g. native-only paths).
  skip?: boolean;
};

export const ROUTES: RouteSpec[] = [
  // Phase 0B.5 protected workforce surfaces.
  { path: "/calendar" },
  { path: "/certifications" },
  { path: "/onboarding" },
  { path: "/pro-shop-schedule" },

  // ── recently changed (v1.5.5 → v1.6.2) ──────────────────────────────
  { path: "/assets" },
  { path: "/assets/scan" },
  { path: "/assets/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/assets/untracked" },
  { path: "/assets/untracked/new" },
  { path: "/assets/untracked/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/photos" },
  { path: "/photos/timeline" },

  // ── core flows ──────────────────────────────────────────────────────
  { path: "/dashboard" },
  { path: "/tasks" },
  { path: "/tasks/new" },
  { path: "/tasks/edit", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/tasks/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/course-map" },
  { path: "/course-map/hole", query: "hole=1" },
  { path: "/course-map/green/hole", query: "hole=1" },
  { path: "/course-map/green/measure-at", query: "hole=1" },
  { path: "/equipment" },
  { path: "/equipment/new" },
  { path: "/equipment/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/equipment/service-history-view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/equipment-checkout" },
  { path: "/more" },
  { path: "/notifications" },
  { path: "/messages" },
  { path: "/weather" },

  // ── chemicals ───────────────────────────────────────────────────────
  { path: "/chemicals" },
  { path: "/chemicals/new" },
  { path: "/chemicals/apply" },
  { path: "/chemicals/view", query: "id=00000000-0000-0000-0000-000000000000" },

  // ── plan / schedule / staff ─────────────────────────────────────────
  { path: "/plan" },
  { path: "/plan/new" },
  { path: "/plan/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/schedule" },
  { path: "/schedule/calendar" },
  { path: "/schedule/morning" },
  { path: "/schedule/time-off" },
  { path: "/staff" },
  { path: "/staff/crews" },

  // ── budget ──────────────────────────────────────────────────────────
  { path: "/budget" },
  { path: "/budget/setup" },
  { path: "/budget/overview" },
  { path: "/budget/expenses" },
  { path: "/budget/expense/new" },

  // ── reports / inspections ───────────────────────────────────────────
  { path: "/reports" },
  { path: "/reports/monthly-board" },
  { path: "/inspections" },
  { path: "/inspections/asset-inventory" },

  // ── settings ────────────────────────────────────────────────────────
  { path: "/settings" },
  { path: "/settings/profile" },
  { path: "/settings/course" },
  { path: "/settings/appearance" },
  { path: "/settings/notifications" },
  { path: "/settings/briefing" },
  { path: "/settings/pins" },
  { path: "/settings/pin-sheet" },
  { path: "/settings/invite" },
  { path: "/settings/staff/view", query: "id=00000000-0000-0000-0000-000000000000" },

  // ── knowledge / polls / tournaments ─────────────────────────────────
  { path: "/knowledge" },
  { path: "/knowledge/new" },
  { path: "/knowledge/onboarding" },
  { path: "/knowledge/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/polls" },
  { path: "/polls/manage" },
  { path: "/polls/results/view", query: "id=00000000-0000-0000-0000-000000000000" },
  { path: "/tournaments" },
  { path: "/tournaments/view", query: "id=00000000-0000-0000-0000-000000000000" },

  // ── operational features ────────────────────────────────────────────
  { path: "/checklists" },
  { path: "/compliance" },
  { path: "/clubhouse" },
  { path: "/capital-projects" },
  { path: "/parking-lot" },
  { path: "/order-list" },
  { path: "/irrigation" },
  { path: "/environmental" },
  { path: "/water-usage" },
  { path: "/spray-window" },
  { path: "/drone" },
  { path: "/revenue" },
  { path: "/vendors" },
  { path: "/assistant" },
  { path: "/voice-log" },
  { path: "/feedback" },
  { path: "/report-issue" },

  // ── public ──────────────────────────────────────────────────────────
  { path: "/pin-login" },
  { path: "/login" }, // redirect shim → /pin-login
  { path: "/install" },
  { path: "/offline" },
  { path: "/invite/accept" },
];
