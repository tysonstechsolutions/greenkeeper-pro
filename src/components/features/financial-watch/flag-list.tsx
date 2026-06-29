import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Flag } from "@/lib/financial-watch/types";
import { SEVERITY_STYLE, flagHref } from "./severity";

/**
 * Renders the watchdog's ranked flags as cards: severity icon, title, the
 * detail (with real numbers, straight from the engine), and a suggested fix.
 * When a flag has a natural destination, the whole card links there.
 */
export function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) {
    return (
      <div className="gk-card p-5 text-center">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Nothing needs your attention.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Budgets, pace, and revenue all look on track.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {flags.map((flag) => {
        const s = SEVERITY_STYLE[flag.severity];
        const Icon = s.icon;
        const href = flagHref(flag);

        const body = (
          <div className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}
            >
              <Icon className={`w-4 h-4 ${s.text}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{flag.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{flag.detail}</p>
              {flag.action && (
                <p className="text-xs font-medium mt-1.5">
                  <span className="text-muted-foreground">Fix: </span>
                  {flag.action}
                </p>
              )}
            </div>
            {href && (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 self-center" />
            )}
          </div>
        );

        const className = `gk-card p-4 border-l-4 ${s.border} block`;
        return href ? (
          <Link key={flag.id} href={href} className={className}>
            {body}
          </Link>
        ) : (
          <div key={flag.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
