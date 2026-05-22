"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Download,
  Search,
  Filter,
  Users,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Circle,
  Pause,
  PlayCircle,
} from "lucide-react";
import type { GapPlan, PlanEntry, Status, Priority } from "./types";

const STATUS_STORAGE_KEY = "vmgc_standards_plan_status_v1";
const NOTES_STORAGE_KEY = "vmgc_standards_plan_notes_v1";

const STATUS_OPTIONS: Status[] = [
  "Not Started",
  "Planned",
  "In Progress",
  "Blocked",
  "Done",
];

const STATUS_STYLES: Record<Status, { icon: typeof Circle; cls: string }> = {
  "Not Started": { icon: Circle, cls: "text-muted-foreground bg-muted/40" },
  Planned: { icon: PlayCircle, cls: "text-sky-700 bg-sky-50 dark:bg-sky-950/40" },
  "In Progress": {
    icon: PlayCircle,
    cls: "text-amber-700 bg-amber-50 dark:bg-amber-950/40",
  },
  Blocked: { icon: Pause, cls: "text-red-700 bg-red-50 dark:bg-red-950/40" },
  Done: {
    icon: CheckCircle2,
    cls: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40",
  },
};

const PRIORITY_STYLES: Record<Priority, string> = {
  P1: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  P2: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  P3: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  P4: "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
};

const SECTION_ICON_COLOR: Record<string, string> = {
  Personnel: "bg-purple-100 text-purple-700",
  Facilities: "bg-blue-100 text-blue-700",
  Programs: "bg-emerald-100 text-emerald-700",
  Equipment: "bg-amber-100 text-amber-700",
  Administration: "bg-rose-100 text-rose-700",
};

