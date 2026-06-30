"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ListChecks,
  Plus,
  Check,
  Circle,
  Trash2,
  AlertTriangle,
  Clock,
  Loader2,
  Upload,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useMyDay } from "@/lib/my-day/use-my-day";
import { todayLocal } from "@/lib/utils/date";
import { matchCapability } from "@/lib/my-day/capabilities";
import type { DailyStep } from "@/lib/my-day/types";
import { BulkImportPanel } from "@/components/features/my-day/bulk-import-panel";

export default function MyDayPage() {
  const { view, loading, error, toggleStep, addSmart, bulkAdd, deleteStep } =
    useMyDay();

  const [quick, setQuick] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = quick.trim();
    if (!t || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await addSmart(t, deadline || null);
      setQuick("");
      setDeadline("");
      if (r.capability) {
        setNote(`Recognized "${r.capability.label}" — added with a one-tap link to the tool.`);
      } else if (r.aiUsed) {
        setNote(`Broke that into ${r.stepCount} step${r.stepCount > 1 ? "s" : ""}.`);
      } else {
        setNote("Added. (Deploy task-breakdown to auto-split big tasks into steps.)");
      }
    } catch {
      setNote("Couldn't add that task. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gk-page mx-auto max-w-2xl">
      <PageHeader
        title="My Day"
        description="Type a task — I'll schedule it, break it down, and link it to the right tool when the app can do it."
        icon={ListChecks}
      />

      {/* Smart add */}
      <form onSubmit={submitAdd} className="mb-2">
        <div className="flex items-center gap-2">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Add a task…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={busy || !quick.trim()}
            className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
            aria-label="Add task"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <label className="text-xs text-muted-foreground">Deadline (optional)</label>
          <input
            type="date"
            value={deadline}
            min={todayLocal()}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
      </form>

      <button
        type="button"
        onClick={() => setShowBulk((s) => !s)}
        className="inline-flex items-center gap-1.5 text-xs text-primary font-medium mb-3"
      >
        <Upload className="w-3.5 h-3.5" />
        Bulk add a list (photo or paste)
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBulk ? "rotate-180" : ""}`} />
      </button>

      {showBulk && <BulkImportPanel onAdd={bulkAdd} />}

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
              Add a task above, or bulk-add a list.
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
  const cap = matchCapability(step.title);
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
        {cap?.available && !step.done && (
          <Link
            href={cap.href}
            className="inline-flex items-center gap-1 text-[11px] text-primary font-medium mt-0.5 hover:underline"
          >
            <ArrowUpRight className="w-3 h-3" /> {cap.action}
          </Link>
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
