/**
 * The "don't let it slip" list on Today: evaluations due or overdue,
 * evaluation follow-through, new hires reaching 90 days, certifications
 * and vendor 889s running out, and people whose last day is coming up.
 *
 * Pure and date-injected. useReminders loads the rows.
 */
import { addDays, dueText, NEW_HIRE_DAYS } from "@/lib/evaluations/period";
import { followThrough } from "@/lib/evaluations/follow-through";
import { evaluationEditHref, evaluationListHref } from "@/lib/evaluations/links";
import type { NinetyDayEntry, RosterEntry } from "@/lib/evaluations/use-evaluations";
import { section889Status } from "@/lib/section-889";

/** How far ahead to warn. */
export const REMINDER_WINDOW_DAYS = 14;
export const EXPIRY_WINDOW_DAYS = 30;

export type ReminderTone = "overdue" | "soon";
export type ReminderKind = "evaluation" | "follow_through" | "ninety_day_mark" | "certification" | "section_889" | "last_day";

export interface Reminder {
  key: string;
  kind: ReminderKind;
  tone: ReminderTone;
  title: string;
  detail: string;
  href: string;
  /** The date it's about (due, expires, last day), for sorting. */
  date: string;
}

export interface ReminderInput {
  todayIso: string;
  /** Year-end roster entries (already limited to whoever the viewer evaluates). */
  yearEnd: RosterEntry[];
  ninetyDay: NinetyDayEntry[];
  /** Fiscal year of the year-end period, for links. */
  fiscalYear: number;
  /** Active people the viewer manages, with hire date and recorded last day. */
  people: { id: string; name: string; hireDate: string | null; separationDate: string | null }[];
  certifications: { id: string; holder: string; profile_id: string | null; cert_name: string; expires_date: string | null }[];
  /** Null = the viewer doesn't handle vendors (skip 889s). */
  vendors:
    | { id: string; name: string; section_889_path: string | null; section_889_expiration_date: string | null }[]
    | null;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export function buildReminders(input: ReminderInput): Reminder[] {
  const { todayIso } = input;
  const out: Reminder[] = [];
  const managed = new Set(input.people.map((p) => p.id));

  // Evaluations still to write.
  for (const e of input.yearEnd) {
    if (e.progress === "final" || (e.due !== "overdue" && e.due !== "due_soon")) continue;
    out.push({
      key: `eval-${e.profile.id}`,
      kind: "evaluation",
      tone: e.due === "overdue" ? "overdue" : "soon",
      title: `Year-end evaluation: ${e.profile.full_name || "Employee"}`,
      detail: dueText(e.dueDate, todayIso),
      href: evaluationEditHref(e.profile.id, { fy: input.fiscalYear }),
      date: e.dueDate,
    });
  }
  for (const n of input.ninetyDay) {
    if (n.progress === "final" || (n.due !== "overdue" && n.due !== "due_soon")) continue;
    out.push({
      key: `ninety-${n.profile.id}`,
      kind: "evaluation",
      tone: n.due === "overdue" ? "overdue" : "soon",
      title: `90-day evaluation: ${n.profile.full_name || "Employee"}`,
      detail: dueText(n.dueDate, todayIso),
      href: evaluationEditHref(n.profile.id, { ninetyDayStart: n.hireDate }),
      date: n.dueDate,
    });
  }

  // Finished evaluations not yet signed, discussed, and handed over.
  const finals: { name: string; id: string; ev: RosterEntry["evaluation"]; href: string; what: string }[] = [
    ...input.yearEnd.map((e) => ({
      name: e.profile.full_name || "Employee",
      id: e.profile.id,
      ev: e.evaluation,
      href: evaluationEditHref(e.profile.id, { fy: input.fiscalYear }),
      what: "year-end",
    })),
    ...input.ninetyDay.map((n) => ({
      name: n.profile.full_name || "Employee",
      id: n.profile.id,
      ev: n.evaluation,
      href: evaluationEditHref(n.profile.id, { ninetyDayStart: n.hireDate }),
      what: "90-day",
    })),
  ];
  for (const f of finals) {
    const ft = followThrough(f.ev, todayIso);
    if (!ft || ft.complete) continue;
    const soon = daysBetween(todayIso, ft.dueDate) <= 3;
    if (!ft.overdue && !soon) continue;
    out.push({
      key: `follow-${f.what}-${f.id}`,
      kind: "follow_through",
      tone: ft.overdue ? "overdue" : "soon",
      title: `Finish ${f.name}'s ${f.what} evaluation`,
      detail: `Still needs: ${ft.missing.map((m) => m.short).join(", ")} · ${ft.overdue ? "was due" : "due"} ${shortDate(ft.dueDate)}`,
      href: f.href,
      date: ft.dueDate,
    });
  }

  // New hires about to reach 90 days (the evaluation list picks them up on the day).
  for (const p of input.people) {
    if (!p.hireDate) continue;
    const mark = addDays(p.hireDate, NEW_HIRE_DAYS);
    const until = daysBetween(todayIso, mark);
    if (until < 1 || until > REMINDER_WINDOW_DAYS) continue;
    out.push({
      key: `mark-${p.id}`,
      kind: "ninety_day_mark",
      tone: "soon",
      title: `${p.name} reaches 90 days`,
      detail: `${shortDate(mark)} (in ${until} day${until === 1 ? "" : "s"}) · 90-day evaluation due then`,
      href: evaluationListHref({ ninetyDayStart: p.hireDate }),
      date: mark,
    });
  }

  // Last days on the books.
  for (const p of input.people) {
    if (!p.separationDate) continue;
    const until = daysBetween(todayIso, p.separationDate);
    if (until < 0 || until > REMINDER_WINDOW_DAYS) continue;
    out.push({
      key: `last-${p.id}`,
      kind: "last_day",
      tone: "soon",
      title: `${p.name}'s last day`,
      detail: `${until === 0 ? "Today" : shortDate(p.separationDate)} · collect keys and gear, take them off the schedule`,
      href: `/staff/profile?id=${p.id}`,
      date: p.separationDate,
    });
  }

  // Certifications running out (only for people the viewer manages, when linked).
  for (const c of input.certifications) {
    if (!c.expires_date) continue;
    if (c.profile_id && managed.size > 0 && !managed.has(c.profile_id)) continue;
    const until = daysBetween(todayIso, c.expires_date);
    if (until > EXPIRY_WINDOW_DAYS) continue;
    out.push({
      key: `cert-${c.id}`,
      kind: "certification",
      tone: until < 0 ? "overdue" : "soon",
      title: `${c.holder}: ${c.cert_name}`,
      detail: until < 0 ? `Expired ${shortDate(c.expires_date)}` : `Expires ${shortDate(c.expires_date)}`,
      href: "/certifications",
      date: c.expires_date,
    });
  }

  // Vendor 889 forms (needed on every PR).
  for (const v of input.vendors ?? []) {
    const status = section889Status(v, todayIso);
    if (status !== "expired" && status !== "expiring_soon") continue;
    out.push({
      key: `889-${v.id}`,
      kind: "section_889",
      tone: status === "expired" ? "overdue" : "soon",
      title: `${v.name}: Section 889 form`,
      detail: `${status === "expired" ? "Expired" : "Expires"} ${shortDate(v.section_889_expiration_date!)} · get a new one before the next PR`,
      href: "/vendors",
      date: v.section_889_expiration_date!,
    });
  }

  return out.sort(
    (a, b) => (a.tone === b.tone ? 0 : a.tone === "overdue" ? -1 : 1) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}
