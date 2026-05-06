"use client";

import { Layers, Clock } from "lucide-react";
import type { TaskTemplate } from "@/types/database";
import { cn } from "@/lib/utils";
import {
  classifyTemplateFrequency,
  FREQUENCY_COLORS,
  FREQUENCY_LABELS,
} from "@/lib/utils/template-frequency";

interface BoardTemplateChipProps {
  template: TaskTemplate;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

/**
 * A reusable task template displayed in the schedule's backlog sidebar.
 * Visually distinct from a scheduled task chip — has a layered icon and
 * the left-border color encodes recurrence cadence (daily/weekly/etc).
 */
export function BoardTemplateChip({
  template,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging,
}: BoardTemplateChipProps) {
  const interactive = !!onClick;
  const freq = classifyTemplateFrequency(template);
  const colors = FREQUENCY_COLORS[freq];
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "border border-border border-l-[3px] rounded px-2 py-1.5 bg-card",
        "text-[11px] leading-tight",
        "flex flex-col gap-0.5 min-w-0 select-none",
        "transition-shadow",
        colors.border,
        interactive && "cursor-pointer hover:bg-accent/40",
        draggable && "cursor-grab active:cursor-grabbing hover:shadow-sm",
        isDragging && "opacity-40",
      )}
      title={`${template.name} · ${FREQUENCY_LABELS[freq]} · drag to schedule`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <Layers className={cn("w-3 h-3 shrink-0", colors.chip)} />
        <span className="font-medium truncate">{template.name}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className={cn("font-medium uppercase tracking-wider", colors.chip)}>
          {FREQUENCY_LABELS[freq]}
        </span>
        {template.estimated_minutes != null && (
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            {template.estimated_minutes}m
          </span>
        )}
      </div>
    </div>
  );
}
