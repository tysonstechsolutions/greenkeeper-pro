"use client";

import { useState } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api/client";
import { Overlay } from "./overlay";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  emptyWeekly,
  positionGroup,
  type DayPattern,
  type ProShopStaff,
  type ShiftGroup,
  type WeekdayKey,
  type WeeklyAvailability,
} from "@/lib/pro-shop/types";

const selectCls =
  "px-2 py-1.5 rounded-lg border border-input bg-background text-sm";

interface ParsedAvailability {
  weekly: Record<string, DayPattern>;
  notes?: string;
  summary?: string;
}

export function AvailabilitySheet({
  staff,
  onClose,
  onSave,
}: {
  staff: ProShopStaff;
  onClose: () => void;
  onSave: (
    availability: WeeklyAvailability,
    text: string,
    flex: boolean,
    employedThrough: string | null,
  ) => Promise<void>;
}) {
  const initialWeekly = staff.availability?.weekly
    ? { ...emptyWeekly(), ...staff.availability.weekly }
    : emptyWeekly();
  const [weekly, setWeekly] = useState<Record<WeekdayKey, DayPattern>>(initialWeekly);
  const [text, setText] = useState(staff.availability_text ?? "");
  const [notes, setNotes] = useState(staff.availability?.notes ?? "");
  const [flex, setFlex] = useState(staff.flex);
  const [employedThrough, setEmployedThrough] = useState(staff.employed_through ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultGroup = positionGroup(staff.position);

  function setDay(key: WeekdayKey, patch: Partial<DayPattern>) {
    setWeekly((w) => ({ ...w, [key]: { ...w[key], ...patch } }));
  }

  async function runAi() {
    if (!text.trim()) return;
    setAiBusy(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const res = await callApi<ParsedAvailability>("pro-shop-ai", {
        method: "POST",
        body: {
          action: "parse_availability",
          name: staff.full_name,
          position: staff.position,
          group: defaultGroup,
          text,
        },
      });
      const next = { ...emptyWeekly() };
      for (const k of WEEKDAY_KEYS) {
        const d = res.weekly?.[k];
        if (d && d.works) {
          next[k] = {
            works: true,
            group: (d.group as ShiftGroup) ?? defaultGroup,
            start: d.start ?? "08:00",
            end: d.end ?? "14:00",
          };
        } else {
          next[k] = { works: false };
        }
      }
      setWeekly(next);
      if (res.notes !== undefined) setNotes(res.notes);
      if (res.summary) setAiSummary(res.summary);
    } catch (e) {
      setAiError(
        e instanceof Error ? e.message : "Couldn't reach the AI. Edit the days by hand below.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Normalize: an "on" day must carry group/start/end.
      const cleanWeekly = { ...emptyWeekly() };
      for (const k of WEEKDAY_KEYS) {
        const d = weekly[k];
        if (d?.works) {
          cleanWeekly[k] = {
            works: true,
            group: d.group ?? defaultGroup,
            start: d.start || "08:00",
            end: d.end || "14:00",
          };
        }
      }
      await onSave({ weekly: cleanWeekly, notes }, text, flex, employedThrough || null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay title={`Availability — ${staff.full_name}`} onClose={onClose}>
      <div className="p-4 space-y-4">
        {/* AI box */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Describe their availability
          </Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={`e.g. "${staff.full_name.split(" ")[0]} works Mon/Wed/Fri 8–2 ${defaultGroup}, can close on weekends, off Tuesdays."`}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={runAi} disabled={aiBusy || !text.trim()}>
              {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Build with AI
            </Button>
            {aiSummary && <span className="text-xs text-muted-foreground">{aiSummary}</span>}
          </div>
          {aiError && <p className="text-xs text-red-600">{aiError}</p>}
          <p className="text-[11px] text-muted-foreground">
            The AI fills the grid below — review and tweak before saving.
          </p>
        </div>

        {/* Flex toggle */}
        <label className="flex items-start gap-2 text-sm rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={flex}
            onChange={(e) => setFlex(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            <span className="font-medium">Flex employee</span>
            <span className="block text-xs text-muted-foreground">
              Can be pulled to cover any area (inside or outside) when needed — used when finding cover.
            </span>
          </span>
        </label>

        {/* Last working day */}
        <div className="space-y-1.5 rounded-xl border border-border p-3">
          <Label className="text-xs font-medium">Last working day (optional)</Label>
          <Input
            type="date"
            value={employedThrough}
            onChange={(e) => setEmployedThrough(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">
            {employedThrough
              ? `Scheduled up to and including ${employedThrough}, then dropped automatically. Shifts already generated after that date are removed when you save.`
              : "Leave blank for open-ended. Set it when someone gives notice and the schedule stops using them after that day."}
          </p>
        </div>

        {/* Manual 7-day editor */}
        <div className="space-y-1.5">
          {WEEKDAY_KEYS.map((k) => {
            const d = weekly[k];
            return (
              <div key={k} className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5 w-28 shrink-0">
                  <input
                    type="checkbox"
                    checked={!!d?.works}
                    onChange={(e) => setDay(k, { works: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className={d?.works ? "font-medium" : "text-muted-foreground"}>
                    {WEEKDAY_LABELS[k]}
                  </span>
                </label>
                {d?.works ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={d.group ?? defaultGroup}
                      onChange={(e) => setDay(k, { group: e.target.value as ShiftGroup })}
                      className={selectCls}
                    >
                      <option value="outside">Outside</option>
                      <option value="inside">Inside</option>
                    </select>
                    <input
                      type="time"
                      value={d.start ?? "08:00"}
                      onChange={(e) => setDay(k, { start: e.target.value })}
                      className={selectCls}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      value={d.end ?? "14:00"}
                      onChange={(e) => setDay(k, { end: e.target.value })}
                      className={selectCls}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Off</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save availability
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
