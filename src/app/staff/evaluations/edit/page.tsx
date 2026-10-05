"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  MessageSquareHeart,
  Plus,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_ROLES, MANAGEMENT_ROLES, RoleGuard, useRoleAccess } from "@/components/auth/role-guard";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { useAuth } from "@/lib/hooks/useAuth";
import { getCachedUserId } from "@/lib/supabase/rest";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { todayLocal } from "@/lib/utils/date";
import { draftNarrative } from "@/lib/evaluations/ai";
import {
  evaluationProgress,
  hasUnsatisfactory,
  narrativeComplete,
  overallRuleProblem,
  suggestOverall,
} from "@/lib/evaluations/compose";
import { describeFacts } from "@/lib/evaluations/facts";
import {
  AWARD_AMOUNT_HINTS,
  AWARD_KEYS,
  AWARD_LABELS,
  IDP_LINES,
  NARRATIVE_SECTIONS,
  RATING_BUTTON_COLORS,
  RATING_LABELS,
  RATING_REASON_LABELS,
  RATING_SHORT_LABELS,
  SIGNING_STEPS,
  SUPERVISORY_ROLES,
  UNSATISFACTORY_NOTE,
  elementsFor,
} from "@/lib/evaluations/form";
import {
  defaultPeriod,
  fiscalYearOf,
  isIsoDate,
  ninetyDayPeriod,
  periodDisplay,
  periodFromFyParam,
} from "@/lib/evaluations/period";
import { evaluationEditHref, evaluationListHref, type EvaluationTarget } from "@/lib/evaluations/links";
import { appendSuggestions, type SuggestionTarget } from "@/lib/evaluations/suggestions";
import { evaluationFilename, evaluationPdfBlob, type EvaluationPrintData } from "@/lib/evaluations/pdf";
import {
  WRITTEN_QUESTIONS,
  applicableRatings,
  elementNoteId,
  missingAnswers,
  missingAwardAmounts,
  missingRatings,
} from "@/lib/evaluations/questions";
import {
  fileEvaluationPdf,
  useEvaluation,
  useEvaluationRoster,
  type EvaluationPatch,
} from "@/lib/evaluations/use-evaluations";
import {
  isRatingValue,
  type AwardKey,
  type EvaluationAnswers,
  type EvaluationAwards,
  type EvaluationIdp,
  type EvaluationNarrative,
  type EvaluationRatings,
  type RatingReason,
  type RatingValue,
} from "@/lib/evaluations/types";

