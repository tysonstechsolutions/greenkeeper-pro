// Add / edit a recurring duty (an `obligations` row) from the My Duties page.
//
// Until now the only way to add one of Tyson's recurring duties was a SQL
// migration. Managers already have INSERT/UPDATE on the table under RLS
// ("Managers insert/update obligations"), so the form writes it directly.
//
// Pure helpers here; the dialog in components/features/rhythm owns the I/O.

import { liveObligationHref } from "@/lib/operations/obligation-links";
import type { Obligation, ObligationCadence, ObligationWorkspace } from "@/lib/operations/types";

export interface ObligationDraft {
  title: string;
  detail: string;
  cadence: ObligationCadence;
  /** weekly: 0=Sun .. 6=Sat */
  dueWeekday: number;
  /** monthly / quarterly / annual: 1..28, or -1 for the last day of the month */
  dueDay: number;
  /** quarterly: month within the quarter 1..3 · annual: calendar month 1..12 */
  dueMonth: number;
  /** Days of heads-up before the due date (0..90). */
  leadDays: number;
  linkHref: string;
  workspace: ObligationWorkspace;
}

export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));

export const CADENCE_OPTIONS: { value: ObligationCadence; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
  { value: "annual", label: "Every year" },
];

export const WORKSPACE_OPTIONS: { value: ObligationWorkspace; label: string }[] = [
  { value: "general", label: "General" },
  { value: "course", label: "Course & Range" },
  { value: "restaurant", label: "Restaurant" },
  { value: "pro_shop", label: "Pro Shop" },
  { value: "money", label: "Money" },
  { value: "people", label: "People & Paperwork" },
];

/** Sensible heads-up per cadence: enough warning to actually prepare. */
export const DEFAULT_LEAD_DAYS: Record<ObligationCadence, number> = {
  weekly: 1,
  monthly: 5,
  quarterly: 14,
  annual: 30,
};

export function emptyDraft(cadence: ObligationCadence = "monthly"): ObligationDraft {
  return {
    title: "",
    detail: "",
    cadence,
    dueWeekday: 1,
    dueDay: 1,
    dueMonth: 1,
    leadDays: DEFAULT_LEAD_DAYS[cadence],
    linkHref: "",
    workspace: "general",
  };
}

export function draftFromObligation(ob: Obligation): ObligationDraft {
  return {
    title: ob.title,
    detail: ob.detail ?? "",
    cadence: ob.cadence,
    dueWeekday: ob.due_weekday ?? 1,
    dueDay: ob.due_day,
    dueMonth: ob.due_month ?? 1,
    leadDays: ob.lead_days,
    // A link to a page that has since moved is repaired on the next save.
    linkHref: liveObligationHref(ob.link_href) ?? "",
    workspace: ob.workspace,
  };
}

/** First problem with the draft in plain words, or null when it can be saved. */
export function validateDraft(draft: ObligationDraft): string | null {
  if (!draft.title.trim()) return "Give it a name.";
  if (draft.title.trim().length > 200) return "Keep the name under 200 characters.";
  if (!Number.isInteger(draft.leadDays) || draft.leadDays < 0 || draft.leadDays > 90) {
    return "Heads-up days must be between 0 and 90.";
  }
  if (draft.cadence === "weekly") {
    if (!Number.isInteger(draft.dueWeekday) || draft.dueWeekday < 0 || draft.dueWeekday > 6) {
      return "Pick a day of the week.";
    }
  } else if (draft.dueDay !== -1 && (!Number.isInteger(draft.dueDay) || draft.dueDay < 1 || draft.dueDay > 28)) {
    return "Pick a day from 1 to 28, or the last day of the month.";
  }
  if (draft.cadence === "quarterly" && (draft.dueMonth < 1 || draft.dueMonth > 3)) {
    return "Pick which month of the quarter it's due.";
  }
  if (draft.cadence === "annual" && (draft.dueMonth < 1 || draft.dueMonth > 12)) {
    return "Pick the month it's due.";
  }
  const link = draft.linkHref.trim();
  if (link && !link.startsWith("/")) return "Links must be a page in this app, starting with /.";
  return null;
}

/** Columns written for the draft. Fields that don't apply to the cadence are
 *  normalized so the table's CHECK constraints always hold. */
export function draftToColumns(draft: ObligationDraft): Record<string, unknown> {
  const weekly = draft.cadence === "weekly";
  return {
    title: draft.title.trim(),
    detail: draft.detail.trim() || null,
    cadence: draft.cadence,
    due_weekday: weekly ? draft.dueWeekday : null,
    // NOT NULL in the table; ignored by the engine for weekly rows.
    due_day: weekly ? 1 : draft.dueDay,
    due_month: draft.cadence === "quarterly" || draft.cadence === "annual" ? draft.dueMonth : null,
    lead_days: draft.leadDays,
    link_href: draft.linkHref.trim() || null,
    workspace: draft.workspace,
  };
}

/** True when an edit changes WHEN the duty is due (not just its wording). */
export function scheduleChanged(ob: Obligation, draft: ObligationDraft): boolean {
  const before = draftToColumns(draftFromObligation(ob));
  const after = draftToColumns(draft);
  return (["cadence", "due_weekday", "due_day", "due_month"] as const)
    .some((column) => before[column] !== after[column]);
}

/** URL-safe unique slug — the table requires one and it must not collide. */
export function slugForTitle(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "duty";
  return `${base}-${suffix}`;
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/** Plain-English schedule, e.g. "Every Monday" or "Every year on Feb 15". */
export function describeSchedule(
  ob: Pick<Obligation, "cadence" | "due_day" | "due_month" | "due_weekday">,
): string {
  if (ob.cadence === "weekly") return `Every ${WEEKDAY_NAMES[ob.due_weekday ?? 1]}`;
  const last = ob.due_day === -1;
  if (ob.cadence === "monthly") {
    return last ? "Last day of every month" : `Every month on the ${ordinal(ob.due_day)}`;
  }
  if (ob.cadence === "quarterly") {
    const within = Math.min(Math.max(ob.due_month ?? 1, 1), 3);
    const months = [0, 3, 6, 9].map((offset) => MONTH_SHORT[within - 1 + offset]).join(", ");
    return last ? `End of ${months}` : `${months} — on the ${ordinal(ob.due_day)}`;
  }
  const month = MONTH_SHORT[Math.min(Math.max(ob.due_month ?? 1, 1), 12) - 1];
  return last ? `Every year at the end of ${month}` : `Every year on ${month} ${ob.due_day}`;
}
