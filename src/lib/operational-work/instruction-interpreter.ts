/**
 * Deterministic natural-language interpreter for the per-task instruction box
 * on the Operations Command Center. The GM types a plain-English instruction
 * ("move this to Wednesday", "assign to John", "mark done", "draft an email to
 * leadership") and this maps it to one concrete, reviewable action.
 *
 * Dates and actions are computed deterministically — never guessed by an AI —
 * so the resolved date is always correct and explainable. Anything it can't
 * confidently map returns `unknown`, and the UI offers the full AI assistant.
 */

export type InterpretedAction =
  | { kind: "reschedule"; date: string; note: string; recurringHint: string | null; summary: string }
  | { kind: "complete"; summary: string }
  | { kind: "assign"; employeeId: string; employeeName: string; dueDate: string; note: string; summary: string }
  | { kind: "priority"; override: number; reason: string; summary: string }
  | { kind: "email"; instruction: string; summary: string }
  | { kind: "unknown"; summary: string };

export interface InterpretStaff {
  id: string;
  name: string;
}

export interface InterpretContext {
  today: Date;
  dueDate: string | null;
  staff: InterpretStaff[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Next occurrence of a weekday strictly after today (never today itself). */
function nextWeekday(today: Date, target: number): Date {
  const diff = ((target - today.getDay() + 7) % 7) || 7;
  return addDays(today, diff);
}

function niceDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Resolve a target date phrase from free text, or null if none is present. */
function resolveDate(text: string, today: Date): Date | null {
  // Explicit ISO date: 2026-09-15
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // M/D or M/D/YYYY
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const candidate = new Date(year, month, day);
    if (!slash[3] && candidate < today) candidate.setFullYear(year + 1);
    return candidate;
  }

  // Month name + day: "august 4", "aug 4th"
  const monthName = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthName && MONTHS[monthName[1]] !== undefined) {
    const month = MONTHS[monthName[1]];
    const day = Number(monthName[2]);
    const candidate = new Date(today.getFullYear(), month, day);
    if (candidate < today) candidate.setFullYear(today.getFullYear() + 1);
    return candidate;
  }

  if (/\btomorrow\b/.test(text)) return addDays(today, 1);
  if (/\btoday\b/.test(text)) return today;
  if (/\bday after tomorrow\b/.test(text)) return addDays(today, 2);

  // "in N days", "in a week", "in two weeks", "in a month"
  const inDays = text.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) return addDays(today, Number(inDays[1]));
  if (/\bin\s+(a|one)\s+week\b/.test(text) || /\bnext week\b/.test(text)) return addDays(today, 7);
  if (/\bin\s+(two|2)\s+weeks\b/.test(text)) return addDays(today, 14);
  if (/\bin\s+(a|one)\s+month\b/.test(text) || /\bnext month\b/.test(text)) return addDays(today, 30);

  // Weekday name (with or without "next")
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return nextWeekday(today, dow);
  }
  return null;
}

function detectRecurring(text: string): string | null {
  if (/\bevery\b|\bweekly\b|\beach\s+(week|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\brecurr?ing\b/.test(text)) {
    return "You mentioned this should repeat. I moved this one occurrence — set up a recurring duty for the full pattern.";
  }
  return null;
}

function matchStaff(text: string, staff: InterpretStaff[]): InterpretStaff | null {
  for (const person of staff) {
    if (!person.name) continue;
    const full = person.name.toLowerCase();
    const first = full.split(/\s+/)[0];
    if (new RegExp(`\\b${escapeRegex(full)}\\b`).test(text)) return person;
    if (first.length >= 2 && new RegExp(`\\b${escapeRegex(first)}\\b`).test(text)) return person;
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function interpretTaskInstruction(
  rawText: string,
  context: InterpretContext,
): InterpretedAction {
  const text = rawText.toLowerCase().trim();
  if (!text) return { kind: "unknown", summary: "Type an instruction first." };
  const { today } = context;

  // 1. Email / draft / write to leadership
  if (/\b(email|e-mail|draft|write up|write to|notify|send (this |it )?to (leadership|the boss|my boss|the chain|command))\b/.test(text)) {
    return { kind: "email", instruction: rawText.trim(), summary: "Draft an email you can review and send." };
  }

  // 2. Mark complete
  if (/\b(mark (it |this )?(done|complete|completed)|it'?s done|already done|finished|completed it|done with (this|it)|complete this)\b/.test(text)) {
    return { kind: "complete", summary: "Mark this done and record the time." };
  }

  // 3. Assign / delegate to a named person
  const wantsAssign = /\b(assign|delegate|give (this |it )?to|have|let|hand (this |it )?to)\b/.test(text)
    || /\bshould (do|handle|take)\b/.test(text);
  if (wantsAssign) {
    const person = matchStaff(text, context.staff);
    if (person) {
      const parsed = resolveDate(text, today);
      const dueDate = parsed
        ? ymd(parsed)
        : context.dueDate && context.dueDate >= ymd(today)
          ? context.dueDate
          : ymd(addDays(today, 7));
      return {
        kind: "assign",
        employeeId: person.id,
        employeeName: person.name,
        dueDate,
        note: rawText.trim(),
        summary: `Record ${person.name} as responsible (due ${dueDate}).`,
      };
    }
  }

  // 4. Reschedule to a resolved date. A concrete date wins over the softer
  //    priority cues below, so "move it to Monday, it can wait" reschedules.
  const date = resolveDate(text, today);
  if (date) {
    return {
      kind: "reschedule",
      date: ymd(date),
      note: rawText.trim(),
      recurringHint: detectRecurring(text),
      summary: `Move to ${niceDate(date)}.`,
    };
  }

  // 5. Priority (no date present)
  if (/\b(urgent|asap|top priority|do (this |it )?first|drop everything)\b/.test(text)) {
    return { kind: "priority", override: 400, reason: rawText.trim(), summary: "Raise to top priority." };
  }
  if (/\bhigh priority|more important|bump (this|it) up|prioriti[sz]e\b/.test(text)) {
    return { kind: "priority", override: 200, reason: rawText.trim(), summary: "Raise the priority." };
  }
  if (/\b(low priority|not important|deprioriti[sz]e|can wait|back burner)\b/.test(text)) {
    return { kind: "priority", override: -200, reason: rawText.trim(), summary: "Lower the priority." };
  }

  return {
    kind: "unknown",
    summary: "I couldn't turn that into an action automatically.",
  };
}
