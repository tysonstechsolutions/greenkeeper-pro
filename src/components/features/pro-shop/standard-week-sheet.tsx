"use client";

/**
 * The standard week, editable in one place.
 *
 * This is the schedule: who works which job, on which weekday, from when to
 * when — the same every week. Change it here, pick the day the change starts,
 * and every existing day from then on is rebuilt to match. Weeks before that
 * date are never touched. One-off changes (a call-out, a swap) still happen on
 * the day itself and leave this alone.
 *
 * The operating hours live here too, so "from Nov 1 we close at 18:00" is one
 * dated change, and the shifts that closed at 19:00 can move with it.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Copy, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Overlay } from "@/components/features/pro-shop/overlay";
import { shortDate } from "@/lib/pro-shop/schedule-engine";
import { formatHours, minutesOfDay, paidMinutes } from "@/lib/pro-shop/hours";
import { generateCoverageMonth } from "@/lib/pro-shop/coverage";
import {
  deriveWeekFromShifts,
  doubleBookings,
  firstFullWeek,
  hoursFromRules,
  moveHoursEdges,
  newSlotId,
  nextSunday,
  nextVersionAfter,
  slotsForWeekday,
  slotsFromPatterns,
  slotsFromPlannedWeek,
  versionFor,
  weeklyPaidByStaff,
} from "@/lib/pro-shop/week-template";
import {
  GROUP_LABELS,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  positionGroup,
  type CoverageRule,
  type ProShopShift,
  type ProShopStaff,
  type ScheduleArea,
  type ScheduleSettings,
  type ShiftGroup,
  type WeekHours,
  type WeekSlot,
  type WeekTemplate,
} from "@/lib/pro-shop/types";
import type { RestampResult } from "@/lib/pro-shop/use-pro-shop";

const selectCls = "px-2 py-1.5 rounded-lg border border-input bg-background text-sm min-w-0";
const timeCls = "h-8 w-[6.75rem] sm:w-[8.25rem] text-xs px-1.5 sm:px-2";

/** Sunday-first, matching the grid and the printout. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Two words per job, for the tight hours rows. */
const GROUP_SHORT: Record<ShiftGroup, string> = {
  inside: "Golf ops",
  outside: "Rec aids",
  grounds: "Grounds",
  shop: "Shop",
  restaurant: "Restaurant",
  restaurant_manager: "Manager",
};

interface Draft {
  slots: WeekSlot[];
  hours: WeekHours;
}

