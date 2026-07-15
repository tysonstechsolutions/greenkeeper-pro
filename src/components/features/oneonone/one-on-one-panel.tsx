"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Play,
  Save,
  CheckCircle,
  ListChecks,
  CalendarDays,
  Clock,
  MessageSquareHeart,
  UserRound,
  Heart,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOneOnOne } from "@/lib/oneonone/use-oneonone";
import {
  staticQuestions,
  instantiateQuestions,
  type QuestionSpec,
} from "@/lib/oneonone/templates";
import {
  generateMonthlyQuestions,
  recentSessionsPayload,
  digestSession,
  answeredQa,
} from "@/lib/oneonone/ai";
import { applyAction, type ApplyContext } from "@/lib/oneonone/apply-actions";
import {
  TEMPLATE_LABELS,
  type DigestResult,
  type OneOnOneActionType,
  type OneOnOneQuestion,
  type OneOnOneSession,
  type OneOnOneTemplate,
  type ProposedAction,
} from "@/lib/oneonone/types";

const ACTION_META: Record<
  OneOnOneActionType,
  { label: string; icon: typeof ListChecks; cls: string }
> = {
  task: { label: "To-do", icon: ListChecks, cls: "text-emerald-600 dark:text-emerald-400" },
  time_off: { label: "Time off", icon: CalendarDays, cls: "text-sky-600 dark:text-sky-400" },
  hours_pref: { label: "Hours", icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  follow_up: { label: "Follow-up", icon: MessageSquareHeart, cls: "text-violet-600 dark:text-violet-400" },
  calendar: { label: "Calendar", icon: CalendarDays, cls: "text-sky-600 dark:text-sky-400" },
  profile: { label: "About them", icon: Heart, cls: "text-rose-600 dark:text-rose-400" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Display text for a proposed action. The model is asked for `label`, but it
 * doesn't always send one (it often fills only the per-type title instead), so
 * fall back through the type-specific fields rather than render an empty row.
 */
function actionText(action: ProposedAction): string {
  return (
    action.label?.trim() ||
    action.follow_up_title?.trim() ||
    action.title?.trim() ||
    action.event_title?.trim() ||
    action.preference?.trim() ||
    action.reason?.trim() ||
    "Update"
  );
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

interface Props {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  /** Open follow-ups (from the parent's concerns) to surface at the top. */
  openFollowUps: { title: string }[];
  /** Create a follow-up (staff_concerns). */
  addFollowUp: (title: string, note?: string) => Promise<void>;
  /** Persist a scheduling preference on the employee profile. */
  saveSchedulingPreference: (pref: string) => Promise<void>;
  /** Reload the parent employee data after applying actions. */
  onChanged?: () => void;
}

type Mode = "idle" | "running" | "review";

export function OneOnOnePanel({
  employeeId,
  employeeName,
  employeeRole,
  openFollowUps,
  addFollowUp,
  saveSchedulingPreference,
  onChanged,
}: Props) {
  const { sessions, engagement, saveSession, applyProfileUpdates, reload } =
    useOneOnOne(employeeId);

  const [mode, setMode] = useState<Mode>("idle");
  const [template, setTemplate] = useState<OneOnOneTemplate>("monthly");
  const [questions, setQuestions] = useState<OneOnOneQuestion[]>([]);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Review state
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [applying, setApplying] = useState(false);

  const [showHistory, setShowHistory] = useState(false);

  const knowsThem =
    engagement.interests.length +
      engagement.family.length +
      engagement.career_goals.length +
      engagement.sports.length +
      engagement.life_goals.length +
      engagement.misc.length >
    0;

  // Build the follow-up questions that lead every session.
  const followUpSpecs = useMemo<QuestionSpec[]>(
    () =>
      openFollowUps.map((f) => ({
        section: "Follow-up from last time",
        prompt: `${f.title} — where does this stand?`,
      })),
    [openFollowUps],
  );

  async function handleStart(t: OneOnOneTemplate) {
    setTemplate(t);
    setStarting(true);
    setNote(null);
    try {
      let specs: QuestionSpec[];
      if (t === "monthly") {
        try {
          specs = await generateMonthlyQuestions({
            employee: { name: employeeName, role: employeeRole },
            engagement_profile: engagement,
            recent_sessions: recentSessionsPayload(sessions),
            open_follow_ups: openFollowUps.map((f) => f.title),
          });
          if (specs.length === 0) throw new Error("empty");
        } catch {
          // AI unavailable → fall back to the static monthly set.
          specs = staticQuestions("monthly").map((q) => ({
            section: q.section,
            prompt: q.prompt,
          }));
          setNote(
            "Using the standard monthly questions (personalization is offline right now).",
          );
        }
        // The AI already weaves in follow-ups; the static fallback does not,
        // so prepend them there.
        const hasFollowUpSection = specs.some(
          (s) => s.section.toLowerCase().includes("follow-up"),
        );
        const withFollowUps =
          hasFollowUpSection || followUpSpecs.length === 0
            ? specs
            : [...followUpSpecs, ...specs];
        setQuestions(instantiateQuestions(withFollowUps));
      } else {
        const base = staticQuestions(t);
        setQuestions(
          followUpSpecs.length > 0
            ? [...instantiateQuestions(followUpSpecs), ...base]
            : base,
        );
      }
      setMode("running");
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(id: string, answer: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, answer } : q)),
    );
  }

  async function handleSaveSession() {
    setSaving(true);
    setNote(null);
    try {
      await saveSession({
        template,
        session_date: todayIso(),
        questions,
      });
      // Run the digest (best-effort). If it fails, the session is still saved.
      let d: DigestResult | null = null;
      try {
        d = await digestSession({
          employee: { name: employeeName, role: employeeRole },
          template,
          session_date: todayIso(),
          today: todayIso(),
          qa: answeredQa(questions),
        });
      } catch {
        d = null;
      }
      if (d) {
        setDigest(d);
        const init: Record<number, boolean> = {};
        d.actions.forEach((_, i) => (init[i] = true));
        setIncluded(init);
        setMode("review");
      } else {
        setNote("1:1 saved. (The AI follow-up step is offline right now.)");
        finish();
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save the 1:1.");
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    setMode("idle");
    setQuestions([]);
    setDigest(null);
    reload();
    onChanged?.();
  }

  async function handleApply() {
    if (!digest) return;
    setApplying(true);
    setNote(null);
    try {
      // Always fold the learned personal facts into the engagement profile.
      if (
        digest.profile_updates &&
        Object.keys(digest.profile_updates).length > 0
      ) {
        await applyProfileUpdates(digest.profile_updates);
      }
      const ctx: ApplyContext = {
        employeeId,
        addFollowUp,
        saveSchedulingPreference,
      };
      const chosen = digest.actions.filter((_, i) => included[i]);
      for (const action of chosen) {
        await applyAction(action, ctx);
      }
      finish();
    } catch (e) {
      setNote(
        e instanceof Error
          ? `Some changes didn't apply: ${e.message}`
          : "Some changes didn't apply.",
      );
    } finally {
      setApplying(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (mode === "running") {
    return (
      <RunningSession
        employeeName={employeeName}
        template={template}
        questions={questions}
        note={note}
        saving={saving}
        onAnswer={setAnswer}
        onSave={handleSaveSession}
        onCancel={() => {
          setMode("idle");
          setQuestions([]);
        }}
      />
    );
  }

  if (mode === "review" && digest) {
    return (
      <ReviewCard
        digest={digest}
        included={included}
        applying={applying}
        note={note}
        onToggle={(i) =>
          setIncluded((m) => ({ ...m, [i]: !m[i] }))
        }
        onApply={handleApply}
        onSkip={finish}
      />
    );
  }

  // Idle
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquareHeart className="w-4 h-4 text-[#1B4332] dark:text-emerald-400" />
        <p className="text-sm font-medium">Start a 1:1</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Run the conversation on screen — no printing. Answers are saved, personal
        follow-ups carry to next time, and the assistant turns what {employeeName.split(" ")[0] || "they"} says
        into to-dos, time-off, and follow-ups you approve.
      </p>

      {openFollowUps.length > 0 && (
        <div className="rounded-lg border border-violet-300/60 bg-violet-50/60 dark:bg-violet-950/20 p-2.5">
          <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
            {openFollowUps.length} open follow-up{openFollowUps.length === 1 ? "" : "s"} will lead the conversation
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["monthly", "transition", "thirty_day"] as OneOnOneTemplate[]).map(
          (t) => (
            <Button
              key={t}
              size="sm"
              variant={t === "monthly" ? "default" : "outline"}
              className="gap-1.5"
              disabled={starting}
              onClick={() => handleStart(t)}
            >
              {starting && template === t ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : t === "monthly" ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {TEMPLATE_LABELS[t]}
            </Button>
          ),
        )}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {knowsThem && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <UserRound className="w-3.5 h-3.5" /> What we know about {employeeName.split(" ")[0]}
          </p>
          <EngagementSummary engagement={engagement} />
        </div>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="border-t border-border pt-2">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="text-sm font-medium flex items-center gap-1.5"
          >
            {showHistory ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Past 1:1s ({sessions.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {sessions.map((s) => (
                <SessionHistoryItem key={s.id} session={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EngagementSummary({
  engagement,
}: {
  engagement: ReturnType<typeof useOneOnOne>["engagement"];
}) {
  const rows: [string, string[]][] = [
    ["Interests", engagement.interests],
    ["Family", engagement.family],
    ["Sports", engagement.sports],
    ["Career goals", engagement.career_goals],
    ["Life goals", engagement.life_goals],
    ["Notes", engagement.misc],
  ];
  return (
    <div className="space-y-0.5">
      {rows
        .filter(([, v]) => v.length > 0)
        .map(([label, v]) => (
          <p key={label} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{label}:</span>{" "}
            {v.join(", ")}
          </p>
        ))}
      {engagement.communication_notes && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Communication:</span>{" "}
          {engagement.communication_notes}
        </p>
      )}
    </div>
  );
}

function SessionHistoryItem({ session }: { session: OneOnOneSession }) {
  const [open, setOpen] = useState(false);
  const answered = session.questions.filter((q) => q.answer.trim());
  return (
    <div className="rounded-lg border border-border p-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-xs">
          <span className="font-medium">{TEMPLATE_LABELS[session.template]}</span>{" "}
          <span className="text-muted-foreground">· {fmt(session.session_date)}</span>
        </span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {session.summary && !open && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {session.summary}
        </p>
      )}
      {open && (
        <div className="mt-2 space-y-1.5">
          {session.summary && (
            <p className="text-xs italic text-muted-foreground">{session.summary}</p>
          )}
          {answered.map((q) => (
            <div key={q.id} className="text-xs">
              <p className="font-medium">{q.prompt}</p>
              <p className="text-muted-foreground whitespace-pre-line">{q.answer}</p>
            </div>
          ))}
          {answered.length === 0 && (
            <p className="text-xs text-muted-foreground">No answers recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RunningSession({
  employeeName,
  template,
  questions,
  note,
  saving,
  onAnswer,
  onSave,
  onCancel,
}: {
  employeeName: string;
  template: OneOnOneTemplate;
  questions: OneOnOneQuestion[];
  note: string | null;
  saving: boolean;
  onAnswer: (id: string, answer: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Group questions by section, preserving first-seen order.
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, OneOnOneQuestion[]>();
    for (const q of questions) {
      if (!map.has(q.section)) {
        map.set(q.section, []);
        order.push(q.section);
      }
      map.get(q.section)!.push(q);
    }
    return order.map((s) => ({ section: s, items: map.get(s)! }));
  }, [questions]);

  return (
    <div className="rounded-lg border border-border p-3 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquareHeart className="w-4 h-4 text-[#1B4332] dark:text-emerald-400" />
          {TEMPLATE_LABELS[template]} — {employeeName}
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </div>

      {sections.map(({ section, items }) => (
        <div key={section} className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section}
          </p>
          {items.map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm">{q.prompt}</p>
              <Textarea
                rows={2}
                value={q.answer}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                placeholder="Their answer / your notes…"
              />
            </div>
          ))}
        </div>
      ))}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <Button
        className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F] w-full"
        disabled={saving}
        onClick={onSave}
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving & reading…
          </>
        ) : (
          <>
            <Save className="w-4 h-4" /> Save 1:1
          </>
        )}
      </Button>
    </div>
  );
}

function ReviewCard({
  digest,
  included,
  applying,
  note,
  onToggle,
  onApply,
  onSkip,
}: {
  digest: DigestResult;
  included: Record<number, boolean>;
  applying: boolean;
  note: string | null;
  onToggle: (i: number) => void;
  onApply: () => void;
  onSkip: () => void;
}) {
  const learned = digest.profile_updates || {};
  const learnedList: string[] = [
    ...(learned.interests ?? []),
    ...(learned.family ?? []),
    ...(learned.sports ?? []),
    ...(learned.career_goals ?? []),
    ...(learned.life_goals ?? []),
    ...(learned.misc ?? []),
  ];
  const chosenCount = digest.actions.filter((_, i) => included[i]).length;

  return (
    <div className="rounded-lg border border-border p-3 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-success" />
        <p className="text-sm font-medium">1:1 saved — review what to update</p>
      </div>

      {digest.summary && (
        <p className="text-sm text-muted-foreground italic">{digest.summary}</p>
      )}

      {digest.actions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed updates — approve what should happen
          </p>
          {digest.actions.map((action, i) => {
            const meta = ACTION_META[action.type] ?? ACTION_META.follow_up;
            const Icon = meta.icon;
            return (
              <label
                key={i}
                className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!included[i]}
                  onChange={() => onToggle(i)}
                  className="mt-0.5 h-4 w-4 accent-[#1B4332]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${meta.cls}`} />
                    <span className={`text-[10px] font-semibold uppercase ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm">{actionText(action)}</p>
                  <ActionDetail action={action} />
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nothing to route from this one — just saved for the record.
        </p>
      )}

      {learnedList.length > 0 && (
        <div className="rounded-lg border border-rose-300/50 bg-rose-50/50 dark:bg-rose-950/20 p-2.5">
          <p className="text-xs font-medium flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
            <Heart className="w-3.5 h-3.5" /> Remembering about them
          </p>
          <p className="text-xs text-muted-foreground mt-1">{learnedList.join(" · ")}</p>
        </div>
      )}

      {note && <p className="text-xs text-warning-foreground">{note}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={applying} onClick={onSkip}>
          Skip
        </Button>
        <Button
          className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]"
          disabled={applying}
          onClick={onApply}
        >
          {applying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Applying…
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Apply{chosenCount > 0 ? ` ${chosenCount}` : ""}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ActionDetail({ action }: { action: ProposedAction }) {
  const bits: string[] = [];
  // Context the label doesn't already carry.
  if (action.follow_up_note && action.follow_up_note.trim() !== actionText(action))
    bits.push(action.follow_up_note.trim());
  if (action.due_date) bits.push(`due ${fmt(action.due_date)}`);
  if (action.start_date)
    bits.push(
      action.start_date === action.end_date
        ? fmt(action.start_date)
        : `${fmt(action.start_date)} – ${fmt(action.end_date)}`,
    );
  if (action.event_date) bits.push(fmt(action.event_date));
  if (action.preference) bits.push(action.preference);
  if (bits.length === 0) return null;
  return <p className="text-xs text-muted-foreground">{bits.join(" · ")}</p>;
}
