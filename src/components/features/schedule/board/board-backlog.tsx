"use client";

import { useMemo, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TaskTemplate } from "@/types/database";
import { cn } from "@/lib/utils";
import { BoardTemplateChip } from "./board-template-chip";
import {
  classifyTemplateFrequency,
  FREQUENCY_COLORS,
  FREQUENCY_LABELS,
  type TemplateFrequency,
} from "@/lib/utils/template-frequency";

const FREQUENCY_FILTERS: TemplateFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "seasonal",
];

interface BoardBacklogProps {
  templates: TaskTemplate[];
  onTemplateClick?: (template: TaskTemplate) => void;
  onTemplateDragStart?: (templateId: string, e: React.DragEvent) => void;
  onTemplateDragEnd?: (templateId: string, e: React.DragEvent) => void;
  draggingTemplateId?: string | null;
}

/**
 * The schedule's left-rail "library." Holds reusable task templates the
 * user drags onto the grid to create scheduled instances. Templates stay
 * in the rail after a drag — that's the whole point of the templates pivot
 * (replaces the prior backlog-of-1326-duplicate-tasks UX).
 */
export function BoardBacklog({
  templates,
  onTemplateClick,
  onTemplateDragStart,
  onTemplateDragEnd,
  draggingTemplateId,
}: BoardBacklogProps) {
  const [search, setSearch] = useState("");
  const [activeFrequencies, setActiveFrequencies] = useState<
    Set<TemplateFrequency>
  >(new Set());

  // Pre-classify each template once per render so we don't pay the regex
  // cost again inside the filter loop and the chip render.
  const classified = useMemo(
    () =>
      templates.map((t) => ({ template: t, frequency: classifyTemplateFrequency(t) })),
    [templates],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return classified.filter(({ template, frequency }) => {
      if (activeFrequencies.size > 0 && !activeFrequencies.has(frequency)) {
        return false;
      }
      if (term) {
        const hay =
          (template.name?.toLowerCase() ?? "") +
          " " +
          (template.description?.toLowerCase() ?? "");
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [classified, activeFrequencies, search]);

  const toggleFrequency = (f: TemplateFrequency) => {
    setActiveFrequencies((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setActiveFrequencies(new Set());
  };

  const hasFilters = search.length > 0 || activeFrequencies.size > 0;

  return (
    <div className="border border-border rounded-lg bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold flex-1">Templates</h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {filtered.length}
          {filtered.length !== templates.length ? `/${templates.length}` : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FREQUENCY_FILTERS.map((f) => {
            const active = activeFrequencies.has(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFrequency(f)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors",
                  active
                    ? FREQUENCY_COLORS[f].pill
                    : "bg-background text-muted-foreground border-border hover:bg-accent/30",
                )}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            );
          })}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
        {filtered.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8 px-3">
            {templates.length === 0
              ? "No task templates yet. Create one from /tasks/new and choose 'Save as Template'."
              : "No templates match the current filters."}
          </div>
        ) : (
          filtered.map(({ template: t }) => (
            <BoardTemplateChip
              key={t.id}
              template={t}
              onClick={onTemplateClick ? () => onTemplateClick(t) : undefined}
              draggable={!!onTemplateDragStart}
              onDragStart={
                onTemplateDragStart
                  ? (e) => onTemplateDragStart(t.id, e)
                  : undefined
              }
              onDragEnd={
                onTemplateDragEnd
                  ? (e) => onTemplateDragEnd(t.id, e)
                  : undefined
              }
              isDragging={draggingTemplateId === t.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
