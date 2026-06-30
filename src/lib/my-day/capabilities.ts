/**
 * Capability matching — recognize when a My Day task maps to something the app
 * can already do, so the task can deep-link straight to that tool instead of
 * being a dumb checkbox. Pure + deterministic (keyword/regex), so it works with
 * no AI and no network; used both to route a typed task and to render the
 * "Do it" link on a step.
 *
 * `available: false` entries are recognized but NOT built in the app yet (e.g.
 * DD-200 / DD-2212) — surfaced so the UI can say so rather than dead-link.
 */
export interface Capability {
  key: string;
  /** Short name of the form/tool, e.g. "SF-52". */
  label: string;
  /** Call to action shown on the step, e.g. "Open the SF-52 filler". */
  action: string;
  /** Where "Do it" goes (empty when not available). */
  href: string;
  available: boolean;
  patterns: RegExp[];
}

const CAPABILITIES: Capability[] = [
  {
    key: "sf52",
    label: "SF-52",
    action: "Open the SF-52 filler",
    href: "/staff/sf52",
    available: true,
    patterns: [/\bsf[\s-]?52\b/i, /personnel action/i],
  },
  {
    key: "sole_source",
    label: "Sole Source",
    action: "Open Sole Source",
    href: "/sole-source",
    available: true,
    patterns: [/sole[\s-]?source/i],
  },
  {
    key: "sow",
    label: "Statement of Work",
    action: "Open the SOW writer",
    href: "/sow",
    available: true,
    patterns: [/\bsow\b/i, /statement of work/i],
  },
  {
    key: "pr",
    label: "Purchase Request",
    action: "Create a PR",
    href: "/purchase-requests/new",
    available: true,
    // "purchase request", or "pr" near a create/submit/new verb — NOT plain "order".
    patterns: [
      /purchase request/i,
      /\bpr\b[\s\S]{0,15}\b(create|new|submit|start|build)\b/i,
      /\b(create|new|submit|start|build)\b[\s\S]{0,15}\bpr\b/i,
    ],
  },
  {
    key: "work_order",
    label: "Work Order",
    action: "Open Work Orders",
    href: "/work-orders",
    available: true,
    patterns: [/work[\s-]?order/i],
  },
  {
    key: "onboarding",
    label: "Onboarding & SOPs",
    action: "Open Onboarding",
    href: "/onboarding",
    available: true,
    patterns: [/\bonboard/i, /new[\s-]?hire packet/i],
  },
  // Recognized but NOT built in the app yet.
  {
    key: "dd200",
    label: "DD-200",
    action: "",
    href: "",
    available: false,
    patterns: [/\bdd[\s-]?200\b/i],
  },
  {
    key: "dd2212",
    label: "DD-2212",
    action: "",
    href: "",
    available: false,
    patterns: [/\bdd[\s-]?2212\b/i],
  },
];

/** First capability whose pattern matches the task title, or null. */
export function matchCapability(title: string): Capability | null {
  for (const c of CAPABILITIES) {
    if (c.patterns.some((p) => p.test(title))) return c;
  }
  return null;
}