type Step = "rate" | "questions" | "review" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "rate", label: "Rate" },
  { key: "questions", label: "Questions" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

/** Ratings shown low → high, left → right. */
const SCALE: RatingValue[] = [1, 2, 3, 4, 5];

type SaveState = "idle" | "saving" | "saved" | "error";

const EMPTY_IDP: EvaluationIdp = { learning: [], conferences: [], remarks: "" };

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function EvaluationEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const employeeId = params.get("employee") ?? "";
  // `?kind=90day&start=<hire date>` opens a new hire's 90-day evaluation;
  // otherwise it's the yearly one for `?fy=`.
  const ninetyStart = params.get("kind") === "90day" ? params.get("start") : null;
  const kind = ninetyStart !== null ? "ninety_day" : "annual";
  const ninetyStartValid = isIsoDate(ninetyStart);
  const period =
    kind === "ninety_day"
      ? ninetyDayPeriod(ninetyStartValid ? ninetyStart : todayLocal())
      : periodFromFyParam(params.get("fy"), todayLocal());
  const fy = fiscalYearOf(period.end);
  const target: EvaluationTarget = kind === "ninety_day" ? { ninetyDayStart: period.start } : { fy };
  const listHref = evaluationListHref(target);
  const { hasRole } = useRoleAccess();
  const isManager = hasRole(ADMIN_ROLES);
  const { profile: me } = useAuth();

  const { employee, evaluation, facts, suggestions, loadedFor, loading, error, save } = useEvaluation(employeeId, period, kind);
  const viewer = useMemo(
    () => ({ id: me?.id ?? getCachedUserId(), isManager }),
    [me?.id, isManager],
  );
  // The yearly roster (for a 90-day evaluation, the current one) gives
  // "who reports to whom" and the next person to do.
  const roster = useEvaluationRoster(kind === "ninety_day" ? defaultPeriod(todayLocal()) : period, viewer);

  const [reason, setReason] = useState<RatingReason>("annual");
  const [supervisory, setSupervisory] = useState(false);
  const [ratings, setRatings] = useState<EvaluationRatings>({});
  const [answers, setAnswers] = useState<EvaluationAnswers>({});
  const [awards, setAwards] = useState<EvaluationAwards>({});
  const [overall, setOverall] = useState<RatingValue | null>(null);
  const [narrative, setNarrative] = useState<EvaluationNarrative>({});
  const [step, setStep] = useState<Step>("rate");

  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "finalize" | "reopen" | "pdf">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [filedNote, setFiledNote] = useState<string | null>(null);

  // Does anyone report to this employee? Then they're rated as a supervisor
  // by default (f–h), same as the supervisory roles.
  const hasReports = roster.entries.some((e) => e.profile.supervisor_id === employeeId);

  // Copy the saved evaluation into the form once per employee/period
  // (render-time sync, so switching to the next employee resets cleanly).
  const currentKey = `${employeeId}|${period.start}`;
  const hydrateKey = !loading && loadedFor === currentKey ? currentKey : null;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (hydrateKey && hydrateKey !== hydratedFor && employee) {
    setHydratedFor(hydrateKey);
    setReason(kind === "ninety_day" ? "ninety_day" : evaluation?.rating_reason ?? "annual");
    setSupervisory(evaluation ? !!evaluation.supervisory : SUPERVISORY_ROLES.includes(employee.role));
    setRatings(evaluation?.ratings ?? {});
    setAnswers(evaluation?.answers ?? {});
    setAwards(evaluation?.awards ?? {});
    setOverall(isRatingValue(evaluation?.overall_rating) ? evaluation!.overall_rating : null);
    setNarrative(evaluation?.narrative ?? {});
    setDirty(false);
    setSaveState("idle");
    setSaveError(null);
    setDraftNote(null);
    setActionError(null);
    setShowProblems(false);
    setFiledNote(null);
    const progress = evaluationProgress(evaluation);
    const sup = evaluation ? !!evaluation.supervisory : SUPERVISORY_ROLES.includes(employee.role);
    setStep(
      progress === "final"
        ? "done"
        : narrativeComplete(evaluation?.narrative)
          ? "review"
          : missingRatings(evaluation?.ratings ?? {}, sup).length === 0
            ? "questions"
            : "rate",
    );
  }

  // A brand-new evaluation for someone with direct reports starts as supervisory.
  const [reportsAppliedFor, setReportsAppliedFor] = useState<string | null>(null);
  if (hydratedFor === currentKey && !evaluation && hasReports && !supervisory && reportsAppliedFor !== currentKey) {
    setReportsAppliedFor(currentKey);
    setSupervisory(true);
  }

  const locked = evaluation?.status === "final";
  const employeeName = employee?.full_name || "Employee";
  const elements = elementsFor(supervisory);
  const suggested = suggestOverall(ratings, supervisory);
  const ruleProblem = overallRuleProblem(ratings, overall, supervisory);
  const unsat = hasUnsatisfactory(ratings, overall, supervisory);
  const idp = narrative.idp ?? EMPTY_IDP;

  const persist = useCallback(
    async (values: EvaluationPatch) => {
      setDirty(false);
      setSaveState("saving");
      setSaveError(null);
      try {
        await save(values);
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        setSaveError(e instanceof Error ? e.message : "Couldn't save.");
        throw e;
      }
    },
    [save],
  );

  const currentValues = useCallback(
    (): EvaluationPatch => ({
      rating_reason: reason,
      supervisory,
      // f–h are dropped when someone isn't rated as a supervisor.
      ratings: applicableRatings(ratings, supervisory),
      overall_rating: overall,
      awards,
      answers,
      narrative,
    }),
    [reason, supervisory, ratings, overall, awards, answers, narrative],
  );

  // Autosave shortly after the GM stops tapping/typing.
  useEffect(() => {
    if (!dirty || locked) return;
    const values = currentValues();
    const t = setTimeout(() => {
      persist(values).catch(() => undefined);
    }, 900);
    return () => clearTimeout(t);
  }, [dirty, locked, currentValues, persist]);

  async function flush() {
    if (dirty && !locked) await persist(currentValues()).catch(() => undefined);
  }

  async function goTo(next: Step) {
    await flush();
    setActionError(null);
    setShowProblems(false);
    setStep(next);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function touch() {
    setDirty(true);
  }

  function rate(key: string, value: RatingValue) {
    setRatings((r) => ({ ...r, [key]: value }));
    // Per the form, any Unsatisfactory element makes the overall Unsatisfactory.
    if (value === 1) setOverall(1);
    touch();
  }

  function answer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    touch();
  }

  function setAward(key: AwardKey, patch: Partial<{ granted: boolean; amount: string }>) {
    setAwards((a) => ({
      ...a,
      [key]: { granted: a[key]?.granted ?? false, amount: a[key]?.amount ?? "", ...patch },
    }));
    touch();
  }

  function editSection(key: string, value: string) {
    setNarrative((n) => ({ ...n, [key]: value }));
    touch();
  }

  function editIdpLine(list: "learning" | "conferences", index: number, value: string) {
    setNarrative((n) => {
      const current = n.idp ?? EMPTY_IDP;
      const lines = [...current[list]];
      while (lines.length <= index) lines.push("");
      lines[index] = value;
      return { ...n, idp: { ...current, [list]: lines } };
    });
    touch();
  }

  function editIdpRemarks(value: string) {
    setNarrative((n) => ({ ...n, idp: { ...(n.idp ?? EMPTY_IDP), remarks: value } }));
    touch();
  }

  async function writeItUp() {
    if (
      narrativeComplete(narrative) &&
      !window.confirm("Replace the current wording with a fresh draft from your answers?")
    ) {
      return;
    }
    const chosen = overall ?? suggested;
    setDrafting(true);
    setDraftNote(null);
    try {
      const { narrative: drafted, aiError } = await draftNarrative({
        employeeName,
        position: facts?.position_title ?? (employee ? roleLabels[employee.role] : null),
        periodLabel: period.label,
        ratings: applicableRatings(ratings, supervisory),
        supervisory,
        overall: chosen,
        answers,
        facts,
      });
      setNarrative(drafted);
      if (!overall && chosen) setOverall(chosen);
      touch();
      setDraftNote(
        aiError
          ? `The AI wasn't available, so the built-in writer drafted this from your answers. Read it over and edit anything. (Why: ${aiError})`
          : "Drafted from your answers. Read it over and edit anything before you finalize.",
      );
    } finally {
      setDrafting(false);
    }
  }

  async function goToReview() {
    if (missingAnswers(answers).length > 0 || missingAwardAmounts(awards).length > 0) {
      setShowProblems(true);
      return;
    }
    if (!overall && suggested) {
      setOverall(suggested);
      touch();
    }
    await goTo("review");
    if (!narrativeComplete(narrative)) await writeItUp();
  }

  function printData(status: "draft" | "final"): EvaluationPrintData {
    const pd = employee?.personnel?.personnel_details ?? null;
    return {
      evaluation: {
        period_start: period.start,
        period_end: period.end,
        period_label: period.label,
        status,
        rating_reason: reason,
        supervisory,
        ratings: applicableRatings(ratings, supervisory),
        overall_rating: overall,
        awards,
        narrative,
      },
      employeeName,
      nameParts: pd ? { last: pd.name_last, first: pd.name_first, middle: pd.name_middle } : null,
      positionTitle: facts?.position_title ?? (employee ? roleLabels[employee.role] : null),
      payPlanGrade: facts?.pay_plan_grade ?? null,
      hireDate: facts?.hire_date ?? null,
      workSchedule: pd?.work_schedule ?? null,
    };
  }

  async function downloadPdf() {
    setBusy("pdf");
    setActionError(null);
    try {
      await saveBlobToDevice({
        blob: await evaluationPdfBlob(printData(evaluation?.status ?? "draft")),
        filename: evaluationFilename(period.label, employeeName),
        shareTitle: `${employeeName} — ${period.label} evaluation`,
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally {
      setBusy(null);
    }
  }

  const problems = [
    ...missingRatings(ratings, supervisory).map(
      (k) => `Rate "${elements.find((e) => e.key === k)?.label ?? k}"`,
    ),
    ...missingAnswers(answers).map(
      (id) => `Answer "${WRITTEN_QUESTIONS.find((q) => q.id === id)?.prompt ?? id}"`,
    ),
    ...missingAwardAmounts(awards).map((k) => `Enter the amount for ${AWARD_LABELS[k as AwardKey].toLowerCase()}`),
    ...(overall ? [] : ["Pick an overall rating"]),
    ...(ruleProblem ? [ruleProblem] : []),
    ...NARRATIVE_SECTIONS.filter((s) => s.required && !(narrative[s.key] ?? "").trim()).map(
      (s) => `Fill in "${s.title}"`,
    ),
  ];

  async function finalize() {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    setBusy("finalize");
    setActionError(null);
    try {
      await persist({ ...currentValues(), facts: facts ?? {}, status: "final" });
      setStep("done");
      if (isManager) {
        const filed = await evaluationPdfBlob(printData("final"))
          .then((blob) =>
            fileEvaluationPdf({
              employeeId,
              blob,
              filename: evaluationFilename(period.label, employeeName),
              title: `${period.label} Performance Rating (CNIC 5300)`,
            }),
          )
          .catch(() => false);
        setFiledNote(
          filed
            ? "A copy was filed on their profile under Documents → Performance Review."
            : "Couldn't file a copy on their profile — download it below instead.",
        );
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't finalize.");
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    if (!window.confirm("Reopen this evaluation so it can be edited? It goes back to draft until you finalize it again.")) {
      return;
    }
    setBusy("reopen");
    setActionError(null);
    try {
      await persist({ status: "draft" });
      setFiledNote(null);
      setStep("review");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't reopen.");
    } finally {
      setBusy(null);
    }
  }

  const nextHref = (() => {
    if (kind === "ninety_day") {
      const next = roster.ninetyDay.find((e) => e.profile.id !== employeeId && e.progress !== "final");
      return next
        ? { name: next.profile.full_name, href: evaluationEditHref(next.profile.id, { ninetyDayStart: next.hireDate }) }
        : null;
    }
    const next = roster.entries.find((e) => e.profile.id !== employeeId && e.progress !== "final");
    return next ? { name: next.profile.full_name, href: evaluationEditHref(next.profile.id, { fy }) } : null;
  })();

  // ── Render ──────────────────────────────────────────────────────────────

  if (!employeeId) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-sm text-muted-foreground">
        No employee picked. <Link className="underline" href="/staff/evaluations">Back to evaluations</Link>
      </div>
    );
  }

  if (kind === "ninety_day" && !ninetyStartValid) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-sm text-muted-foreground">
        This 90-day evaluation link is missing the hire date.{" "}
        <Link className="underline" href="/staff/evaluations">Back to evaluations</Link>
      </div>
    );
  }

  if (error || (!loading && loadedFor === currentKey && !employee)) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error ?? "Employee not found."}
        </div>
        <Link href={listHref} className="inline-block mt-4 text-sm underline">
          Back to evaluations
        </Link>
      </div>
    );
  }

  if (loading || hydratedFor !== currentKey || !employee) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  const factLines = facts ? describeFacts(facts) : [];

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      {/* Header */}
      <Link
        href={listHref}
        onClick={() => {
          void flush();
        }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> All evaluations
      </Link>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{employeeName}</h1>
          <p className="text-sm text-muted-foreground">
            {facts?.position_title || roleLabels[employee.role]} · {periodDisplay(period)}
          </p>
        </div>
        <SaveIndicator state={saveState} locked={locked} />
      </div>
      {saveError && <p className="text-sm text-destructive mb-2">Not saved: {saveError}</p>}

      {/* Step tracker */}
      <ol className="flex gap-1 my-4" aria-label="Steps">
        {STEPS.map((s, i) => {
          const activeIndex = STEPS.findIndex((x) => x.key === step);
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
          return (
            <li key={s.key} className="flex-1">
              <div className={`h-1.5 rounded-full ${state === "todo" ? "bg-muted" : "bg-emerald-600"}`} />
              <p className={`text-xs mt-1 ${state === "active" ? "font-semibold" : "text-muted-foreground"}`}>
                {i + 1}. {s.label}
              </p>
            </li>
          );
        })}
      </ol>

      {unsat && step !== "done" && (
        <div className="mb-4 flex gap-2 rounded-lg border border-red-600/30 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-900 dark:text-red-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{UNSATISFACTORY_NOTE}</p>
        </div>
      )}

      {/* ── Step 1: Rate ─────────────────────────────────────────────── */}
      {step === "rate" && (
        <div className="space-y-4">
          {factLines.length > 0 && (
            <details className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium flex items-center gap-2">
                <Info className="w-4 h-4" /> What the app already knows about {period.label}
              </summary>
              <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
                {factLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {facts && facts.one_on_ones.summaries.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Recent 1:1s</p>
                  <ul className="mt-1 space-y-1.5">
                    {facts.one_on_ones.summaries.map((s) => (
                      <li key={s.date + s.summary.slice(0, 12)} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{s.date}:</span> {s.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          )}

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            {kind === "ninety_day" ? (
              <div>
                <span className="text-sm font-semibold">Reason for rating</span>
                <p className="mt-1 text-sm">
                  {RATING_REASON_LABELS.ninety_day} — rates the first 90 days, through the 90-day mark.
                </p>
              </div>
            ) : (
              <label className="block">
                <span className="text-sm font-semibold">Reason for rating</span>
                <select
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value as RatingReason);
                    touch();
                  }}
                >
                  {/* 90-day evaluations have their own list, dated from the hire date. */}
                  {(Object.keys(RATING_REASON_LABELS) as RatingReason[])
                    .filter((r) => r !== "ninety_day" || reason === "ninety_day")
                    .map((r) => (
                      <option key={r} value={r}>
                        {RATING_REASON_LABELS[r]}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-emerald-700"
                checked={supervisory}
                onChange={(e) => {
                  setSupervisory(e.target.checked);
                  touch();
                }}
              />
              <span>
                <span className="text-sm font-semibold">Supervises other people</span>
                <span className="block text-xs text-muted-foreground">
                  Adds f–h (Leadership, Management/Coaching/EEO, Internal Controls).
                </span>
              </span>
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            Tap a rating for each one. Add an example only if one comes to mind.
          </p>

          {elements.map((el) => {
            const current = ratings[el.key];
            return (
              <div key={el.key} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {el.letter}. {el.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{el.description}</p>
                  </div>
                  {isRatingValue(current) && <Check className="w-5 h-5 text-emerald-600 shrink-0" />}
                </div>
                <div className="grid grid-cols-5 gap-1.5 mt-3" role="radiogroup" aria-label={el.label}>
                  {SCALE.map((v) => {
                    const selected = current === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${v} ${RATING_LABELS[v]}`}
                        onClick={() => rate(el.key, v)}
                        className={`rounded-md border px-1 py-2 text-center transition-colors ${
                          selected ? RATING_BUTTON_COLORS[v] : "border-input bg-background hover:bg-muted"
                        }`}
                      >
                        <span className="block text-base font-bold leading-none">{v}</span>
                        <span className="block text-[10px] leading-tight mt-1">{RATING_SHORT_LABELS[v]}</span>
                      </button>
                    );
                  })}
                </div>
                {isRatingValue(current) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <span className="font-medium text-foreground">{RATING_LABELS[current]}:</span>{" "}
                    {el.levels?.[current] ?? ""}
                  </p>
                )}
                <Input
                  className="mt-3"
                  placeholder="Example (optional)"
                  value={answers[elementNoteId(el.key)] ?? ""}
                  onChange={(e) => answer(elementNoteId(el.key), e.target.value)}
                />
              </div>
            );
          })}

          {showProblems && missingRatings(ratings, supervisory).length > 0 && (
            <p className="text-sm text-destructive">Rate every item to keep going.</p>
          )}
          <StickyNav>
            <Button
              className="w-full gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
              onClick={() => {
                if (missingRatings(ratings, supervisory).length > 0) setShowProblems(true);
                else void goTo("questions");
              }}
            >
              Next: a few questions <ArrowRight className="w-4 h-4" />
            </Button>
          </StickyNav>
        </div>
      )}

      {/* ── Step 2: Questions ────────────────────────────────────────── */}
      {step === "questions" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">A few words is plenty — the write-up turns it into full sentences.</p>
          {WRITTEN_QUESTIONS.map((q) => {
            const missing = showProblems && q.required && !(answers[q.id] ?? "").trim();
            return (
              <div key={q.id} className="rounded-lg border border-border bg-card p-4">
                <label className="block">
                  <span className="font-semibold">
                    {q.prompt}
                    {q.required && <span className="text-destructive"> *</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{q.hint}</span>
                  <Textarea
                    className={`mt-2 ${missing ? "border-destructive" : ""}`}
                    rows={3}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => answer(q.id, e.target.value)}
                  />
                  {missing && <span className="block text-xs text-destructive mt-1">This one is needed.</span>}
                </label>
                <FromOneOnOnes
                  items={suggestions[q.id as SuggestionTarget] ?? []}
                  current={answers[q.id] ?? ""}
                  onAdd={(picked) => answer(q.id, appendSuggestions(answers[q.id] ?? "", picked))}
                />
              </div>
            );
          })}

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <p className="font-semibold">Pay increase & awards (item 8)</p>
              <p className="text-xs text-muted-foreground">
                Not automatic — check with your Approving Official. Defaults to No.
              </p>
            </div>
            {AWARD_KEYS.map((key) => {
              const granted = !!awards[key]?.granted;
              const needsAmount = showProblems && granted && !(awards[key]?.amount ?? "").trim();
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{AWARD_LABELS[key]}</span>
                    <div className="flex rounded-md border border-input overflow-hidden" role="radiogroup" aria-label={AWARD_LABELS[key]}>
                      {[true, false].map((yes) => (
                        <button
                          key={String(yes)}
                          type="button"
                          role="radio"
                          aria-checked={granted === yes}
                          onClick={() => setAward(key, { granted: yes })}
                          className={`px-4 py-1.5 text-sm ${
                            granted === yes ? "bg-[#1B4332] text-white" : "bg-background hover:bg-muted"
                          }`}
                        >
                          {yes ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {granted && (
                    <Input
                      aria-label={`${AWARD_LABELS[key]} amount`}
                      placeholder={`Amount — ${AWARD_AMOUNT_HINTS[key]}`}
                      className={needsAmount ? "border-destructive" : ""}
                      value={awards[key]?.amount ?? ""}
                      onChange={(e) => setAward(key, { amount: e.target.value })}
                    />
                  )}
                  {needsAmount && <p className="text-xs text-destructive">Enter the amount.</p>}
                </div>
              );
            })}
          </div>

          <StickyNav>
            <Button variant="outline" className="gap-2" onClick={() => void goTo("rate")}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
              disabled={drafting}
              onClick={() => void goToReview()}
            >
              <Sparkles className="w-4 h-4" /> Write it up
            </Button>
          </StickyNav>
        </div>
      )}

      {/* ── Step 3: Review ───────────────────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-semibold">Overall rating (item 7)</p>
            {suggested && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Suggested from your ratings: {RATING_LABELS[suggested]}. Change it if you see it differently.
              </p>
            )}
            <div className="grid grid-cols-5 gap-1.5 mt-3" role="radiogroup" aria-label="Overall rating">
              {SCALE.map((v) => {
                const selected = overall === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${v} ${RATING_LABELS[v]}`}
                    onClick={() => {
                      setOverall(v);
                      touch();
                    }}
                    className={`relative rounded-md border px-1 py-2 text-center transition-colors ${
                      selected ? RATING_BUTTON_COLORS[v] : "border-input bg-background hover:bg-muted"
                    }`}
                  >
                    <span className="block text-base font-bold leading-none">{v}</span>
                    <span className="block text-[10px] leading-tight mt-1">{RATING_SHORT_LABELS[v]}</span>
                    {suggested === v && !selected && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-sky-600 px-1 text-[9px] text-white">
                        suggested
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {ruleProblem && <p className="text-sm text-destructive mt-2">{ruleProblem}</p>}
          </div>

          {drafting ? (
            <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Writing it up…
            </div>
          ) : (
            <>
              {draftNote && (
                <p className="text-sm rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 p-3">{draftNote}</p>
              )}
              <div className="space-y-3">
                <p className="font-semibold">Supervisor&apos;s remarks (item 9)</p>
                {NARRATIVE_SECTIONS.map((s) => (
                  <label key={s.key} className="block">
                    <span className="text-sm font-medium">
                      {s.title}
                      {!s.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
                    </span>
                    <Textarea
                      className="mt-1"
                      rows={4}
                      value={narrative[s.key] ?? ""}
                      onChange={(e) => editSection(s.key, e.target.value)}
                    />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  If the remarks don&apos;t fit the box, a continuation sheet is added automatically.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="font-semibold">Individual Development Plan</p>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Learning opportunities (IDP 7)</p>
                  {Array.from({ length: IDP_LINES }, (_, i) => (
                    <Input
                      key={`learning-${i}`}
                      aria-label={`Learning opportunity ${String.fromCharCode(97 + i)}`}
                      placeholder={`${String.fromCharCode(97 + i)}.`}
                      value={idp.learning[i] ?? ""}
                      onChange={(e) => editIdpLine("learning", i, e.target.value)}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Conferences, courses, classes (IDP 8)</p>
                  {Array.from({ length: IDP_LINES }, (_, i) => (
                    <Input
                      key={`conference-${i}`}
                      aria-label={`Conference or course ${String.fromCharCode(97 + i)}`}
                      placeholder={`${String.fromCharCode(97 + i)}. include date and cost`}
                      value={idp.conferences[i] ?? ""}
                      onChange={(e) => editIdpLine("conferences", i, e.target.value)}
                    />
                  ))}
                </div>
                <label className="block">
                  <span className="text-sm font-medium">IDP remarks</span>
                  <Textarea className="mt-1" rows={3} value={idp.remarks} onChange={(e) => editIdpRemarks(e.target.value)} />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => void writeItUp()}>
                  <RotateCcw className="w-4 h-4" /> Rewrite from my answers
                </Button>
                <Button variant="outline" className="gap-2" disabled={busy === "pdf"} onClick={() => void downloadPdf()}>
                  {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Preview the form
                </Button>
              </div>
            </>
          )}

          {showProblems && problems.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Before finalizing:</p>
              <ul className="list-disc pl-5 mt-1">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          <StickyNav>
            <Button variant="outline" className="gap-2" onClick={() => void goTo("questions")}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
              disabled={drafting || busy !== null}
              onClick={() => void finalize()}
            >
              {busy === "finalize" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Finalize
            </Button>
          </StickyNav>
        </div>
      )}

      {/* ── Step 4: Done ─────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 p-4">
            <p className="font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5" /> {employeeName}&apos;s evaluation is final
            </p>
            {evaluation?.finalized_at && (
              <p className="text-sm text-muted-foreground mt-1">Finalized {fmtDateTime(evaluation.finalized_at)}</p>
            )}
            {filedNote && <p className="text-sm mt-2">{filedNote}</p>}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-semibold mb-2">Next steps (from the form)</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>Open the PDF and type in the last 4 of their SSN (items 2 and IDP 1b).</li>
              {SIGNING_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-sm">
            <p>
              <span className="font-semibold">Overall:</span> {overall ? RATING_LABELS[overall] : "—"}
            </p>
            {NARRATIVE_SECTIONS.filter((s) => (narrative[s.key] ?? "").trim()).map((s) => (
              <div key={s.key}>
                <p className="font-semibold">{s.title}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{narrative[s.key]}</p>
              </div>
            ))}
          </div>

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="gap-2" variant="outline" disabled={busy === "pdf"} onClick={() => void downloadPdf()}>
              {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download the form (PDF)
            </Button>
            {isManager && (
              <Button className="gap-2" variant="outline" disabled={busy === "reopen"} onClick={() => void reopen()}>
                {busy === "reopen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Reopen to edit
              </Button>
            )}
          </div>

          <StickyNav>
            {nextHref ? (
              <Button
                className="w-full gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
                onClick={() => router.push(nextHref.href)}
              >
                Next: {nextHref.name || "Employee"} <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button className="w-full gap-2" variant="outline" onClick={() => router.push(listHref)}>
                {roster.loading ? "Back to all evaluations" : "All done — back to the list"}
              </Button>
            )}
          </StickyNav>
        </div>
      )}
    </div>
  );
}

/** Things the employee or GM already said in 1:1s, one tap to add. */
function FromOneOnOnes({
  items,
  current,
  onAdd,
}: {
  items: { text: string; source: string }[];
  current: string;
  onAdd: (picked: string[]) => void;
}) {
  const have = current.toLowerCase();
  const fresh = items.filter((i) => !have.includes(i.text.toLowerCase()));
  if (items.length === 0) return null;
  return (
    <div className="mt-3 rounded-md bg-indigo-50 dark:bg-indigo-950/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5 text-indigo-900 dark:text-indigo-200">
          <MessageSquareHeart className="w-3.5 h-3.5" /> From your 1:1s
        </p>
        {fresh.length > 1 && (
          <button
            type="button"
            className="text-xs font-medium text-indigo-800 dark:text-indigo-200 underline"
            onClick={() => onAdd(fresh.map((f) => f.text))}
          >
            Add all
          </button>
        )}
      </div>
      {fresh.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-1">All added.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {fresh.map((item) => (
            <li key={item.source + item.text} className="flex items-start gap-2 text-sm">
              <button
                type="button"
                aria-label={`Add: ${item.text}`}
                className="mt-0.5 shrink-0 rounded border border-indigo-300 dark:border-indigo-700 bg-background p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                onClick={() => onAdd([item.text])}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span>
                {item.text} <span className="text-xs text-muted-foreground">({item.source})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SaveIndicator({ state, locked }: { state: SaveState; locked: boolean }) {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Lock className="w-3.5 h-3.5" /> Final
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
        <Check className="w-3.5 h-3.5" /> Saved
      </span>
    );
  }
  return null;
}

/** Bottom action bar that stays in reach of a thumb on a phone. */
function StickyNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-20 md:bottom-4 z-10 flex gap-2 rounded-lg border border-border bg-background/95 backdrop-blur p-2 shadow-lg">
      {children}
    </div>
  );
}

export default function EvaluationEditPage() {
  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <Suspense fallback={null}>
        <EvaluationEditor />
      </Suspense>
    </RoleGuard>
  );
}
