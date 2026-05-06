"use client";

import type { Schedule, ShiftType } from "@/types/database";
import { formatShiftTime, shiftTypeLabels } from "@/lib/hooks/useSchedule";
import { cn } from "@/lib/utils";

// Shift band color palette. Background tints (not foreground pills) so
// they read at a glance without dominating the cell.
const SHIFT_BAND_BG: Record<ShiftType, string> = {
  morning: "bg-blue-500/15 border-b-blue-500/40",
  afternoon: "bg-orange-500/15 border-b-orange-500/40",
  split: "bg-purple-500/15 border-b-purple-500/40",
  full: "bg-green-500/15 border-b-green-500/40",
  on_call: "bg-amber-500/15 border-b-amber-500/40",
  off: "bg-gray-400/15 border-b-gray-400/40",
};

const SHIFT_BAND_TEXT: Record<ShiftType, string> = {
  morning: "text-blue-700 dark:text-blue-300",
  afternoon: "text-orange-700 dark:text-orange-300",
  split: "text-purple-700 dark:text-purple-300",
  full: "text-green-700 dark:text-green-300",
  on_call: "text-amber-700 dark:text-amber-300",
  off: "text-gray-600 dark:text-gray-400",
};

// Diagonal-stripe background for time-off cells. Inline to avoid Tailwind
// v4's missing `theme()` support inside arbitrary class values.
const TIME_OFF_STRIPES: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(156, 163, 175, 0.25) 0, rgba(156, 163, 175, 0.25) 4px, rgba(229, 231, 235, 0.4) 4px, rgba(229, 231, 235, 0.4) 8px)",
};

interface BoardShiftBandProps {
  shift: Schedule | null;
  isTimeOff: boolean;
  onClick?: () => void;
}

const BAND_BASE =
  "w-full h-6 px-2 text-[11px] font-medium leading-none border-b flex items-center justify-center min-w-0";

export function BoardShiftBand({
  shift,
  isTimeOff,
  onClick,
}: BoardShiftBandProps) {
  // Time-off wins over any shift entry — if approved, the person isn't
  // here regardless of what's saved on the schedules row.
  if (isTimeOff) {
    const className = cn(
      BAND_BASE,
      "border-b-gray-400/40 text-gray-700 dark:text-gray-300",
      onClick && "cursor-pointer hover:opacity-80",
    );
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          style={TIME_OFF_STRIPES}
          className={className}
          aria-label="Time off (approved)"
        >
          <span className="truncate">Time off</span>
        </button>
      );
    }
    return (
      <div
        style={TIME_OFF_STRIPES}
        className={className}
        aria-label="Time off (approved)"
      >
        <span className="truncate">Time off</span>
      </div>
    );
  }

  if (!shift || !shift.shift_type) {
    // Empty band — keeps row heights aligned across cells.
    const className = cn(
      "w-full h-6 border-b border-dashed border-border/40",
      "text-[11px] text-muted-foreground/60 leading-none",
      "flex items-center justify-center",
      onClick && "cursor-pointer hover:bg-accent/40",
    );
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          className={className}
          aria-label="No shift set"
        >
          —
        </button>
      );
    }
    return (
      <div className={className} aria-label="No shift set">
        —
      </div>
    );
  }

  const type = shift.shift_type;
  const timeLabel = formatShiftTime(shift.shift_start, shift.shift_end);
  const display = timeLabel || shiftTypeLabels[type];
  const className = cn(
    BAND_BASE,
    SHIFT_BAND_BG[type],
    SHIFT_BAND_TEXT[type],
    onClick && "cursor-pointer hover:brightness-105",
  );
  const titleAttr = `${shiftTypeLabels[type]}${timeLabel ? " · " + timeLabel : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        title={titleAttr}
      >
        <span className="truncate">{display}</span>
      </button>
    );
  }
  return (
    <div className={className} title={titleAttr}>
      <span className="truncate">{display}</span>
    </div>
  );
}
