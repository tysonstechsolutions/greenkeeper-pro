"use client";

/**
 * The coverage rules, editable in place.
 *
 * These numbers are what the generator fills the month against, so this panel
 * is the difference between "ask Claude to change the rota" and changing it
 * yourself. One row per weekday per group: the window to cover, how many
 * people split it, and how many extra come in later.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hhmm } from "@/lib/pro-shop/schedule-engine";
import {
  AREA_GROUPS,
  GROUP_LABELS,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type CoverageRule,
  type ScheduleArea,
  type ScheduleSettings,
  type ShiftGroup,
} from "@/lib/pro-shop/types";

export function CoverageRulesSheet({
  area,
  rules,
  settings,
  onSaveRule,
  onSaveSettings,
}: {
  area: ScheduleArea;
  rules: CoverageRule[];
  settings: ScheduleSettings;
  onSaveRule: (rule: Pick<CoverageRule, "weekday" | "group"> & Partial<CoverageRule>) => Promise<void>;
  onSaveSettings: (next: Partial<Omit<ScheduleSettings, "area">>) => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lunchThreshold, setLunchThreshold] = useState(
    String(settings.lunch_threshold_minutes / 60),
  );
  const [lunchMinutes, setLunchMinutes] = useState(String(settings.lunch_minutes));
  const [maxShift, setMaxShift] = useState(String(settings.max_shift_minutes / 60));

  async function save(
    key: string,
    rule: Pick<CoverageRule, "weekday" | "group"> & Partial<CoverageRule>,
  ) {
    setBusyKey(key);
    setError(null);
    try {
      await onSaveRule(rule);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that rule.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSettings() {
    setBusyKey("settings");
    setError(null);
    try {
      const hours = Number(lunchThreshold);
      const minutes = Number(lunchMinutes);
      const longest = Number(maxShift);
      if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0) {
        setError("Enter the lunch threshold in hours and the lunch itself in minutes.");
        return;
      }
      if (!Number.isFinite(longest) || longest < 1 || longest > 24) {
        setError("The longest shift has to be between 1 and 24 hours.");
        return;
      }
      await onSaveSettings({
        lunch_threshold_minutes: Math.round(hours * 60),
        lunch_minutes: Math.round(minutes),
        max_shift_minutes: Math.round(longest * 60),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save those settings.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        What each day needs. <strong>On shift</strong> people each work the longest shift allowed
        below, spread evenly across the open-to-close window — so they overlap over the busy
        middle instead of handing over. <strong>Extra</strong> come in at the later time and work
        to close.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {AREA_GROUPS[area].map((group) => (
        <div key={group}>
          <h3 className="text-sm font-semibold mb-2">{GROUP_LABELS[group]}</h3>
          <div className="space-y-1.5">
            {WEEKDAY_KEYS.map((_, weekday) => {
              const rule = rules.find((r) => r.weekday === weekday && r.group === group);
              const key = `${group}-${weekday}`;
              return (
                <RuleRow
                  key={key}
                  label={WEEKDAY_LABELS[WEEKDAY_KEYS[weekday]]}
                  rule={rule}
                  weekday={weekday}
                  group={group}
                  busy={busyKey === key}
                  onSave={(next) => save(key, next)}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold mb-1">Shift length &amp; unpaid lunch</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Nobody drives in for three hours, so the generator gives everyone the longest shift
          allowed and spreads the starts across the day. Staff are not paid for lunch, so every
          hours figure in the schedule already has it taken out — a shift longer than the
          threshold loses the lunch. <strong>8.5 on site is 8 paid.</strong>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Longest shift (hours)</Label>
            <Input
              type="number" step="0.5" min="1" max="24" className="w-32"
              value={maxShift}
              onChange={(e) => setMaxShift(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lunch after (hours)</Label>
            <Input
              type="number" step="0.5" min="0" className="w-28"
              value={lunchThreshold}
              onChange={(e) => setLunchThreshold(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deduct (minutes)</Label>
            <Input
              type="number" step="5" min="0" className="w-28"
              value={lunchMinutes}
              onChange={(e) => setLunchMinutes(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => void saveSettings()} disabled={busyKey === "settings"}>
            {busyKey === "settings" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Changes take effect the next time you hit <strong>Regenerate</strong>. Pinned shifts stay
        where you put them.
      </p>
    </div>
  );
}

function RuleRow({
  label,
  rule,
  weekday,
  group,
  busy,
  onSave,
}: {
  label: string;
  rule: CoverageRule | undefined;
  weekday: number;
  group: ShiftGroup;
  busy: boolean;
  onSave: (rule: Pick<CoverageRule, "weekday" | "group"> & Partial<CoverageRule>) => Promise<void>;
}) {
  const [open, setOpen] = useState(hhmm(rule?.open_time) || "08:00");
  const [close, setClose] = useState(hhmm(rule?.close_time) || "20:00");
  const [base, setBase] = useState(String(rule?.base_staff ?? 2));
  const [extra, setExtra] = useState(String(rule?.extra_staff ?? 0));
  const [extraStart, setExtraStart] = useState(hhmm(rule?.extra_start) || "15:00");

  const dirty =
    open !== (hhmm(rule?.open_time) || "08:00") ||
    close !== (hhmm(rule?.close_time) || "20:00") ||
    base !== String(rule?.base_staff ?? 2) ||
    extra !== String(rule?.extra_staff ?? 0) ||
    extraStart !== (hhmm(rule?.extra_start) || "15:00");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
      <span className="w-20 shrink-0 text-xs font-medium">{label}</span>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Open</Label>
        <Input type="time" className="h-8 w-28 text-xs" value={open} onChange={(e) => setOpen(e.target.value)} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Close</Label>
        <Input type="time" className="h-8 w-28 text-xs" value={close} onChange={(e) => setClose(e.target.value)} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">On shift</Label>
        <Input type="number" min="0" max="12" className="h-8 w-16 text-xs" value={base} onChange={(e) => setBase(e.target.value)} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Extra</Label>
        <Input type="number" min="0" max="12" className="h-8 w-16 text-xs" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </div>
      {Number(extra) > 0 && (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Extra starts</Label>
          <Input type="time" className="h-8 w-28 text-xs" value={extraStart} onChange={(e) => setExtraStart(e.target.value)} />
        </div>
      )}
      <Button
        size="sm" variant={dirty ? "default" : "outline"} className="h-8 text-xs"
        disabled={busy || !dirty}
        onClick={() => void onSave({
          weekday, group,
          open_time: open, close_time: close,
          base_staff: Number(base), extra_staff: Number(extra),
          extra_start: Number(extra) > 0 ? extraStart : null,
        })}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
