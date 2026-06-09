"use client";

import { useMemo, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TaskTemplate, TaskCategory } from "@/types/database";
import { cn } from "@/lib/utils";
import { BoardTemplateChip } from "./board-template-chip";
import {
  getTemplateFrequency,
  FREQUENCY_COLORS,
  FREQUENCY_LABELS,
  type TemplateFrequency,
} from "@/lib/utils/template-frequency";

const FREQUENCY_FILTERS: TemplateFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "seasonal",
  "projects",
];

// Display order for the per-category groups in the backlog. Mowing first
// because it's the bulk of daily tasks; admin/safety/other sink to the
// bottom since they're the long-tail. Anything not listed here falls
// through to the alphabetical tail.
const CATEGORY_DISPLAY_ORDER: TaskCategory[] = [
  "mowing",
  "greens",
  "tees",
  "bunker",
  "irrigation",
  "chemical",
  "mechanical",
  "landscaping",
  "grounds",
  "construction",
  "events",
  "pro_shop",
  "customer_service",
  "admin",
  "safety",
  "other",
];

// Friendly labels for the group headers. Anything missing gets a
// title-cased fallback so a future category appearing in data still
// renders something readable.
const CATEGORY_LABELS: Record<TaskCategory, string> = {
  mowing: "Mowing",
  greens: "Greens",
  tees: "Tees",
  bunker: "Bunker",
  irrigation: "Irrigation",
  chemical: "Chemical",
  mechanical: "Mechanical",
  landscaping: "Landscaping",
  grounds: "Grounds",
  construction: "Construction",
  events: "Events",
  pro_shop: "Pro Shop",
  customer_service: "Customer Service",
  admin: "Admin",
  safety: "Safety",
  other: "Other",
};

function categoryLabel(c: TaskCategory): string {
  return (
    CATEGORY_LABELS[c] ??
    c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
  );
}

function categoryRank(c: TaskCategory): number {
  const idx = CATEGORY_DISPLAY_ORDER.indexOf(c);
  // Unranked categories sort after the ranked ones, alphabetical inside.
  return idx === -1 ? CATEGORY_DISPLAY_ORDER.length : idx;
}

// Leading words that describe HOW or WHEN a task is done — stripping
// them lets the SUBJECT (greens / fairways / tees / rough / sprayer /
// engine / etc.) lead the sort. That way "Morning Mow - Greens",
// "Mow Greens — HOC 0.125", and "Mow All Greens" all collapse to a
// "greens"-leading key and cluster together in the list.
//
// Match longest-first so "mow all" wins over a bare "mow" and we don't
// strip half a phrase. The list is ordered by descending word count for
// that reason.
const SUBJECT_PREFIX_PATTERNS: RegExp[] = [
  // Two-word prefixes
  /^(?:morning mow|afternoon mow|evening mow|early mow|late mow|mow all|spot spray|spot check|spot treat|deep clean|set up|setup|set-up|pre op|pre-op|post op|post-op|tear down|tear-down)\s+/i,
  // Single-word prefixes (verbs + temporal modifiers + generic articles)
  /^(?:morning|afternoon|evening|early|late|daily|weekly|monthly|seasonal|mow|spray|apply|verify|check|inspect|clean|repair|replace|service|edge|rake|fill|remove|install|conduct|update|review|prep|prepare|topdress|roll|verticut|aerify|aerate|drag|sweep|blow|wash|grease|sharpen|change|reset|restock|haul|patch|seed|fertilize|water|hand|deep|hand-water|hand-mow|all|the|a|an|do|run|set|tear|order|create|finish|start|complete|test|measure|count|log|log-in|log-out)\s+/i,
];

// Punctuation noise that can lead the remaining string after stripping
// (e.g. "Mow - Greens" → "- Greens"). Strip it so "- greens" doesn't
// sort before "greens".
const LEADING_PUNCT = /^[\s\-—–•:|·.,]+/;

/**
 * Build a sort key for a template name that puts tasks with the same
 * subject next to each other. Applies the prefix-stripping passes
 * repeatedly because real names can stack prefixes ("Morning Mow All
 * Fairways" → strip "morning" → "mow all fairways" → strip "mow all" →
 * "fairways"). We cap the loop so a degenerate name can't infinite-loop
 * us.
 *
 * Falls back to the lowercased original name when stripping leaves us
 * with nothing — better than sorting empty strings to the top.
 */
