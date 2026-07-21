"use client";

import Link from "next/link";
import { ArrowRight, Sunrise } from "lucide-react";
import type { OperationalWorkItem } from "@/lib/operational-work/types";
import { buildMorningBrief } from "@/lib/operational-work/morning-brief";

interface Props {
  items: OperationalWorkItem[];
  today: Date;
}

export function MorningBrief({ items, today }: Props) {
  const brief = buildMorningBrief(items, today);

  return (
    <section
      aria-label="Morning brief"
      className="mb-4 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4"
    >
      <div className="flex items-center gap-2">
        <Sunrise className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-bold">Morning brief · {brief.dateLabel}</h2>
      </div>
      <p className="mt-1.5 text-sm font-medium">{brief.headline}</p>

      {brief.lines.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {brief.lines.map((line) => (
            <li key={line} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      )}

      {brief.topActions.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start here</p>
          <ol className="mt-1 space-y-1">
            {brief.topActions.map((item, index) => (
              <li key={item.stableId}>
                <Link
                  href={item.destinationRoute}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-amber-500/10"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                  {item.dueDate && <span className="shrink-0 text-xs text-muted-foreground">Due {item.dueDate}</span>}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