export default function StandardsPlanPage() {
  const [plan, setPlan] = useState<GapPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load the plan
  useEffect(() => {
    fetch("/data/standards_plan.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Plan file not found (${r.status})`);
        return r.json() as Promise<GapPlan>;
      })
      .then((data) => setPlan(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Restore status + notes from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STATUS_STORAGE_KEY);
      if (raw) setStatusMap(JSON.parse(raw));
      const rawN = localStorage.getItem(NOTES_STORAGE_KEY);
      if (rawN) setNotesMap(JSON.parse(rawN));
    } catch {
      // ignore
    }
  }, []);

  // Save status changes
  function setStatus(id: string, status: Status) {
    setStatusMap((prev) => {
      const next = { ...prev, [id]: status };
      try {
        localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function setNote(id: string, note: string) {
    setNotesMap((prev) => {
      const next = { ...prev, [id]: note };
      try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function getStatus(entry: PlanEntry): Status {
    return statusMap[entry.id] ?? (entry.status as Status);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Filtered entries
  const filtered = useMemo(() => {
    if (!plan) return [];
    const q = search.toLowerCase().trim();
    return plan.entries.filter((e) => {
      const status: Status = statusMap[e.id] ?? (e.status as Status);
      if (filterSection !== "all" && e.section_name !== filterSection) return false;
      if (filterPriority !== "all" && e.priority !== filterPriority) return false;
      if (filterOwner !== "all" && e.owner !== filterOwner) return false;
      if (filterStatus !== "all" && status !== filterStatus) return false;
      if (
        q &&
        !(
          e.id.toLowerCase().includes(q) ||
          e.short_title.toLowerCase().includes(q) ||
          e.standard_text.toLowerCase().includes(q) ||
          e.owner.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [
    plan,
    search,
    filterSection,
    filterPriority,
    filterOwner,
    filterStatus,
    statusMap,
  ]);

  // Stats
  const stats = useMemo(() => {
    if (!plan)
      return {
        total: 0,
        done: 0,
        inProgress: 0,
        blocked: 0,
        notStarted: 0,
        planned: 0,
        pctComplete: 0,
      };
    const total = plan.entries.length;
    let done = 0,
      inProgress = 0,
      blocked = 0,
      notStarted = 0,
      planned = 0;
    plan.entries.forEach((e) => {
      const s: Status = statusMap[e.id] ?? (e.status as Status);
      if (s === "Done") done++;
      else if (s === "In Progress") inProgress++;
      else if (s === "Blocked") blocked++;
      else if (s === "Planned") planned++;
      else notStarted++;
    });
    return {
      total,
      done,
      inProgress,
      blocked,
      notStarted,
      planned,
      pctComplete: total > 0 ? Math.round((done * 100) / total) : 0,
    };
  }, [plan, statusMap]);

  const sectionList = plan ? Object.values(plan.section_names) : [];
  const ownerList = plan
    ? Array.from(new Set(plan.entries.map((e) => e.owner))).sort()
    : [];

  if (loading) {
    return (
      <div className="p-4">
        <PageHeader title="Standards Plan" icon={ShieldCheck} />
        <p className="text-muted-foreground">Loading plan data...</p>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="p-4">
        <PageHeader title="Standards Plan" icon={ShieldCheck} />
        <Card>
          <CardContent className="p-4">
            <p className="text-red-600">
              Could not load plan: {error ?? "Unknown error"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Expected file at <code>/public/data/standards_plan.json</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="FY24 Standards Plan"
        description={`${plan.course} • ${plan.installation}`}
        icon={ShieldCheck}
      >
        <Button asChild variant="outline" size="sm">
          <a href="/data/standards_plan.json" download>
            <Download className="w-4 h-4 mr-1" />
            Export JSON
          </a>
        </Button>
      </PageHeader>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatTile label="Total Gaps" value={stats.total} tone="default" />
        <StatTile label="Done" value={stats.done} tone="green" />
        <StatTile label="In Progress" value={stats.inProgress} tone="amber" />
        <StatTile label="Planned" value={stats.planned} tone="sky" />
        <StatTile label="Blocked" value={stats.blocked} tone="red" />
        <StatTile
          label="Not Started"
          value={stats.notStarted}
          tone="default"
        />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1 text-sm">
          <span className="text-muted-foreground">Overall completion</span>
          <span className="font-semibold">{stats.pctComplete}%</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${stats.pctComplete}%` }}
          />
        </div>
      </div>

      {/* Subsection scores */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">
          Current standards score by subsection (from your filled questionnaire)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.entries(plan.subsection_scores).map(([sub, sc]) => (
            <ScoreTile
              key={sub}
              subsection={sub}
              earned={sc.earned}
              possible={sc.possible}
              percent={sc.percent}
            />
          ))}
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by id, title, owner, or text..."
              className="w-full h-9 pl-9 pr-3 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <FilterSelect
              label="Section"
              value={filterSection}
              onChange={setFilterSection}
              options={[
                { value: "all", label: "All sections" },
                ...sectionList.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              label="Priority"
              value={filterPriority}
              onChange={setFilterPriority}
              options={[
                { value: "all", label: "All priorities" },
                { value: "P1", label: "P1 - Critical" },
                { value: "P2", label: "P2 - High" },
                { value: "P3", label: "P3 - Medium" },
                { value: "P4", label: "P4 - Low" },
              ]}
            />
            <FilterSelect
              label="Owner"
              value={filterOwner}
              onChange={setFilterOwner}
              options={[
                { value: "all", label: "All owners" },
                ...ownerList.map((o) => ({ value: o, label: o })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {plan.entries.length} gaps
          </p>
        </CardContent>
      </Card>

      {/* Entries list */}
      <div className="space-y-2">
        {filtered.map((entry) => {
          const status = getStatus(entry);
          const isOpen = expanded.has(entry.id);
          const StatusIcon = STATUS_STYLES[status].icon;
          return (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {entry.id}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          SECTION_ICON_COLOR[entry.section_name] ?? ""
                        }`}
                      >
                        {entry.section_name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_STYLES[entry.priority]}`}
                      >
                        {entry.priority}
                      </span>
                      {entry.possible_score > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          +{entry.possible_score} pts
                        </span>
                      )}
                      {entry.answer === "Blank" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800">
                          NEEDS VERIFY
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm leading-snug">
                      {entry.short_title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {entry.owner}
                      </span>
                      <span>{entry.timeline}</span>
                      <span>{entry.cost_estimate}</span>
                    </div>
                  </div>
                  <div
                    className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${STATUS_STYLES[status].cls}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {status}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-4 space-y-3 text-sm">
                    <Section title="Standard text">
                      <p className="text-muted-foreground italic">
                        &ldquo;{entry.standard_text}&rdquo;
                      </p>
                    </Section>
                    <Section title="Current state">
                      <p>{entry.current_state}</p>
                    </Section>
                    <Section title="Target state">
                      <p>{entry.target_state}</p>
                    </Section>
                    <Section title="Action steps">
                      <ol className="list-decimal pl-5 space-y-1">
                        {entry.actions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ol>
                    </Section>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Section title="Owner">
                        <p>
                          {entry.owner}
                          {entry.secondary_owners.length > 0 &&
                            ` (with ${entry.secondary_owners.join(", ")})`}
                        </p>
                      </Section>
                      <Section title="Effort">
                        <p>{entry.effort}</p>
                      </Section>
                      <Section title="Timeline">
                        <p>{entry.timeline}</p>
                      </Section>
                      <Section title="Cost estimate">
                        <p>{entry.cost_estimate}</p>
                      </Section>
                    </div>
                    {entry.dependencies.length > 0 && (
                      <Section title="Depends on">
                        <div className="flex flex-wrap gap-1">
                          {entry.dependencies.map((d) => (
                            <Badge key={d} variant="secondary">
                              {d}
                            </Badge>
                          ))}
                        </div>
                      </Section>
                    )}
                    {entry.notes && (
                      <Section title="Note">
                        <p className="text-amber-700 dark:text-amber-400">
                          {entry.notes}
                        </p>
                      </Section>
                    )}
                    <Section title="Status">
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map((s) => {
                          const Icon = STATUS_STYLES[s].icon;
                          const active = s === status;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setStatus(entry.id, s)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                active
                                  ? "border-transparent " +
                                    STATUS_STYLES[s].cls
                                  : "border-input bg-background hover:bg-accent"
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </Section>
                    <Section title="Your notes">
                      <textarea
                        value={notesMap[entry.id] ?? ""}
                        onChange={(e) => setNote(entry.id, e.target.value)}
                        placeholder="Add notes - saved locally to this browser"
                        className="w-full min-h-16 p-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </Section>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No gap entries match the current filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "green" | "amber" | "sky" | "red";
}) {
  const tones: Record<typeof tone, string> = {
    default: "bg-card",
    green: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    sky: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
    red: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ScoreTile({
  subsection,
  earned,
  possible,
  percent,
}: {
  subsection: string;
  earned: number;
  possible: number;
  percent: number;
}) {
  const tone =
    percent >= 80
      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
      : percent >= 50
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300";
  return (
    <div className={`rounded-md border p-2 text-xs ${tone}`}>
      <p className="font-semibold">{subsection}</p>
      <p className="font-mono">{percent.toFixed(1)}%</p>
      <p className="opacity-80">
        {earned}/{possible} pts
      </p>
    </div>
  );
}

function FilterSelect({
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}