export function StandardWeekSheet({
  area,
  groups,
  staff,
  rules,
  settings,
  templates,
  today,
  monthShifts,
  monthDates,
  monthLabel,
  onSave,
  onDelete,
  onClose,
}: {
  area: ScheduleArea;
  groups: ShiftGroup[];
  staff: ProShopStaff[];
  rules: CoverageRule[];
  settings: ScheduleSettings;
  templates: WeekTemplate[];
  /** YYYY-MM-DD. */
  today: string;
  /** The open month's shifts and dates — a starting point for a first week. */
  monthShifts: ProShopShift[];
  monthDates: string[];
  monthLabel: string;
  onSave: (week: Draft, effectiveFrom: string) => Promise<RestampResult>;
  onDelete: (template: WeekTemplate) => Promise<RestampResult>;
  onClose: (message?: string) => void;
}) {
  const hasRules = rules.length > 0;
  const first = templates[0] ?? null;
  // A change normally starts at the top of next week. Two exceptions: the very
  // first standard week starts today, so the rest of this month follows it;
  // and when the standard week hasn't started yet, an edit starts with it —
  // otherwise it would land in the days before it and never reach the weeks
  // it was meant for.
  const defaultFrom = !first
    ? today
    : versionFor(nextSunday(today), templates)
      ? nextSunday(today)
      : first.effective_from;
  const [effectiveFrom, setEffectiveFrom] = useState(defaultFrom);
  const [draft, setDraft] = useState<Draft | null>(() => {
    const base = versionFor(defaultFrom, templates) ?? first;
    if (!base) return null;
    return {
      slots: base.slots.map((s) => ({ ...s })),
      hours: Object.keys(base.hours).length ? base.hours : hoursFromRules(rules),
    };
  });
  const [moveWithHours, setMoveWithHours] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => staff.filter((p) => p.is_active), [staff]);
  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);
  const later = nextVersionAfter(effectiveFrom, templates);

  // ── Starting points for a first standard week ─────────────────────────────
  function startFrom(kind: "shifts" | "availability" | "coverage" | "blank") {
    const hours = hoursFromRules(rules);
    let slots: WeekSlot[] = [];
    if (kind === "shifts") {
      slots = deriveWeekFromShifts(monthShifts, monthDates);
    } else if (kind === "availability") {
      slots = slotsFromPatterns(active);
    } else if (kind === "coverage") {
      const now = new Date();
      const week = firstFullWeek(now.getFullYear(), now.getMonth());
      const plan = generateCoverageMonth({
        staff: active, year: now.getFullYear(), month0: now.getMonth(), timeOff: [],
        rules, settings, area, dates: week,
      });
      slots = slotsFromPlannedWeek(plan.shifts);
    }
    setDraft({ slots, hours });
  }

  /**
   * Put the week back to exactly what everyone's availability says — the way
   * Buckley's is run: whoever is available on a day works that day, their own
   * hours. Kept as a button rather than done automatically, because the week
   * is otherwise the GM's to edit by hand.
   */
  function rebuildFromAvailability() {
    const listed = slotsFromPatterns(active);
    if (listed.length === 0) {
      setError("Nobody has availability set yet — add it on each person's card first.");
      return;
    }
    if (!window.confirm(
      `Set the week to everyone's availability? That replaces the ${draft?.slots.length ?? 0} shifts below with the ${listed.length} days people say they can work.`,
    )) return;
    setError(null);
    setDraft((d) => (d ? { ...d, slots: listed } : { slots: listed, hours: hoursFromRules(rules) }));
  }

  // ── Edits ─────────────────────────────────────────────────────────────────
  function patchSlot(id: string, patch: Partial<WeekSlot>) {
    setDraft((d) => d && { ...d, slots: d.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSlot(id: string) {
    setDraft((d) => d && { ...d, slots: d.slots.filter((s) => s.id !== id) });
  }
  function addSlot(weekday: number, group: ShiftGroup) {
    setDraft((d) => {
      if (!d) return d;
      const h = d.hours[String(weekday)]?.[group];
      return {
        ...d,
        slots: [...d.slots, {
          id: newSlotId(), weekday, group, staff_id: null,
          start: h?.open ?? "08:00", end: h?.close ?? "14:00",
        }],
      };
    });
  }
  /** Make another weekday look exactly like this one. */
  function copyDay(from: number, to: number) {
    setDraft((d) => d && {
      ...d,
      slots: [
        ...d.slots.filter((s) => s.weekday !== to),
        ...d.slots.filter((s) => s.weekday === from).map((s) => ({ ...s, id: newSlotId(), weekday: to })),
      ],
      hours: d.hours[String(from)] ? { ...d.hours, [String(to)]: { ...d.hours[String(from)] } } : d.hours,
    });
  }
  function setHours(weekday: number, group: ShiftGroup, next: { open: string; close: string }) {
    setDraft((d) => {
      if (!d) return d;
      const before = d.hours[String(weekday)]?.[group];
      const slots = before && moveWithHours
        ? moveHoursEdges(d.slots, weekday, group, before, next)
        : d.slots;
      return {
        slots,
        hours: { ...d.hours, [String(weekday)]: { ...(d.hours[String(weekday)] ?? {}), [group]: next } },
      };
    });
  }
  /** The same opening hours for this job on every day. */
  function hoursEveryDay(weekday: number, group: ShiftGroup) {
    const h = draft?.hours[String(weekday)]?.[group];
    if (!h) return;
    for (const day of WEEKDAYS) if (day !== weekday) setHours(day, group, h);
  }

  // ── Checks ────────────────────────────────────────────────────────────────
  const doubles = draft ? doubleBookings(draft.slots) : [];
  const badTimes = draft?.slots.filter((s) => minutesOfDay(s.end) <= minutesOfDay(s.start)) ?? [];
  const weekly = useMemo(() => (draft ? weeklyPaidByStaff(draft.slots, settings) : new Map<string, number>()),
    [draft, settings]);

  async function save() {
    if (!draft) return;
    if (badTimes.length) {
      setError("A shift ends before it starts — fix the times shown in red.");
      return;
    }
    if (doubles.length) {
      setError("Someone is on twice in one day — fix the days marked in red.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError("Pick the date the change starts.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(draft, effectiveFrom);
      onClose(
        result.days > 0
          ? `Standard week saved. ${result.days} day${result.days === 1 ? "" : "s"} from ${shortDate(effectiveFrom)} rebuilt to match`
            + (result.held ? `; ${result.held} held day${result.held === 1 ? "" : "s"} left alone.` : ".")
          : `Standard week saved, starting ${shortDate(effectiveFrom)}. Months you open from then on fill from it.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelVersion(t: WeekTemplate) {
    if (!window.confirm(`Cancel the change that starts ${shortDate(t.effective_from)}? Those days go back to the week before it.`)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onDelete(t);
      onClose(`Change from ${shortDate(t.effective_from)} cancelled; ${result.days} day${result.days === 1 ? "" : "s"} rebuilt.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't cancel. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── First time: pick a starting point ─────────────────────────────────────
  if (!draft) {
    const fromShifts = deriveWeekFromShifts(monthShifts, monthDates).length;
    return (
      <Overlay title="Standard week" onClose={() => onClose()}>
        <div className="p-4 space-y-3">
          <p className="text-sm">
            Set up the week once — who works which days and hours — and every week repeats it.
            Changes to one day stay on that day.
          </p>
          <p className="text-xs text-muted-foreground">Start from:</p>
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start h-auto py-2.5 text-left" disabled={fromShifts === 0}
              onClick={() => startFrom("shifts")}>
              <span>
                <span className="block font-medium">{monthLabel}&apos;s shifts</span>
                <span className="block text-xs text-muted-foreground">
                  {fromShifts > 0
                    ? `The pattern people have actually been working — ${fromShifts} shifts a week`
                    : "Nothing scheduled this month to learn from"}
                </span>
              </span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-2.5 text-left" onClick={() => startFrom("availability")}>
              <span>
                <span className="block font-medium">Everyone&apos;s availability</span>
                <span className="block text-xs text-muted-foreground">
                  Each person works the days and hours they said they can
                </span>
              </span>
            </Button>
            {hasRules && (
              <Button variant="outline" className="justify-start h-auto py-2.5 text-left" onClick={() => startFrom("coverage")}>
                <span>
                  <span className="block font-medium">Cover the day, open to close</span>
                  <span className="block text-xs text-muted-foreground">
                    Splits the open hours between whoever is available
                  </span>
                </span>
              </Button>
            )}
            <Button variant="outline" className="justify-start h-auto py-2.5 text-left" onClick={() => startFrom("blank")}>
              <span>
                <span className="block font-medium">A blank week</span>
                <span className="block text-xs text-muted-foreground">Add every shift yourself</span>
              </span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Nothing is saved until you press Save.</p>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay title="Standard week" onClose={() => onClose()} wide>
      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          This is the schedule every week. Edit it, pick the day the change starts, and Save — every day
          from then on is rebuilt to match. One-off changes on a single day are kept.
        </p>

        {/* Dated versions */}
        {templates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
            {templates.map((t, i) => {
              const inForce = versionFor(today, templates)?.id === t.id;
              return (
                <span key={t.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                  inForce ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                  From {shortDate(t.effective_from)}
                  {inForce ? " · now" : t.effective_from > today ? " · upcoming" : ""}
                  {i > 0 && (
                    <button type="button" onClick={() => void cancelVersion(t)} disabled={saving}
                      aria-label={`Cancel the change from ${t.effective_from}`} className="hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Operating hours */}
        {hasRules && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Operating hours</p>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5" checked={moveWithHours}
                  onChange={(e) => setMoveWithHours(e.target.checked)} />
                Move the opening and closing shifts with the hours
              </label>
            </div>
            <div className="divide-y divide-border">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="flex flex-wrap items-center gap-x-5 gap-y-1.5 py-1.5 text-xs">
                  <span className="w-9 font-medium">{WEEKDAY_LABELS[WEEKDAY_KEYS[wd]].slice(0, 3)}</span>
                  {groups.map((g) => {
                    const h = draft.hours[String(wd)]?.[g];
                    const label = `${WEEKDAY_LABELS[WEEKDAY_KEYS[wd]]} ${GROUP_LABELS[g]}`;
                    return (
                      <span key={g} className="inline-flex flex-wrap items-center gap-1">
                        {groups.length > 1 && (
                          <span className="w-14 text-[11px] text-muted-foreground">{GROUP_SHORT[g]}</span>
                        )}
                        {h ? (
                          <>
                            <Input type="time" step={1800} className={timeCls} value={h.open}
                              aria-label={`${label} opens`}
                              onChange={(e) => e.target.value && setHours(wd, g, { ...h, open: e.target.value })} />
                            <span>–</span>
                            <Input type="time" step={1800} className={timeCls} value={h.close}
                              aria-label={`${label} closes`}
                              onChange={(e) => e.target.value && setHours(wd, g, { ...h, close: e.target.value })} />
                            <button type="button" onClick={() => hoursEveryDay(wd, g)}
                              className="text-[11px] underline text-muted-foreground hover:text-foreground whitespace-nowrap"
                              title="Use these hours on every day">
                              every day
                            </button>
                          </>
                        ) : (
                          <button type="button" className="text-[11px] underline text-muted-foreground"
                            onClick={() => setHours(wd, g, { open: "08:00", close: "18:00" })}>
                            Set hours
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={rebuildFromAvailability}>
            <RefreshCw className="w-3.5 h-3.5" /> Set the week from everyone&apos;s availability
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Use this after changing someone&apos;s availability.
          </span>
        </div>

        {/* The week */}
        <div className="space-y-2">
          {WEEKDAYS.map((wd) => {
            const daySlots = slotsForWeekday(draft.slots, wd);
            const dayDoubles = doubles.filter((d) => d.weekday === wd);
            return (
              <div key={wd} className={`rounded-lg border p-3 space-y-2 ${dayDoubles.length ? "border-red-400" : "border-border"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{WEEKDAY_LABELS[WEEKDAY_KEYS[wd]]}</p>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Copy className="w-3 h-3" />
                    <select className="bg-transparent text-[11px] underline" value=""
                      onChange={(e) => {
                        const to = Number(e.target.value);
                        if (e.target.value === "") return;
                        if (window.confirm(`Make ${WEEKDAY_LABELS[WEEKDAY_KEYS[to]]} the same as ${WEEKDAY_LABELS[WEEKDAY_KEYS[wd]]}?`)) {
                          copyDay(wd, to);
                        }
                      }}
                      aria-label={`Copy ${WEEKDAY_LABELS[WEEKDAY_KEYS[wd]]} to another day`}>
                      <option value="">Copy this day to…</option>
                      {WEEKDAYS.filter((d) => d !== wd).map((d) => (
                        <option key={d} value={d}>{WEEKDAY_LABELS[WEEKDAY_KEYS[d]]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {dayDoubles.map((d) => (
                  <p key={d.staff_id} className="text-[11px] text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {staffById.get(d.staff_id)?.full_name ?? "Someone"} is on twice
                  </p>
                ))}
                {groups.map((g) => {
                  const list = daySlots.filter((s) => s.group === g);
                  const eligible = active.filter((p) => positionGroup(p.position) === g || p.flex === true);
                  return (
                    <div key={g} className="space-y-1.5">
                      {groups.length > 1 && (
                        <p className="text-[11px] font-medium text-muted-foreground">{GROUP_LABELS[g]}</p>
                      )}
                      {list.length === 0 && <p className="text-[11px] text-muted-foreground italic">Nobody</p>}
                      {list.map((slot) => (
                        <SlotRow key={slot.id} slot={slot} eligible={eligible} staffById={staffById}
                          settings={settings} onPatch={(p) => patchSlot(slot.id, p)} onRemove={() => removeSlot(slot.id)} />
                      ))}
                      <button type="button" onClick={() => addSlot(wd, g)}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <Plus className="w-3 h-3" /> Add {groups.length > 1 ? GROUP_LABELS[g].toLowerCase() : ""} shift
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Hours per person */}
        {weekly.size > 0 && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-semibold mb-1">Paid hours each week</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {[...weekly.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id, minutes]) => (
                  <span key={id}>
                    {staffById.get(id)?.full_name ?? "Unknown"}{" "}
                    <strong className="tabular-nums">{formatHours(minutes)}h</strong>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* When it starts + save */}
        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-background p-4 space-y-2">
          {later && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              A change is already set to start {shortDate(later.effective_from)} — this edit applies until then.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Starts</Label>
              <Input type="date" className="h-9 w-40" value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onClose()} disabled={saving}>Cancel</Button>
            <Button className="bg-[#1B4332] hover:bg-[#2D6A4F] gap-1.5" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save from {/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ? shortDate(effectiveFrom) : "…"}
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function SlotRow({
  slot,
  eligible,
  staffById,
  settings,
  onPatch,
  onRemove,
}: {
  slot: WeekSlot;
  eligible: ProShopStaff[];
  staffById: Map<string, ProShopStaff>;
  settings: ScheduleSettings;
  onPatch: (patch: Partial<WeekSlot>) => void;
  onRemove: () => void;
}) {
  const current = slot.staff_id ? staffById.get(slot.staff_id) : null;
  // Keep whoever holds the slot selectable even if they've since been stood
  // down, so the row never silently reassigns itself.
  const options = current && !eligible.some((p) => p.id === current.id) ? [current, ...eligible] : eligible;
  const bad = minutesOfDay(slot.end) <= minutesOfDay(slot.start);
  const pat = current?.availability?.weekly?.[WEEKDAY_KEYS[slot.weekday]];
  const outsideAvailability = !!current && (
    !pat?.works
    || (pat.start && minutesOfDay(pat.start) > minutesOfDay(slot.start))
    || (pat.end && minutesOfDay(pat.end) < minutesOfDay(slot.end))
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select className={`${selectCls} basis-full sm:basis-40 sm:flex-1`} value={slot.staff_id ?? ""}
        onChange={(e) => onPatch({ staff_id: e.target.value || null })} aria-label="Who works it">
        <option value="">— Nobody yet —</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name}{p.is_active ? "" : " (stood down)"}</option>
        ))}
      </select>
      <Input type="time" step={1800} className={`${timeCls} ${bad ? "border-red-500" : ""}`} value={slot.start}
        onChange={(e) => e.target.value && onPatch({ start: e.target.value })} aria-label="Starts" />
      <span className="text-xs">–</span>
      <Input type="time" step={1800} className={`${timeCls} ${bad ? "border-red-500" : ""}`} value={slot.end}
        onChange={(e) => e.target.value && onPatch({ end: e.target.value })} aria-label="Ends" />
      <span className="text-xs tabular-nums w-9 text-right">
        {bad ? "—" : `${formatHours(paidMinutes(slot.start, slot.end, settings))}h`}
      </span>
      <button type="button" onClick={onRemove} aria-label="Remove this shift"
        className="p-1.5 rounded-lg border border-border text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {outsideAvailability && (
        <span className="basis-full text-[10px] text-amber-700 dark:text-amber-400">
          Outside {current?.full_name.split(" ")[0]}&apos;s listed availability
          {pat?.works && pat.start && pat.end ? ` (${pat.start}–${pat.end})` : " for this day"}
        </span>
      )}
    </div>
  );
}
