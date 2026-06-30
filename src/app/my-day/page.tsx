"use client";

import { useState } from "react";
import {
  ListChecks,
  Plus,
  Check,
  Circle,
  Trash2,
  AlertTriangle,
  Clock,
  Sparkles,
  Loader2,
  ChevronDown,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useMyDay } from "@/lib/my-day/use-my-day";
import { todayLocal } from "@/lib/utils/date";
import type { DailyStep } from "@/lib/my-day/types";
import { BulkImportPanel } from "@/components/features/my-day/bulk-import-panel";

export default function MyDayPage() {
  const {
    view,
    loading,
    error,
    toggleStep,
    addQuickStep,
    addGoal,
    bulkAdd,
    deleteStep,
  } = useMyDay();

  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);

  // Breakdown form
  const [showBreak, setShowBreak] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bTitle, setBTitle] = useState("");
  const [bDeadline, setBDeadline] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submitQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = quick.trim();
    if (!t || busy) return;
    setBusy(true);
    setQuick("");
    try {
      await addQuickStep(t);
    } finally {
      setBusy(false);
    }
  };

  const submitBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = bTitle.trim();
    if (!t || bBusy) return;
    setBBusy(true);
    setNote(null);
    try {
      const r = await addGoal({ title: t, deadline: bDeadline || null });
      setBTitle("");
      setBDeadline("");
      setShowBreak(false);
      setNote(
        r.aiUsed
          ? `Broke that into ${r.stepCount} step${r.stepCount > 1 ? "s" : ""}.`
          : "Added as one task (AI breakdown isn't available yet).",
      );
    } catch {
      setNote("Couldn't add that task. Try again.");
    } finally {
      setBBusy(false);
    }
  };

  return (
    <div className="gk-page mx-auto max-w-2xl">
      <PageHeader
        title="My Day"
        description="Your running to-do list — checked off, with undone items rolling to tomorrow."
        icon={ListChecks}
      />

      {/* Add bar */}
      <form onSubmit={submitQuick} className="flex items-center gap-2 mb-2">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Add a quick task for today…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={busy || !quick.trim()}
          className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
          aria-label="Add task"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowBreak((s) => !s)}
          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Break a bigger task into steps
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBreak ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => setShowBulk((s) => !s)}
          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium"
        >
          <Upload className="w-3.5 h-3.5" />
          Bulk add a list (photo or paste)
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBulk ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showBulk && <BulkImportPanel onAdd={bulkAdd} />}

      {showBreak && (
        <form onSubmit={submitBreakdown} className="gk-card p-3 mb-3 space-y-2">
          <input
            value={bTitle}
            onChange={(e) => setBTitle(e.target.value)}
            placeholder="e.g. Prepare for the July tournament"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Deadline (optional)</label>
            <input
              type="date"
              value={bDeadline}
              min={todayLocal()}
              onChange={(e) => setBDeadline(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={bBusy || !bTitle.trim()}
              className="ml-auto rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {bBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Break it down
            </button>
          </div>
        </form>
      )}

      {note && <p className="text-xs text-muted-foreground mb-3">{note}</p>}

      {loading && view.today.length === 0 && view.overdue.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading your day…</p>
      )}
      {error && <p className="text-sm text-red-600 py-2">{error}</p>}

      {!loading && (
        <Section
          title="Overdue"
          steps={view.overdue}
          flag="overdue"
          onToggle={toggleStep}
          onDelete={deleteStep}
        />
      )}
      <Section title="Today" steps={view.today} onToggle={toggleStep} onDelete={deleteStep} />
      <Section
        title="When you have time"
        steps={view.backlog}
        muted
        onToggle={toggleStep}
        onDelete={deleteStep}
      />

      {!loading &&
        view.today.length === 0 &&
        view.overdue.length === 0 &&
        view.backlog.length === 0 && (
          <div className="gk-card p-6 text-center mt-2">
            <p className="text-sm font-medium">All caught up.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a task above, or break a bigger one into steps.
            </p>
          </div>
        )}
    </div>
  );
}

function Section({
  title,
  steps,
  flag,
  muted,
  onToggle,
  onDelete,
}: {
  title: string;
  steps: DailyStep[];
  flag?: "overdue";
  muted?: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (steps.length === 0) return null;
  return (
    <section className="mb-4">
      <p className={`gk-section-label mb-2 ${flag === "overdue" ? "text-red-600 dark:text-red-400" : ""}`}>
        {title} · {steps.length}
      </p>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <StepRow
            key={s.id}
            step={s}
            flag={flag}
            muted={muted}
            onToggle={(done) => onToggle(s.id, done)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>
    </section>
  );
}

function StepRow({
  step,
  flag,
  muted,
  onToggle,
  onDelete,
}: {
  step: DailyStep;
  flag?: "overdue";
  muted?: boolean;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 px-3 rounded-xl border ${
        flag === "overdue"
          ? "border-red-500/30 bg-red-500/5"
          : muted
            ? "border-border bg-muted/30"
            : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(!step.done)}
        className="shrink-0"
        aria-label={step.done ? "Mark not done" : "Mark done"}
      >
        {step.done ? (
          <Check className="w-5 h-5 text-emerald-600" />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${step.done ? "line-through text-muted-foreground" : ""}`}>
          {step.title}
        </p>
        {step.urgent && !step.done && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            <Clock className="w-3 h-3" /> within 24h
          </span>
        )}
        {flag === "overdue" && step.target_date && (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> rolled over from {step.target_date}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Delete task"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
