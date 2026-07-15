/**
 * Static 1:1 question sets. The Transition and 30-Day sets are fixed (ported
 * from the GM worksheets Tyson already uses, expanded with a few more
 * questions). The Monthly set here is the BASE / fallback — normally the
 * monthly session is personalized per employee by the one-on-one-questions
 * edge function, but if that's unavailable we fall back to this so a 1:1 can
 * always run offline.
 */
import type { OneOnOneQuestion, OneOnOneTemplate } from "./types";

export interface QuestionSpec {
  section: string;
  prompt: string;
}

const TRANSITION: QuestionSpec[] = [
  { section: "Open — name the change honestly", prompt: "How are you feeling about the change in leadership?" },
  { section: "Open — name the change honestly", prompt: "Anything about me moving into the GM role you want to ask about or get off your chest?" },
  { section: "Get to know them", prompt: "How long have you been here, and what keeps you here?" },
  { section: "Get to know them", prompt: "What part of your job do you enjoy most? What part do you like least?" },
  { section: "Get to know them", prompt: "What are you good at that we maybe don't take enough advantage of?" },
  { section: "Get to know them", prompt: "Anything going on outside of work I should keep in mind (schedule needs, school, family)?" },
  { section: "Get to know them", prompt: "What do you like to do when you're not here — hobbies, sports, family things?" },
  { section: "Their view of the operation", prompt: "What's working well right now that we should be sure to keep?" },
  { section: "Their view of the operation", prompt: "What's frustrating, or what slows you down during a normal day?" },
  { section: "Their view of the operation", prompt: "If you had my job for a day, what's the first thing you'd change?" },
  { section: "Their view of the operation", prompt: "What do you need to do your best work (tools, training, communication, staffing)?" },
  { section: "What they need from me", prompt: "What do you hope I keep doing? What do you hope I do differently as GM?" },
  { section: "What they need from me", prompt: "How do you like to get feedback and direction — in the moment, scheduled, written, in person?" },
  { section: "What they need from me", prompt: "How often would you like to check in like this going forward?" },
  { section: "Their goals", prompt: "Is there anything you'd like to learn, take on, or grow into here?" },
  { section: "Their goals", prompt: "Where do you see yourself in a couple of years — here or otherwise?" },
  { section: "Close", prompt: "Anything else on your mind before we wrap up?" },
];

const THIRTY_DAY: QuestionSpec[] = [
  { section: "Settling in", prompt: "How's it going so far? Do you feel welcomed by the team?" },
  { section: "Settling in", prompt: "Anything that's surprised you — good or bad — since you started?" },
  { section: "Onboarding & training", prompt: "Did the training prepare you for the job? What was missing or unclear?" },
  { section: "Onboarding & training", prompt: "Do you know where to find the SOPs and who to ask when you're unsure?" },
  { section: "Onboarding & training", prompt: "Is there anything you'd still like more training on?" },
  { section: "The work", prompt: "What part of the job is going well for you?" },
  { section: "The work", prompt: "What's been the hardest or most confusing?" },
  { section: "The work", prompt: "Do you have the tools, equipment, and PPE you need?" },
  { section: "Expectations & feedback", prompt: "Is your role — and what \"good work\" looks like — clear to you?" },
  { section: "Expectations & feedback", prompt: "One thing to focus on or adjust:" },
  { section: "Fit & outlook", prompt: "Is the job what you expected when you took it?" },
  { section: "Fit & outlook", prompt: "What do you enjoy most? Is anything making you reconsider being here?" },
  { section: "Life outside work", prompt: "Anything going on outside work I should know about (family, school, schedule)?" },
  { section: "Goals", prompt: "What would you like to accomplish in the next 60–90 days?" },
  { section: "Close", prompt: "Are we both good to keep going? Anything you need from me?" },
];

const MONTHLY_BASE: QuestionSpec[] = [
  { section: "Since last time", prompt: "What went well since we last talked — any wins?" },
  { section: "Since last time", prompt: "What got in the way or was frustrating?" },
  { section: "Since last time", prompt: "Did the things we agreed on last time get done? (both of us)" },
  { section: "Right now", prompt: "How's your workload and the schedule (1–5)? Anything to adjust with your hours?" },
  { section: "Right now", prompt: "What do you need from me to do your job well this stretch?" },
  { section: "Right now", prompt: "Anything on the course, or with guests or members, I should know about?" },
  { section: "Feedback — both directions", prompt: "Something you're doing well that I want to recognize:" },
  { section: "Feedback — both directions", prompt: "One thing to keep working on or do differently:" },
  { section: "Feedback — both directions", prompt: "Any feedback for me or the operation?" },
  { section: "Life & interests", prompt: "How are things outside work — family, and anything you've been into lately?" },
  { section: "Goals & development", prompt: "Progress on your goals; anything you want to learn or take on next?" },
  { section: "Close", prompt: "Anything else on your mind?" },
];

const SPECS: Record<Exclude<OneOnOneTemplate, "custom">, QuestionSpec[]> = {
  transition: TRANSITION,
  thirty_day: THIRTY_DAY,
  monthly: MONTHLY_BASE,
};

/** Turn question specs into fresh session questions with ids + empty answers. */
export function instantiateQuestions(specs: QuestionSpec[]): OneOnOneQuestion[] {
  return specs.map((s, i) => ({
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `q-${i}-${s.prompt.slice(0, 8)}`,
    section: s.section,
    prompt: s.prompt,
    answer: "",
  }));
}

/** The static question set for a template (monthly returns the base set). */
export function staticQuestions(template: OneOnOneTemplate): OneOnOneQuestion[] {
  if (template === "custom") return [];
  return instantiateQuestions(SPECS[template]);
}

/** One fresh question — used when a question is added mid-session. */
export function newQuestion(section: string, prompt: string): OneOnOneQuestion {
  return instantiateQuestions([{ section, prompt }])[0];
}
