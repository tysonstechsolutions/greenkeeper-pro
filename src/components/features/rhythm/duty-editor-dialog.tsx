"use client";

// Add or edit one of the GM's recurring duties (an `obligations` row).

import { useMemo, useState } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAllSearchableEntries } from "@/lib/layout/app-catalog";
import type { Obligation, ObligationCadence, ObligationWorkspace } from "@/lib/operations/types";
import {
  CADENCE_OPTIONS,
  DEFAULT_LEAD_DAYS,
  MONTH_NAMES,
  WEEKDAY_NAMES,
  WORKSPACE_OPTIONS,
  describeSchedule,
  draftFromObligation,
  draftToColumns,
  emptyDraft,
  scheduleChanged,
  slugForTitle,
  validateDraft,
  type ObligationDraft,
} from "@/lib/rhythm/obligation-form";
import { directInsertRow, directPatchRow } from "@/lib/supabase/rest";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const SELECT_CLASS = "h-10 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";

const DAY_OPTIONS: { value: number; label: string }[] = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  { value: -1, label: "Last day of the month" },
];

export function DutyEditorDialog({
  open,
  obligation,
  defaultCadence,
  currentUserId,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = adding a new duty. */
  obligation: Obligation | null;
  defaultCadence: ObligationCadence;
  currentUserId: string | null;
  /** Local YYYY-MM-DD — new schedules start counting from here. */
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(
    () => (obligation ? draftFromObligation(obligation) : emptyDraft(defaultCadence)),
    [obligation, defaultCadence],
  );
  const [seen, setSeen] = useState(initial);
  const [draft, setDraft] = useState<ObligationDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);

  // Reset the form whenever a different duty (or a fresh "add") is opened.
  if (initial !== seen) {
    setSeen(initial);
    setDraft(initial);
    setError(null);
    setConfirmPause(false);
  }

  const pages = useMemo(() => {
    const entries = getAllSearchableEntries()
      .map((entry) => ({ href: entry.href, label: entry.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (draft.linkHref && !entries.some((entry) => entry.href === draft.linkHref)) {
      entries.unshift({ href: draft.linkHref, label: draft.linkHref });
    }
    return entries;
  }, [draft.linkHref]);

  function update<K extends keyof ObligationDraft>(key: K, value: ObligationDraft[K]) {
    setDraft((prior) => ({ ...prior, [key]: value }));
    setError(null);
  }

  function changeCadence(cadence: ObligationCadence) {
    setDraft((prior) => ({
      ...prior,
      cadence,
      // Keep a custom heads-up; otherwise follow the cadence's sensible default.
      leadDays: prior.leadDays === DEFAULT_LEAD_DAYS[prior.cadence] ? DEFAULT_LEAD_DAYS[cadence] : prior.leadDays,
      dueMonth: cadence === "quarterly" ? Math.min(prior.dueMonth, 3) : prior.dueMonth,
    }));
    setError(null);
  }

  const preview = describeSchedule({
    cadence: draft.cadence,
    due_day: draft.dueDay,
    due_month: draft.dueMonth,
    due_weekday: draft.dueWeekday,
  });
  const willRestart = !!obligation && scheduleChanged(obligation, draft);

  async function save() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const columns = draftToColumns(draft);
      if (obligation) {
        await directPatchRow("obligations", "id", obligation.id, {
          ...columns,
          // A new schedule starts today: periods under the old rule are not
          // re-interpreted as missed under the new one.
          ...(willRestart ? { effective_from: today } : {}),
          updated_at: new Date().toISOString(),
        }, "my-duties.update-obligation");
      } else {
        await directInsertRow("obligations", {
          ...columns,
          slug: slugForTitle(draft.title, Math.random().toString(36).slice(2, 8)),
          owner_profile_id: currentUserId,
          delegable: true,
          is_active: true,
          // Start counting today, so a duty added on the 8th doesn't show the
          // 1st of this month as already late.
          effective_from: today,
        }, "my-duties.insert-obligation");
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function pause() {
    if (!obligation) return;
    setSaving(true);
    setError(null);
    try {
      await directPatchRow("obligations", "id", obligation.id, {
        is_active: false,
        updated_at: new Date().toISOString(),
      }, "my-duties.pause-obligation");
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't pause it. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{obligation ? "Edit recurring duty" : "Add a recurring duty"}</DialogTitle>
          <DialogDescription>
            {obligation
              ? "Change what it is or when it's due."
              : "Something you have to do on a schedule. It shows up on the right tab and reminds you ahead of time."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={FIELD_LABEL}>What is it?</span>
            <Input
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="e.g. Check fire extinguishers"
              autoFocus={!obligation}
            />
          </label>

          <fieldset className="space-y-1.5">
            <legend className={FIELD_LABEL}>How often?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CADENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.cadence === option.value}
                  onClick={() => changeCadence(option.value)}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium transition-colors",
                    draft.cadence === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted/50",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {draft.cadence === "weekly" && (
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={FIELD_LABEL}>Due on</span>
                <select className={SELECT_CLASS} value={draft.dueWeekday} onChange={(event) => update("dueWeekday", Number(event.target.value))}>
                  {WEEKDAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
                </select>
              </label>
            )}
            {draft.cadence === "quarterly" && (
              <label className="block space-y-1.5">
                <span className={FIELD_LABEL}>Month of the quarter</span>
                <select className={SELECT_CLASS} value={draft.dueMonth} onChange={(event) => update("dueMonth", Number(event.target.value))}>
                  <option value={1}>1st month (Jan, Apr, Jul, Oct)</option>
                  <option value={2}>2nd month (Feb, May, Aug, Nov)</option>
                  <option value={3}>3rd month (Mar, Jun, Sep, Dec)</option>
                </select>
              </label>
            )}
            {draft.cadence === "annual" && (
              <label className="block space-y-1.5">
                <span className={FIELD_LABEL}>Month</span>
                <select className={SELECT_CLASS} value={draft.dueMonth} onChange={(event) => update("dueMonth", Number(event.target.value))}>
                  {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </select>
              </label>
            )}
            {draft.cadence !== "weekly" && (
              <label className={cn("block space-y-1.5", draft.cadence === "monthly" && "sm:col-span-2")}>
                <span className={FIELD_LABEL}>Day</span>
                <select className={SELECT_CLASS} value={draft.dueDay} onChange={(event) => update("dueDay", Number(event.target.value))}>
                  {DAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
          </div>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="font-semibold">{preview}</span>
            {willRestart && (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The new schedule starts today. Past dates under the old schedule won&apos;t show as late.
              </span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={FIELD_LABEL}>Heads-up (days before)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                value={Number.isFinite(draft.leadDays) ? draft.leadDays : ""}
                onChange={(event) => update("leadDays", event.target.value === "" ? Number.NaN : Number(event.target.value))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={FIELD_LABEL}>Area</span>
              <select className={SELECT_CLASS} value={draft.workspace} onChange={(event) => update("workspace", event.target.value as ObligationWorkspace)}>
                {WORKSPACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className={FIELD_LABEL}>Page that does the work (optional)</span>
            <select className={SELECT_CLASS} value={draft.linkHref} onChange={(event) => update("linkHref", event.target.value)}>
              <option value="">No page</option>
              {pages.map((page) => <option key={page.href} value={page.href}>{page.label}</option>)}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className={FIELD_LABEL}>Notes (optional)</span>
            <Textarea
              value={draft.detail}
              onChange={(event) => update("detail", event.target.value)}
              rows={3}
              placeholder="Steps, who to send it to, where the form lives…"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {obligation ? (
            confirmPause ? (
              <Button variant="destructive" disabled={saving} onClick={pause}>
                <PauseCircle />Yes, stop tracking it
              </Button>
            ) : (
              <Button variant="ghost" disabled={saving} onClick={() => setConfirmPause(true)}>
                <PauseCircle />Stop tracking
              </Button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button disabled={saving} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              {obligation ? "Save" : "Add duty"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
