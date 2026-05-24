"use client";

/**
 * Priority Queue
 * ───────────────
 * Unified, auto-prioritized list of:
 *   • Course issues (hole_observations table)
 *   • FY24 Navy Standards plan items (public/data/standards_plan.json)
 *   • Custom items added on this page (localStorage)
 *
 * Course-saving items (irrigation, thin turf needing seed, drainage, active
 * pest damage) outrank cosmetic and administrative items. The scoring is
 * transparent - tap "Why this score" to see exactly which factors moved an
 * item up or down.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Flame,
  TrendingUp,
  ListChecks,
  Plus,
  CheckCircle2,
  Circle,
  PlayCircle,
  Pause,
  Eye,
  Search,
  Filter,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
  ExternalLink,
  Info,
  Wrench,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { useHoleObservations } from "@/lib/hooks/useHoleObservations";
import {
  prioritizeAll,
  fromHoleObservation,
  fromStandardsEntry,
  type PriorityInput,
  type PrioritizedItem,
  type ItemSource,
  type ItemStatus,
} from "@/lib/priority/auto-prioritize";
import type { HoleObservationStatus } from "@/types/database";
import TreatmentPlanView from "@/components/treatment-plan-view";

// ─── Constants ──────────────────────────────────────────────────────────

const CUSTOM_ITEMS_KEY = "vmgc_priority_custom_items_v1";
const OVERRIDES_KEY = "vmgc_priority_overrides_v1";
const STANDARDS_STATUS_KEY = "vmgc_standards_plan_status_v1"; // shared with standards-plan page

const TIER_STYLES: Record<
  PrioritizedItem["tier"],
  { label: string; cls: string; icon: typeof Flame }
> = {
  URGENT: {
    label: "URGENT",
    cls: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300",
    icon: Flame,
  },
  HIGH: {
    label: "HIGH",
    cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
    icon: TrendingUp,
  },
  MEDIUM: {
    label: "MEDIUM",
    cls: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
    icon: ListChecks,
  },
  LOW: {
    label: "LOW",
    cls: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300",
    icon: Eye,
  },
  DONE: {
    label: "DONE",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
    icon: CheckCircle2,
  },
};

const STATUS_STYLES: Record<
  ItemStatus,
  { label: string; cls: string; icon: typeof Circle }
> = {
  open: { label: "Open", cls: "text-red-700", icon: Circle },
  in_progress: {
    label: "In Progress",
    cls: "text-amber-700",
    icon: PlayCircle,
  },
  monitoring: { label: "Monitoring", cls: "text-blue-700", icon: Eye },
  blocked: { label: "Blocked", cls: "text-rose-700", icon: Pause },
  done: { label: "Done", cls: "text-emerald-700", icon: CheckCircle2 },
};

const SOURCE_STYLES: Record<
  ItemSource,
  { label: string; cls: string; icon: typeof Wrench }
> = {
  course: {
    label: "Course",
    cls: "bg-emerald-100 text-emerald-800",
    icon: Wrench,
  },
  standards: {
    label: "Standards",
    cls: "bg-navy text-white",
    icon: ShieldCheck,
  },
  custom: {
    label: "Custom",
    cls: "bg-purple-100 text-purple-800",
    icon: Sparkles,
  },
};

// ─── Custom-items types stored in localStorage ──────────────────────────

interface CustomItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: ItemStatus;
  reportedAt: string;
  hole?: number;
  fixSteps?: string[];
  photos?: string[];
}

interface OverrideRecord {
  pinned?: boolean;
  manualBump?: number;
  status?: ItemStatus; // user-marked status (applies to any source)
}

type Overrides = Record<string, OverrideRecord>;

// ─── Page component ─────────────────────────────────────────────────────

interface StandardsPlanFile {
  entries: Array<{
    id: string;
    short_title: string;
    standard_text: string;
    current_state: string;
    target_state: string;
    actions: string[];
    section_name: string;
    priority: "P1" | "P2" | "P3" | "P4";
    effort: "Low" | "Medium" | "High";
    cost_value: number;
    owner: string;
    dependencies: string[];
    possible_score: number;
  }>;
}

export default function PriorityPage() {
  const { observations, loading: obsLoading, updateObservation } =
    useHoleObservations();
  const [plan, setPlan] = useState<StandardsPlanFile | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Lazy state initializers - read localStorage once during first render so
  // we never trigger cascading re-renders from an effect.
  const [customItems, setCustomItems] = useState<CustomItem[]>(() =>
    readJSON<CustomItem[]>(CUSTOM_ITEMS_KEY, []),
  );
  const [overrides, setOverrides] = useState<Overrides>(() =>
    readJSON<Overrides>(OVERRIDES_KEY, {}),
  );
  const [standardsStatusMap, setStandardsStatusMap] = useState<
    Record<string, ItemStatus>
  >(() => {
    const parsed = readJSON<Record<string, string>>(STANDARDS_STATUS_KEY, {});
    const translated: Record<string, ItemStatus> = {};
    for (const [id, s] of Object.entries(parsed)) {
      translated[`standards:${id}`] = mapStandardsStatus(s);
    }
    return translated;
  });

  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch the standards plan file (network call, kept in an effect)
  useEffect(() => {
    let cancelled = false;
    fetch("/data/standards_plan.json")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<StandardsPlanFile>)
          : Promise.reject(new Error(`Plan file (${r.status})`)),
      )
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err) => {
        if (!cancelled) setPlanError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist helpers
  const saveCustom = useCallback((items: CustomItem[]) => {
    setCustomItems(items);
    try {
      localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, []);

  const saveOverrides = useCallback((next: Overrides) => {
    setOverrides(next);
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  // Build the unified input list
  const unified: PriorityInput[] = useMemo(() => {
    const out: PriorityInput[] = [];

    // 1. Course issues
    for (const obs of observations) {
      const base = fromHoleObservation({
        id: obs.id,
        hole_number: obs.hole_number,
        issue_type: obs.issue_type,
        status: obs.status,
        priority: obs.priority,
        title: obs.title,
        description: obs.description,
        fix_instructions: obs.fix_instructions,
        photo_url: obs.photo_url,
        resolution_photos: obs.resolution_photos,
        diagnosis_result: obs.diagnosis_result,
        created_at: obs.created_at,
      });
      out.push(applyOverrides(base, overrides));
    }

    // 2. Standards plan
    if (plan) {
      for (const entry of plan.entries) {
        const base = fromStandardsEntry(entry);
        // Apply any standards-plan-page status to the unified status
        const planStatus = standardsStatusMap[`standards:${entry.id}`];
        if (planStatus) base.status = planStatus;
        out.push(applyOverrides(base, overrides));
      }
    }

    // 3. Custom items
    for (const c of customItems) {
      out.push(
        applyOverrides(
          {
            id: `custom:${c.id}`,
            source: "custom",
            title: c.title,
            description: c.description,
            category: c.category,
            rawCategory: c.category,
            status: c.status,
            reportedAt: c.reportedAt,
            hole: c.hole,
            fixSteps: c.fixSteps,
            photos: c.photos,
          },
          overrides,
        ),
      );
    }

    return out;
  }, [observations, plan, customItems, overrides, standardsStatusMap]);

  // Prioritize
  const ranked = useMemo(() => prioritizeAll(unified), [unified]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ranked.filter((item) => {
      if (filterSource !== "all" && item.source !== filterSource) return false;
      if (filterTier !== "all" && item.tier !== filterTier) return false;
      if (filterStatus === "active" && item.status === "done") return false;
      if (
        filterStatus !== "all" &&
        filterStatus !== "active" &&
        item.status !== filterStatus
      )
        return false;
      if (
        q &&
        !(
          item.title.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q) ||
          (item.category ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [ranked, filterSource, filterTier, filterStatus, search]);

  // Stats
  const stats = useMemo(() => {
    const total = ranked.length;
    const open = ranked.filter((i) => i.status === "open").length;
    const inProgress = ranked.filter((i) => i.status === "in_progress").length;
    const done = ranked.filter((i) => i.status === "done").length;
    const urgent = ranked.filter(
      (i) => i.tier === "URGENT" && i.status !== "done",
    ).length;
    const high = ranked.filter(
      (i) => i.tier === "HIGH" && i.status !== "done",
    ).length;
    return { total, open, inProgress, done, urgent, high };
  }, [ranked]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markStatus = useCallback(
    async (item: PrioritizedItem, status: ItemStatus) => {
      if (item.source === "course") {
        // Update hole_observations in Supabase
        const courseId = item.id.replace(/^course:/, "");
        const obsStatus: HoleObservationStatus =
          status === "done"
            ? "resolved"
            : status === "in_progress"
              ? "in_progress"
              : status === "monitoring"
                ? "monitoring"
                : "open";
        await updateObservation(courseId, { status: obsStatus });
        // Also clear any local override so DB is source of truth
        const next = { ...overrides };
        if (next[item.id]) {
          delete next[item.id].status;
          if (Object.keys(next[item.id]).length === 0) delete next[item.id];
          saveOverrides(next);
        }
      } else if (item.source === "custom") {
        // Update the custom item in place
        const cid = item.id.replace(/^custom:/, "");
        saveCustom(
          customItems.map((c) =>
            c.id === cid ? { ...c, status } : c,
          ),
        );
      } else {
        // standards - save to overrides AND to shared standards-plan storage
        const next = { ...overrides };
        next[item.id] = { ...next[item.id], status };
        saveOverrides(next);
        // Translate back to standards-plan-page status vocabulary
        const planStatus = reverseStandardsStatus(status);
        try {
          const raw = localStorage.getItem(STANDARDS_STATUS_KEY);
          const parsed: Record<string, string> = raw ? JSON.parse(raw) : {};
          const stdId = item.id.replace(/^standards:/, "");
          parsed[stdId] = planStatus;
          localStorage.setItem(STANDARDS_STATUS_KEY, JSON.stringify(parsed));
          setStandardsStatusMap({
            ...standardsStatusMap,
            [item.id]: status,
          });
        } catch {
          /* ignore */
        }
      }
    },
    [
      overrides,
      customItems,
      saveCustom,
      saveOverrides,
      standardsStatusMap,
      updateObservation,
    ],
  );

  const togglePin = (item: PrioritizedItem) => {
    const next = { ...overrides };
    next[item.id] = { ...next[item.id], pinned: !item.pinned };
    saveOverrides(next);
  };

  const adjustBump = (item: PrioritizedItem, delta: number) => {
    const next = { ...overrides };
    const current = next[item.id]?.manualBump ?? 0;
    next[item.id] = { ...next[item.id], manualBump: current + delta };
    saveOverrides(next);
  };

  const deleteCustom = (item: PrioritizedItem) => {
    const cid = item.id.replace(/^custom:/, "");
    saveCustom(customItems.filter((c) => c.id !== cid));
    const next = { ...overrides };
    delete next[item.id];
    saveOverrides(next);
  };

  const addCustomItem = (data: Omit<CustomItem, "id" | "reportedAt" | "status">) => {
    const id = `c-${Date.now().toString(36)}`;
    saveCustom([
      ...customItems,
      {
        id,
        ...data,
        status: "open",
        reportedAt: new Date().toISOString(),
      },
    ]);
    setShowAddDialog(false);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Priority Queue"
        description="Auto-prioritized: course-saving items first, admin last"
        icon={Flame}
      >
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Issue
        </Button>
      </PageHeader>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Total" value={stats.total} tone="default" />
        <Stat label="Urgent" value={stats.urgent} tone="red" />
        <Stat label="High" value={stats.high} tone="amber" />
        <Stat label="Open" value={stats.open} tone="default" />
        <Stat label="In Progress" value={stats.inProgress} tone="sky" />
        <Stat label="Done" value={stats.done} tone="green" />
      </div>

      {/* Filters */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, description, category…"
              className="w-full h-9 pl-9 pr-3 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <SelectFilter
              label="Source"
              value={filterSource}
              onChange={setFilterSource}
              options={[
                { value: "all", label: "All sources" },
                { value: "course", label: "Course issues" },
                { value: "standards", label: "Standards plan" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <SelectFilter
              label="Tier"
              value={filterTier}
              onChange={setFilterTier}
              options={[
                { value: "all", label: "All tiers" },
                { value: "URGENT", label: "Urgent" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
                { value: "DONE", label: "Done" },
              ]}
            />
            <SelectFilter
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "active", label: "Active (hide Done)" },
                { value: "all", label: "All statuses" },
                { value: "open", label: "Open only" },
                { value: "in_progress", label: "In Progress" },
                { value: "monitoring", label: "Monitoring" },
                { value: "blocked", label: "Blocked" },
                { value: "done", label: "Done" },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {ranked.length} items
          </p>
        </CardContent>
      </Card>

      {/* Loading and empty states */}
      {obsLoading && (
        <p className="text-sm text-muted-foreground p-3">
          Loading course issues…
        </p>
      )}
      {planError && (
        <Card className="mb-3">
          <CardContent className="p-3 text-sm text-amber-700">
            Standards plan file not loaded: {planError}. Course issues and
            custom items will still appear.
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <div className="space-y-2">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            expanded={expanded.has(item.id)}
            onToggleExpand={() => toggleExpand(item.id)}
            onStatus={(s) => markStatus(item, s)}
            onTogglePin={() => togglePin(item)}
            onBump={(d) => adjustBump(item, d)}
            onDelete={item.source === "custom" ? () => deleteCustom(item) : undefined}
          />
        ))}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Info className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No items match the current filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add dialog */}
      {showAddDialog && (
        <AddDialog
          onClose={() => setShowAddDialog(false)}
          onAdd={addCustomItem}
        />
      )}
    </div>
  );
}

// ─── ItemCard ───────────────────────────────────────────────────────────

function ItemCard({
  item,
  expanded,
  onToggleExpand,
  onStatus,
  onTogglePin,
  onBump,
  onDelete,
}: {
  item: PrioritizedItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatus: (s: ItemStatus) => void;
  onTogglePin: () => void;
  onBump: (delta: number) => void;
  onDelete?: () => void;
}) {
  const tierMeta = TIER_STYLES[item.tier];
  const sourceMeta = SOURCE_STYLES[item.source];
  const statusMeta = STATUS_STYLES[item.status];
  const TierIcon = tierMeta.icon;
  const SourceIcon = sourceMeta.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full text-left p-3 hover:bg-accent/40 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 w-12 text-center rounded border px-1 py-1 ${tierMeta.cls}`}
            >
              <TierIcon className="w-3.5 h-3.5 mx-auto" />
              <p className="text-[9px] font-bold tracking-wide mt-0.5">
                {tierMeta.label}
              </p>
              <p className="text-[10px] font-mono mt-0.5">{item.score}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span
                  className={`inline-flex items-center gap-1 rounded text-[10px] font-semibold px-1.5 py-0.5 ${sourceMeta.cls}`}
                  style={
                    sourceMeta.label === "Standards"
                      ? { backgroundColor: "#003366" }
                      : undefined
                  }
                >
                  <SourceIcon className="w-3 h-3" />
                  {sourceMeta.label}
                </span>
                {item.category && (
                  <span className="rounded text-[10px] font-medium px-1.5 py-0.5 bg-muted text-muted-foreground">
                    {item.category}
                  </span>
                )}
                {item.hole !== undefined && (
                  <span className="rounded text-[10px] font-medium px-1.5 py-0.5 bg-muted text-muted-foreground">
                    Hole {item.hole}
                  </span>
                )}
                {item.pinned && (
                  <span className="rounded text-[10px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-800 inline-flex items-center gap-1">
                    <Pin className="w-3 h-3" /> PINNED
                  </span>
                )}
              </div>
              <p className="font-medium text-sm leading-snug">{item.title}</p>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>
            <div
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${statusMeta.cls}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusMeta.label}
            </div>
          </div>
        </button>

        {expanded && (
          <div className="border-t bg-muted/20 p-3 space-y-3 text-sm">
            {/* Description, owner, hole */}
            {item.description && (
              <Detail label="Description">
                <p>{item.description}</p>
              </Detail>
            )}
            {item.owner && (
              <Detail label="Owner">
                <p>{item.owner}</p>
              </Detail>
            )}

            {/* Photos */}
            <PhotoGallery
              primary={item.photoUrl}
              extras={item.photos}
              resolution={item.resolutionPhotos}
            />

            {/* How to fix - step by step */}
            <FixSteps
              steps={item.fixSteps}
              text={item.fixInstructions}
            />

            {/* AI treatment plan (course issues with a diagnosis) */}
            {item.diagnosisResult && (
              <Detail label="AI diagnosis + treatment plan">
                <div className="rounded-lg bg-background p-2">
                  <TreatmentPlanView data={item.diagnosisResult} />
                </div>
              </Detail>
            )}

            {/* Score explanation */}
            <Detail label="Why this score">
              <div className="flex flex-wrap gap-1">
                {item.factors
                  .filter((f) => f.value !== 0)
                  .map((f, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                        f.value > 0
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300"
                      }`}
                    >
                      {f.label}
                      <span className="font-mono">
                        {f.value > 0 ? "+" : ""}
                        {f.value}
                      </span>
                    </span>
                  ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Final score: <b>{item.score}</b> → tier <b>{item.tier}</b>
              </p>
            </Detail>

            {/* Status buttons */}
            <Detail label="Mark status">
              <div className="flex flex-wrap gap-1.5">
                {(
                  ["open", "in_progress", "monitoring", "blocked", "done"] as ItemStatus[]
                ).map((s) => {
                  const meta = STATUS_STYLES[s];
                  const Icon = meta.icon;
                  const active = item.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onStatus(s)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        active
                          ? "border-transparent bg-foreground text-background"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </Detail>

            {/* Manual ordering */}
            <Detail label="Override ordering">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onTogglePin}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent"
                >
                  {item.pinned ? (
                    <>
                      <PinOff className="w-3 h-3" />
                      Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="w-3 h-3" />
                      Pin to top
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onBump(10)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent"
                >
                  + Bump (+10)
                </button>
                <button
                  type="button"
                  onClick={() => onBump(-10)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent"
                >
                  − Bump (−10)
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-red-50 text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
            </Detail>

            {/* Cross-link to source */}
            {item.source === "course" && item.hole !== undefined && (
              <Link
                href={`/course-map/hole?n=${item.hole}`}
                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Open Hole {item.hole} in Course Map
              </Link>
            )}
            {item.source === "standards" && (
              <Link
                href={`/standards-plan`}
                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
              >
                <ClipboardList className="w-3 h-3" />
                View full standard in Standards Plan
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AddDialog ──────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  "Irrigation",
  "Drainage",
  "Turf Recovery",
  "Disease/Pest",
  "Greens Quality",
  "Bunkers",
  "Tees",
  "Cart Paths",
  "Patron Experience",
  "Equipment",
  "Safety / Hazard",
  "Other",
];

function AddDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description?: string;
    category: string;
    hole?: number;
    fixSteps?: string[];
    photos?: string[];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [hole, setHole] = useState<string>("");
  const [fixStepsText, setFixStepsText] = useState("");
  const [photoUrlsText, setPhotoUrlsText] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">Add Custom Issue</h2>
          <p className="text-xs text-muted-foreground">
            For one-off items that aren&apos;t in the course-issue system yet.
            Use a course issue (Report Issue page) for anything tied to a
            specific hole &mdash; that flow captures GPS, photos, and routes
            into the same queue here automatically.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Replace cracked greens roller"
              className="mt-1 w-full h-9 px-3 rounded-md bg-background border border-input text-sm"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Description (optional)
            </span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md bg-background border border-input text-sm"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Hole (optional, 1-18)
            </span>
            <input
              type="number"
              min={1}
              max={18}
              value={hole}
              onChange={(e) => setHole(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md bg-background border border-input text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              How to fix &mdash; one step per line (optional)
            </span>
            <textarea
              value={fixStepsText}
              onChange={(e) => setFixStepsText(e.target.value)}
              rows={4}
              placeholder={
                "Spot-spray weeds with selective herbicide\n" +
                "Wait 7 days, then re-inspect\n" +
                "Overseed bare areas with KBG blend"
              }
              className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Photo URLs &mdash; one per line (optional)
            </span>
            <textarea
              value={photoUrlsText}
              onChange={(e) => setPhotoUrlsText(e.target.value)}
              rows={2}
              placeholder="https://… (paste a public photo URL)"
              className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-sm font-mono"
            />
            <span className="block mt-1 text-[10px] text-muted-foreground">
              Tip: photos taken through the Report Issue flow are uploaded
              automatically and appear here without needing a URL.
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!title.trim()}
              onClick={() => {
                const h = parseInt(hole, 10);
                const fixSteps = fixStepsText
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                const photos = photoUrlsText
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                onAdd({
                  title: title.trim(),
                  description: desc.trim() || undefined,
                  category,
                  hole:
                    Number.isFinite(h) && h >= 1 && h <= 18 ? h : undefined,
                  fixSteps: fixSteps.length > 0 ? fixSteps : undefined,
                  photos: photos.length > 0 ? photos : undefined,
                });
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add to queue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "red" | "amber" | "sky" | "green";
}) {
  const tones: Record<typeof tone, string> = {
    default: "bg-card",
    red: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    sky: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
    green: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground flex items-center gap-1">
        <Filter className="w-3 h-3" />
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── PhotoGallery ──────────────────────────────────────────────────────

function PhotoGallery({
  primary,
  extras,
  resolution,
}: {
  primary?: string;
  extras?: string[];
  resolution?: string[];
}) {
  const before = [primary, ...(extras ?? [])].filter(
    (u): u is string => Boolean(u),
  );
  const after = (resolution ?? []).filter(Boolean);
  if (before.length === 0 && after.length === 0) return null;

  return (
    <>
      {before.length > 0 && (
        <Detail label={`Photos${before.length > 1 ? ` (${before.length})` : ""}`}>
          <PhotoStrip urls={before} />
        </Detail>
      )}
      {after.length > 0 && (
        <Detail label={`After-fix proof photos (${after.length})`}>
          <PhotoStrip urls={after} small />
        </Detail>
      )}
    </>
  );
}

function PhotoStrip({ urls, small }: { urls: string[]; small?: boolean }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const size = small ? "w-16 h-16" : "w-24 h-24";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <button
            type="button"
            key={`${url}-${i}`}
            onClick={() => setLightboxUrl(url)}
            className={`${size} rounded-lg overflow-hidden border border-border bg-muted relative shrink-0 hover:ring-2 hover:ring-ring transition`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </button>
        ))}
      </div>
      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Full size"
        className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 px-3 py-1.5 text-sm font-medium rounded-md bg-white text-black hover:bg-gray-100"
      >
        Close
      </button>
    </div>
  );
}

// ─── FixSteps ──────────────────────────────────────────────────────────

function FixSteps({ steps, text }: { steps?: string[]; text?: string }) {
  // Prefer structured array; fall back to free-text split by newlines / bullets
  const list = steps && steps.length > 0 ? steps : splitFreeText(text);
  if (list.length === 0 && !text) return null;
  if (list.length === 0 && text) {
    return (
      <Detail label="How to fix">
        <p className="whitespace-pre-wrap">{text}</p>
      </Detail>
    );
  }
  return (
    <Detail label="How to fix — step by step">
      <ol className="list-decimal pl-5 space-y-1">
        {list.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </Detail>
  );
}

function splitFreeText(text?: string): string[] {
  if (!text) return [];
  // Split on newlines first; if it looks like a single paragraph, return [].
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((l) => l.length > 0);
  return lines.length > 1 ? lines : [];
}

// ─── Helpers for status translation ────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function applyOverrides(
  base: PriorityInput,
  overrides: Overrides,
): PriorityInput {
  const o = overrides[base.id];
  if (!o) return base;
  return {
    ...base,
    pinned: o.pinned ?? base.pinned,
    manualBump: o.manualBump ?? base.manualBump,
    status: o.status ?? base.status,
  };
}

function mapStandardsStatus(s: string): ItemStatus {
  // Standards-plan-page uses: "Not Started" | "Planned" | "In Progress" | "Blocked" | "Done"
  switch (s) {
    case "Done":
      return "done";
    case "In Progress":
      return "in_progress";
    case "Blocked":
      return "blocked";
    case "Planned":
      return "open"; // treat as open for queue purposes
    case "Not Started":
    default:
      return "open";
  }
}

function reverseStandardsStatus(s: ItemStatus): string {
  switch (s) {
    case "done":
      return "Done";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "monitoring":
      return "In Progress"; // best-fit for the standards-plan vocabulary
    case "open":
    default:
      return "Not Started";
  }
}
