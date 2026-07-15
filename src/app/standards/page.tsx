"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Target,
  AlertTriangle,
  HelpCircle,
  UserX,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useStandards } from "@/lib/standards/use-standards";
import {
  STATUS_LABELS,
  SOURCE_LABELS,
  type StandardStatus,
  type StandardWithStatus,
} from "@/lib/standards/types";

/**
 * Program Standards scorecard — the honest picture of where the golf program
 * stands against the FY24 Navy Standards assessment.
 *
 * Design rule carried throughout: never render "unknown" as a failure or a
 * zero. A NULL percent shows as "Not scored", not 0%.
 */

const STATUS_CLASSES: Record<StandardStatus, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  below_standard: "bg-warning/15 text-warning-foreground border-warning/40",
  at_risk: "bg-warning/10 text-warning-foreground border-warning/30",
  blocked: "bg-destructive/10 text-destructive border-destructive/30",
  awaiting_verification: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  corrective_action_active: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  not_evaluated: "bg-muted text-muted-foreground border-border",
  insufficient_data: "bg-muted text-muted-foreground border-border",
  meets_standard: "bg-success/10 text-success border-success/30",
  not_applicable: "bg-muted text-muted-foreground border-border",
};

function StatusChip({ status }: { status: StandardStatus }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A percent that tells the truth when it doesn't know. */
function Percent({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground text-sm">Not scored</span>;
  }
  return <span className="font-semibold tabular-nums">{value}%</span>;
}

export default function StandardsPage() {
  const { score, needsAction, withStatus, unowned, loading, error } = useStandards();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const bySection = useMemo(() => {
    const map = new Map<string, StandardWithStatus[]>();
    for (const s of withStatus) {
      const list = map.get(s.standard.section) ?? [];
      list.push(s);
      map.set(s.standard.section, list);
    }
    return map;
  }, [withStatus]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading program standards…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-[#1B4332] dark:text-emerald-400" />
          Program Standards
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where the golf program stands against the Navy standards assessment.
          Scores come from the scored assessment — anything never assessed shows
          as <span className="font-medium">Not checked yet</span> rather than a
          failure.
        </p>
      </div>

      {/* ── Overall ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Program score
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {score.percent === null ? (
                <span className="text-xl text-muted-foreground">Not scored</span>
              ) : (
                `${score.percent}%`
              )}
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Based on {Math.round(score.coverage * 100)}% of sections
            <br />
            having scored data
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat
            label="Critical"
            value={score.critical}
            icon={AlertTriangle}
            cls="text-destructive"
          />
          <Stat
            label="Below standard"
            value={score.failing - score.critical}
            icon={AlertTriangle}
            cls="text-warning-foreground"
          />
          <Stat
            label="Not checked"
            value={score.unknown}
            icon={HelpCircle}
            cls="text-muted-foreground"
          />
        </div>

        {score.unowned > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
            <UserX className="w-4 h-4 text-warning-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-warning-foreground">
              <span className="font-semibold">{score.unowned}</span> active
              standard{score.unowned === 1 ? "" : "s"} have no owner. Nobody is
              accountable for them, so the work lands in nobody&apos;s day.
            </p>
          </div>
        )}
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By area
        </h2>
        {score.sections.map((sec) => {
          const isOpen = openSection === sec.section;
          const items = bySection.get(sec.section) ?? [];
          return (
            <div key={sec.section} className="rounded-xl border border-border bg-card">
              <button
                onClick={() => setOpenSection(isOpen ? null : sec.section)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm truncate">{sec.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    weight {sec.weight}
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  {sec.critical > 0 && (
                    <span className="text-[11px] font-semibold text-destructive">
                      {sec.critical} critical
                    </span>
                  )}
                  <Percent value={sec.percent} />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/60">
                  {items.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      No standards recorded in this area.
                    </p>
                  ) : (
                    items.map((s) => <StandardRow key={s.standard.id} item={s} />)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Needs action ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Needs action ({needsAction.length})
        </h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
          {needsAction.slice(0, 15).map((s) => (
            <StandardRow key={s.standard.id} item={s} showWhy />
          ))}
        </div>
        {needsAction.length > 15 && (
          <p className="text-xs text-muted-foreground">
            Showing the 15 most urgent of {needsAction.length}.
          </p>
        )}
      </div>

      {unowned.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unowned.length} standard{unowned.length === 1 ? "" : "s"} still need an
          owner assigned before the work can reach anyone.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  cls,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  cls: string;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className={`flex items-center gap-1.5 text-[11px] ${cls}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function StandardRow({
  item,
  showWhy = false,
}: {
  item: StandardWithStatus;
  showWhy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = item.standard;
  return (
    <div className="p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="text-sm font-medium">{s.title}</span>
          <span className="ml-1.5 text-[11px] text-muted-foreground">{s.code}</span>
          {showWhy && item.detail && (
            <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {item.detail}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {s.priority && (
            <span className="text-[10px] font-semibold text-muted-foreground">
              {s.priority}
            </span>
          )}
          <StatusChip status={item.status} />
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-muted-foreground">{s.standard_text}</p>
          {s.expected_condition && (
            <p>
              <span className="font-semibold">What good looks like: </span>
              <span className="text-muted-foreground">{s.expected_condition}</span>
            </p>
          )}
          {s.current_state && (
            <p>
              <span className="font-semibold">Where we are: </span>
              <span className="text-muted-foreground">{s.current_state}</span>
            </p>
          )}
          {s.recommended_actions.length > 0 && (
            <div>
              <p className="font-semibold">Recommended actions</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 mt-0.5">
                {s.recommended_actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground pt-1">
            <span>
              Owner:{" "}
              {s.owner_profile_id ? (
                "Assigned"
              ) : (
                <span className="text-warning-foreground font-medium">
                  {s.owner_role ? `${s.owner_role} (not assigned to a person)` : "Nobody"}
                </span>
              )}
            </span>
            {s.timeline && <span>Timeline: {s.timeline}</span>}
            {s.cost_estimate > 0 && (
              <span>Est. cost: ${s.cost_estimate.toLocaleString()}</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
            {SOURCE_LABELS[s.source_type]}
            {s.requires_confirmation && " · needs management confirmation"}
            {s.source_document ? ` · ${s.source_document}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
