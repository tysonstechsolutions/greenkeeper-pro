"use client";

import { useState } from "react";
import { Save, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Schedule, ShiftType } from "@/types/database";
import { shiftTypeLabels } from "@/lib/hooks/useSchedule";
import { cn } from "@/lib/utils";

const SHIFT_TYPE_OPTIONS: { value: ShiftType | "none"; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "split", label: "Split" },
  { value: "full", label: "Full Day" },
  { value: "on_call", label: "On Call" },
  { value: "off", label: "Off" },
  { value: "none", label: "Clear / no shift" },
];

const QUICK_TEMPLATES: {
  label: string;
  shift_type: ShiftType;
  start: string;
  end: string;
}[] = [
  { label: "Morning 5–1", shift_type: "morning", start: "05:00", end: "13:00" },
  { label: "Afternoon 12–8", shift_type: "afternoon", start: "12:00", end: "20:00" },
  { label: "Full 6–4", shift_type: "full", start: "06:00", end: "16:00" },
  { label: "Split 5–6", shift_type: "split", start: "05:00", end: "18:00" },
];

interface BoardShiftEditorProps {
  userName: string;
  date: string;
  shift: Schedule | null;
  isTimeOff: boolean;
  onSave: (patch: {
    shift_type: ShiftType | null;
    shift_start: string | null;
    shift_end: string | null;
    notes: string | null;
  }) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  onClose: () => void;
}

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function BoardShiftEditor({
  userName,
  date,
  shift,
  isTimeOff,
  onSave,
  onClear,
  onClose,
}: BoardShiftEditorProps) {
  // HTML <input type="time"> wants HH:mm; postgres `time` columns come
  // back as HH:mm:ss. Strip seconds so the input shows the right value.
  const trimSeconds = (t: string | null | undefined): string =>
    t ? t.slice(0, 5) : "";

  // State initializes once from props — caller remounts (via `key`) to
  // reset when the selected cell changes. No useEffect-driven sync.
  const [shiftType, setShiftType] = useState<ShiftType | "none">(
    shift?.shift_type ?? "none",
  );
  const [start, setStart] = useState<string>(trimSeconds(shift?.shift_start));
  const [end, setEnd] = useState<string>(trimSeconds(shift?.shift_end));
  const [notes, setNotes] = useState<string>(shift?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const applyTemplate = (t: (typeof QUICK_TEMPLATES)[number]) => {
    setShiftType(t.shift_type);
    setStart(t.start);
    setEnd(t.end);
    setValidationError(null);
  };

  const handleSave = async () => {
    setValidationError(null);
    // "none" + no notes = the user picked Clear via the dropdown. Route
    // to clearShift so we don't leave behind an all-null row in the table.
    if (shiftType === "none" && !notes.trim() && !start && !end) {
      if (shift) {
        setSaving(true);
        const ok = await onClear();
        setSaving(false);
        if (ok) onClose();
        return;
      }
      // No existing row, nothing to do.
      onClose();
      return;
    }
    if (start && end && start >= end) {
      setValidationError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const ok = await onSave({
      shift_type: shiftType === "none" ? null : shiftType,
      shift_start: start || null,
      shift_end: end || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  const handleClear = async () => {
    setSaving(true);
    const ok = await onClear();
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold">{userName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatLongDate(date)}
        </div>
        {isTimeOff && (
          <div className="mt-2 text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 inline-block">
            Approved time off — saving a shift here will overlap.
          </div>
        )}
      </div>

      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-4">
        {/* Shift type */}
        <div className="space-y-1.5">
          <Label htmlFor="board-shift-type">Shift type</Label>
          <Select
            value={shiftType}
            onValueChange={(v) => setShiftType(v as ShiftType | "none")}
          >
            <SelectTrigger id="board-shift-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="board-shift-start">Start</Label>
            <Input
              id="board-shift-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={shiftType === "off" || shiftType === "none"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="board-shift-end">End</Label>
            <Input
              id="board-shift-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={shiftType === "off" || shiftType === "none"}
            />
          </div>
        </div>

        {/* Quick templates */}
        <div className="space-y-1.5">
          <Label>Quick fill</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_TEMPLATES.map((t) => (
              <Button
                key={t.label}
                variant="outline"
                size="sm"
                type="button"
                onClick={() => applyTemplate(t)}
                className="text-xs justify-start"
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="board-shift-notes">Notes (optional)</Label>
          <Textarea
            id="board-shift-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. starting at #1 tee, frost delay confirmed…"
          />
        </div>

        {validationError && (
          <div className="text-xs text-destructive">{validationError}</div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className={cn("w-full")}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {shift ? "Update shift" : "Save shift"}
        </Button>
        {shift && (
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={saving}
            className="w-full text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
            Clear shift
          </Button>
        )}
      </div>

      {/* Hint for keyboard users */}
      <div className="sr-only">
        Current shift: {shiftType === "none" ? "none" : shiftTypeLabels[shiftType]}
      </div>
    </div>
  );
}
