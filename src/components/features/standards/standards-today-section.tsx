"use client";

import Link from "next/link";
import { Target, UserX, ChevronRight } from "lucide-react";
import { STATUS_LABELS, type StandardWithStatus } from "@/lib/standards/types";
import type { ProgramScore } from "@/lib/standards/scoring";

/**
 * Today's "what's keeping us below standard" section.
 *
 * Deliberately narrow: Today is a command centre, not a catalog. This shows the
 * few worst standards + the ownership gap + the program trendline, and links out
 * to the full scorecard rather than dumping 93 rows onto the page.
 */
export function StandardsTodaySection({
  score,
  needsAction,
  loading,
}: {
  score: ProgramScore;
  needsAction: StandardWithStatus[];
  loading: boolean;
}) {
  // Nothing to say yet — stay silent rather than render an empty shell.
  if (loading || score.totalStandards === 0) return null;

  const top = needsAction.slice(0, 4);

  return (
    <section className="mb-6 gk-animate-in gk-animate-in-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="gk-section-label flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          Keeping us below standard
        </p>
        <Link
          href="/standards"
          className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5"
        >
          Scorecard
          {score.percent !== null && (
            <span className="ml-1 font-semibold tabular-nums">{score.percent}%</span>
          )}
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {score.critical > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-destructive">{score.critical} critical</span>
            {score.failing - score.critical > 0 && (
              <> · {score.failing - score.critical} below standard</>
            )}
            {score.unknown > 0 && <> · {score.unknown} never checked</>}
          </p>
        )}

        {top.map((s) => (
          <Link
            key={s.standard.id}
            href="/standards"
            className="block rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.standard.title}</p>
                {s.detail && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {s.detail}
                  </p>
                )}
                {/* Who owns it — the answer is often "nobody", and that's the point. */}
                <p className="text-[11px] mt-1">
                  {s.standard.owner_profile_id ? (
                    <span className="text-muted-foreground">Owner assigned</span>
                  ) : (
                    <span className="text-warning-foreground font-medium inline-flex items-center gap-1">
                      <UserX className="w-3 h-3" />
                      No owner
                      {s.standard.owner_role ? ` · suggested: ${s.standard.owner_role}` : ""}
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                  s.status === "critical"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-warning/15 text-warning-foreground border-warning/40"
                }`}
              >
                {STATUS_LABELS[s.status]}
              </span>
            </div>
          </Link>
        ))}

        {score.unowned > 0 && (
          <Link
            href="/standards"
            className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 hover:bg-warning/15 transition-colors"
          >
            <UserX className="w-4 h-4 text-warning-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-warning-foreground">
              <span className="font-semibold">{score.unowned}</span> standard
              {score.unowned === 1 ? "" : "s"} have no owner — decide who&apos;s
              accountable so the work reaches someone.
            </p>
          </Link>
        )}
      </div>
    </section>
  );
}
