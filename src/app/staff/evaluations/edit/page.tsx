"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
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
import { evaluationProgress, narrativeComplete, suggestOverall } from "@/lib/evaluations/compose";
import { describeFacts } from "@/lib/evaluations/facts";
import {
  NARRATIVE_SECTIONS,
  PERFORMANCE_ELEMENTS,
  RATING_BUTTON_COLORS,
  RATING_LABELS,
  RATING_SHORT_LABELS,
} from "@/lib/evaluations/form";
import { fiscalYearOf, periodDisplay, periodFromFyParam } from "@/lib/evaluations/period";
import { evaluationFilename, evaluationsPdfBlob, type EvaluationPrintData } from "@/lib/evaluations/pdf";
import {
  WRITTEN_QUESTIONS,
  elementNoteId,
  missingAnswers,
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
  type EvaluationAnswers,
  type EvaluationNarrative,
  type EvaluationRatings,
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function EvaluationEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const employeeId = params.get("employee") ?? "";
  const period = periodFromFyParam(params.get("fy"), todayLocal());
  const fy = fiscalYearOf(period.end);
  const { hasRole } = useRoleAccess();
  const isManager = hasRole(ADMIN_ROLES);
  const { profile: me } = useAuth();

  const { employee, evaluation, facts, loadedFor, loading, error, save } = useEvaluation(employeeId, period);
  const viewer = useMemo(
    () => ({ id: me?.id ?? getCachedUserId(), isManager }),
    [me?.id, isManager],
  );
  const roster = useEvaluationRoster(period, viewer);

  const [ratings, setRatings] = useState<EvaluationRatings>({});
  const [answers, setAnswers] = useState<EvaluationAnswers>({});
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

  // Copy the saved evaluation into the form once per employee/period
  // (render-time sync, so switching to the next employee resets cleanly).
  const currentKey = `${employeeId}|${period.start}`;
  const hydrateKey = !loading && loadedFor === currentKey ? currentKey : null;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (hydrateKey && hydrateKey !== hydratedFor) {
    setHydratedFor(hydrateKey);
    setRatings(evaluation?.ratings ?? {});
    setAnswers(evaluation?.answers ?? {});
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
    setStep(
      progress === "final"
        ? "done"
        : narrativeComplete(evaluation?.narrative)
          ? "review"
          : missingRatings(evaluation?.ratings ?? {}).length === 0
            ? "questions"
            : "rate",
    );
  }

  const locked = evaluation?.status === "final";
  const employeeName = employee?.full_name || "Employee";
  const suggested = suggestOverall(ratings);

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
    (): EvaluationPatch => ({ ratings, answers, overall_rating: overall, narrative }),
    [ratings, answers, overall, narrative],
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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function rate(key: string, value: RatingValue) {
    setRatings((r) => ({ ...r, [key]: value }));
    setDirty(true);
  }

  function answer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    setDirty(true);
  }

  function editSection(key: string, value: string) {
    setNarrative((n) => ({ ...n, [key]: value }));
    setDirty(true);
  }

  function editElementComment(key: string, value: string) {
    setNarrative((n) => ({ ...n, elements: { ...(n.elements ?? {}), [key]: value } }));
    setDirty(true);
  }

  async function writeItUp() {
    if (narrativeComplete(narrative) && !window.confirm("Replace the current wording with a fresh draft from your answers?")) {
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
        ratings,
        overall: chosen,
        answers,
        facts,
      });
      setNarrative(drafted);
      if (!overall && chosen) setOverall(chosen);
      setDirty(true);
      setDraftNote(
        aiError
          ? "The AI wasn't available, so the built-in writer drafted this from your answers. Read it over and edit anything."
          : "Drafted from your answers. Read it over and edit anything before you finalize.",
      );
    } finally {
      setDrafting(false);
    }
  }

  async function goToReview() {
    if (missingAnswers(answers).length > 0) {
      setShowProblems(true);
      return;
    }
    if (!overall && suggested) {
      setOverall(suggested);
      setDirty(true);
    }
    await goTo("review");
    if (!narrativeComplete(narrative)) await writeItUp();
  }

  function printData(): EvaluationPrintData {
    return {
      evaluation: {
        period_start: period.start,
        period_end: period.end,
        period_label: period.label,
        status: evaluation?.status ?? "draft",
        ratings,
        overall_rating: overall,
        narrative,
      },
      employeeName,
      positionTitle: facts?.position_title ?? (employee ? roleLabels[employee.role] : null),
      payPlanGrade: facts?.pay_plan_grade ?? null,
      hireDate: facts?.hire_date ?? null,
      supervisorName: me?.full_name ?? "",
    };
  }

  async function downloadPdf() {
    setBusy("pdf");
    setActionError(null);
    try {
      await saveBlobToDevice({
        blob: evaluationsPdfBlob([printData()]),
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
    ...missingRatings(ratings).map(
      (k) => `Rate "${PERFORMANCE_ELEMENTS.find((e) => e.key === k)?.label ?? k}"`,
    ),
    ...missingAnswers(answers).map(
      (id) => `Answer "${WRITTEN_QUESTIONS.find((q) => q.id === id)?.prompt ?? id}"`,
    ),
    ...(overall ? [] : ["Pick an overall rating"]),
    ...NARRATIVE_SECTIONS.filter((s) => !(narrative[s.key] ?? "").trim()).map(
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
        const data = printData();
        data.evaluation.status = "final";
        const filed = await fileEvaluationPdf({
          employeeId,
          blob: evaluationsPdfBlob([data]),
          filename: evaluationFilename(period.label, employeeName),
          title: `${period.label} Performance Evaluation`,
        });
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

  const nextEmployee = roster.entries.find(
    (e) => e.profile.id !== employeeId && e.progress !== "final",
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (!employeeId) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-sm text-muted-foreground">
        No employee picked. <Link className="underline" href="/staff/evaluations">Back to evaluations</Link>
      </div>
    );
  }

  if (loading || (!error && hydratedFor !== currentKey)) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error ?? "Employee not found."}
        </div>
        <Link href={`/staff/evaluations?fy=${fy}`} className="inline-block mt-4 text-sm underline">
          Back to evaluations
        </Link>
      </div>
    );
  }

  const factLines = facts ? describeFacts(facts) : [];

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      {/* Header */}
      <Link
        href={`/staff/evaluations?fy=${fy}`}
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
              <div
                className={`h-1.5 rounded-full ${
                  state === "todo" ? "bg-muted" : "bg-emerald-600"
                }`}
              />
              <p className={`text-xs mt-1 ${state === "active" ? "font-semibold" : "text-muted-foreground"}`}>
                {i + 1}. {s.label}
              </p>
            </li>
          );
        })}
      </ol>

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

          <p className="text-sm text-muted-foreground">
            Tap a rating for each one. Add an example only if one comes to mind.
          </p>

          {PERFORMANCE_ELEMENTS.map((el) => {
            const current = ratings[el.key];
            return (
              <div key={el.key} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{el.label}</p>
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
                <Input
                  className="mt-3"
                  placeholder="Example (optional)"
                  value={answers[elementNoteId(el.key)] ?? ""}
                  onChange={(e) => answer(elementNoteId(el.key), e.target.value)}
                />
              </div>
            );
          })}

          {showProblems && missingRatings(ratings).length > 0 && (
            <p className="text-sm text-destructive">Rate every item to keep going.</p>
          )}
          <StickyNav>
            <Button
              className="w-full gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
              onClick={() => {
                if (missingRatings(ratings).length > 0) setShowProblems(true);
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
              <label key={q.id} className="block rounded-lg border border-border bg-card p-4">
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
            );
          })}
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
            <p className="font-semibold">Overall rating</p>
            {suggested && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Suggested from your ratings: {suggested} – {RATING_LABELS[suggested]}. Change it if you see it differently.
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
                    onClick={() => {
                      setOverall(v);
                      setDirty(true);
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
              {NARRATIVE_SECTIONS.map((s) => (
                <label key={s.key} className="block">
                  <span className="text-sm font-semibold">{s.title}</span>
                  <Textarea
                    className="mt-1"
                    rows={5}
                    value={narrative[s.key] ?? ""}
                    onChange={(e) => editSection(s.key, e.target.value)}
                  />
                </label>
              ))}
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Comment for each rating</summary>
                <div className="space-y-3 mt-3">
                  {PERFORMANCE_ELEMENTS.map((el) => {
                    const r = ratings[el.key];
                    return (
                      <label key={el.key} className="block">
                        <span className="text-xs font-semibold">
                          {el.label}
                          {isRatingValue(r) && <span className="font-normal text-muted-foreground"> · {RATING_LABELS[r]}</span>}
                        </span>
                        <Textarea
                          className="mt-1"
                          rows={2}
                          value={narrative.elements?.[el.key] ?? ""}
                          onChange={(e) => editElementComment(el.key, e.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => void writeItUp()}>
                  <RotateCcw className="w-4 h-4" /> Rewrite from my answers
                </Button>
                <Button variant="outline" className="gap-2" disabled={busy === "pdf"} onClick={() => void downloadPdf()}>
                  {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Preview PDF
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

          <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-sm">
            <p>
              <span className="font-semibold">Overall:</span>{" "}
              {overall ? `${overall} – ${RATING_LABELS[overall]}` : "—"}
            </p>
            {NARRATIVE_SECTIONS.map((s) => (
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
              Download PDF
            </Button>
            {isManager && (
              <Button className="gap-2" variant="outline" disabled={busy === "reopen"} onClick={() => void reopen()}>
                {busy === "reopen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Reopen to edit
              </Button>
            )}
          </div>

          <StickyNav>
            {nextEmployee ? (
              <Button
                className="w-full gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
                onClick={() => router.push(`/staff/evaluations/edit?employee=${nextEmployee.profile.id}&fy=${fy}`)}
              >
                Next: {nextEmployee.profile.full_name || "Employee"} <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                className="w-full gap-2"
                variant="outline"
                onClick={() => router.push(`/staff/evaluations?fy=${fy}`)}
              >
                {roster.loading ? "Back to all evaluations" : "All done — back to the list"}
              </Button>
            )}
          </StickyNav>
        </div>
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