function templateSortKey(name: string | null | undefined): string {
  if (!name) return "";
  let key = name.toLowerCase();
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const pattern of SUBJECT_PREFIX_PATTERNS) {
      const next = key.replace(pattern, "");
      if (next !== key) {
        key = next;
        changed = true;
      }
    }
    const trimmed = key.replace(LEADING_PUNCT, "");
    if (trimmed !== key) {
      key = trimmed;
      changed = true;
    }
    if (!changed) break;
  }
  const cleaned = key.trim();
  return cleaned.length > 0 ? cleaned : name.toLowerCase();
}

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
      templates.map((t) => ({ template: t, frequency: getTemplateFrequency(t) })),
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

  // Group the filtered results by category so similar work clusters
  // together — when the user filters to "Daily", they see "Mow Greens"
  // sitting next to "Mow Greens — collars", and the bunker tasks aren't
  // interleaved in between. Within each category we sort alphabetically
  // by name (locale-aware, case-insensitive) so the chip order is stable
  // and predictable.
  const grouped = useMemo(() => {
    const buckets = new Map<TaskCategory, TaskTemplate[]>();
    for (const { template } of filtered) {
      const arr = buckets.get(template.category);
      if (arr) arr.push(template);
      else buckets.set(template.category, [template]);
    }
    // Order the groups by the curated display order, then alphabetize
    // any unranked tail. Inside each group, alphabetize the templates.
    const orderedCategories = Array.from(buckets.keys()).sort((a, b) => {
      const ra = categoryRank(a);
      const rb = categoryRank(b);
      if (ra !== rb) return ra - rb;
      return categoryLabel(a).localeCompare(categoryLabel(b));
    });
    return orderedCategories.map((cat) => {
      // Sort by the subject-leading key first so "Mow Greens" and
      // "Morning Mow - Greens" land next to each other. Tiebreak on the
      // original name so two templates with the same subject still have
      // a stable, predictable order. Both comparisons are locale-aware
      // and numeric so HOC bands sort 0.110 → 0.120 → 0.125 instead of
      // lexicographically.
      const items = (buckets.get(cat) ?? []).slice().sort((a, b) => {
        const ka = templateSortKey(a.name);
        const kb = templateSortKey(b.name);
        const subj = ka.localeCompare(kb, undefined, {
          sensitivity: "base",
          numeric: true,
        });
        if (subj !== 0) return subj;
        return (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
          numeric: true,
        });
      });
      return { category: cat, items };
    });
  }, [filtered]);

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

      {/* List — grouped by category, alphabetical within each group so
          related work clusters together (mow-greens beside mow-fairways
          beside mow-tees, etc.).

          `overflow-y-scroll` (not `auto`) keeps the scrollbar visible
          even when the list happens to fit, so the user always sees
          there's a scrollable region. The `[&::-webkit-scrollbar*]`
          arbitrary classes give the track a thin styled look on
          Chrome/Edge/Safari; Firefox uses `scrollbar-thin` via
          `scrollbar-color` since it ignores webkit pseudos. */}
      <div
        className={cn(
          "flex-1 px-2 py-2 flex flex-col gap-2",
          "overflow-y-scroll overscroll-contain",
          // Reserve gutter so list width doesn't jump when filters change
          "[scrollbar-gutter:stable]",
          // Webkit (Chrome/Edge/Safari) — thin always-visible track
          "[&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-track]:bg-muted/30",
          "[&::-webkit-scrollbar-thumb]:bg-border",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40",
          // Firefox
          "[scrollbar-width:thin]",
        )}
      >
        {filtered.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8 px-3">
            {templates.length === 0
              ? "No task templates yet. Create one from /tasks/new and choose 'Save as Template'."
              : "No templates match the current filters."}
          </div>
        ) : (
          grouped.map(({ category, items }) => (
            <div key={category} className="flex flex-col gap-1">
              <div className="px-1 pt-1 pb-0.5 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoryLabel(category)}
                </span>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                  {items.length}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              {items.map((t) => (
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
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
