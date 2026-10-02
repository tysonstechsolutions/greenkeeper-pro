/**
 * Gather what the app already knows about an employee for a rating period,
 * so the GM doesn't have to remember it and the draft can lean on it.
 * Pure function — the data hook does the fetching.
 */
import type { OneOnOneSession } from "@/lib/oneonone/types";
import type { StaffConcern, StaffRecord } from "@/lib/staff/types";
import type { Certification, PersonnelDetails } from "@/types/database";
import { inPeriod } from "./period";
import type { EvaluationFacts, EvaluationPeriod } from "./types";

export interface FactsInput {
  period: Pick<EvaluationPeriod, "start" | "end">;
  hireDate: string | null;
  personnel: PersonnelDetails | null;
  certifications: Certification[] | null;
  records: StaffRecord[];
  sessions: OneOnOneSession[];
  concerns: StaffConcern[];
}

/** Most recent 1:1 summaries passed along to the draft. */
const MAX_SESSION_SUMMARIES = 6;

function sumHours(rows: StaffRecord[]): number {
  const total = rows.reduce((acc, r) => acc + (typeof r.hours === "number" ? r.hours : 0), 0);
  return Math.round(total * 100) / 100;
}

/** "NF-0189-02" or "NA-5703-05 Step 3" from the personnel record. */
export function payPlanGrade(p: PersonnelDetails | null): string | null {
  if (!p) return null;
  const parts = [p.pay_plan, p.occ_series, p.pay_band].filter((x) => x && String(x).trim());
  if (parts.length === 0) return null;
  const base = parts.join("-");
  return p.step && p.step.trim() ? `${base} Step ${p.step.trim()}` : base;
}

export function buildFacts(input: FactsInput): EvaluationFacts {
  const { period } = input;
  const records = input.records.filter((r) => inPeriod(r.event_date, period));
  const callOuts = records.filter((r) => r.type === "call_out");
  const sick = records.filter((r) => r.type === "sick_time");
  const disciplinary = records
    .filter((r) => r.type === "disciplinary")
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .map((r) => ({ date: r.event_date, title: (r.title || r.details || "Disciplinary record").trim() }));

  const sessions = input.sessions
    .filter((s) => s.status === "completed" && inPeriod(s.session_date, period))
    .sort((a, b) => b.session_date.localeCompare(a.session_date));

  const opened = input.concerns.filter((c) => inPeriod(c.opened_on, period));
  const reconciled = input.concerns.filter(
    (c) => c.status === "reconciled" && inPeriod(c.reconciled_on, period),
  );
  const stillOpen = input.concerns.filter((c) => c.status === "open");

  return {
    hire_date: input.hireDate,
    position_title: input.personnel?.position_title?.trim() || null,
    pay_plan_grade: payPlanGrade(input.personnel),
    call_outs: { count: callOuts.length, hours: sumHours(callOuts) },
    sick_time: { count: sick.length, hours: sumHours(sick) },
    disciplinary,
    one_on_ones: {
      count: sessions.length,
      summaries: sessions
        .filter((s) => (s.summary ?? "").trim())
        .slice(0, MAX_SESSION_SUMMARIES)
        .map((s) => ({ date: s.session_date, summary: (s.summary as string).trim() })),
    },
    follow_ups: {
      opened: opened.length,
      reconciled: reconciled.length,
      open_titles: stillOpen.map((c) => c.title),
    },
    certifications: (input.certifications ?? [])
      .filter((c) => c && c.name)
      .map((c) => ({ name: c.name, expiry_date: c.expiry_date ?? null })),
  };
}

/** Plain-English lines for the "What the app already knows" panel. */
export function describeFacts(facts: EvaluationFacts): string[] {
  const lines: string[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const hours = (h: number) => (h > 0 ? ` (${h} hrs)` : "");

  lines.push(`${plural(facts.call_outs.count, "call-out")}${hours(facts.call_outs.hours)}`);
  lines.push(`${plural(facts.sick_time.count, "sick-time entry", "sick-time entries")}${hours(facts.sick_time.hours)}`);
  lines.push(`${plural(facts.one_on_ones.count, "1:1")} on record this period`);
  if (facts.follow_ups.opened || facts.follow_ups.reconciled) {
    lines.push(
      `${plural(facts.follow_ups.opened, "follow-up")} opened, ${facts.follow_ups.reconciled} resolved`,
    );
  }
  if (facts.disciplinary.length) {
    lines.push(
      `${plural(facts.disciplinary.length, "disciplinary record")}: ${facts.disciplinary
        .map((d) => `${d.title} (${d.date})`)
        .join("; ")}`,
    );
  }
  if (facts.certifications.length) {
    lines.push(`Certifications: ${facts.certifications.map((c) => c.name).join(", ")}`);
  }
  return lines;
}
