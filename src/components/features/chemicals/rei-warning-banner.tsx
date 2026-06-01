"use client";

import { AlertTriangle } from "lucide-react";
import type { REIZoneInfo } from "@/lib/utils/rei-conflicts";

interface REIWarningBannerProps {
  conflicts: REIZoneInfo[];
  className?: string;
}

/**
 * Formats the time left on an REI as a short human string ("4h", "30m",
 * "2d 3h"). `hours_remaining` is a fractional hour count.
 */
function formatTimeRemaining(hours: number): string {
  if (hours <= 0) return "expiring now";
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins}m left`;
  }
  if (hours < 24) {
    return `${Math.round(hours)}h left`;
  }
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h left` : `${days}d left`;
}

/**
 * Warns that a task targets a zone or hole still inside an active Restricted
 * Entry Interval. Renders nothing when there are no conflicts, so callers can
 * mount it unconditionally and pass the (possibly empty) conflict list.
 */
export function REIWarningBanner({
  conflicts,
  className,
}: REIWarningBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-700 dark:text-red-400 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-sm">
            Restricted Entry Interval active
          </p>
          <p className="text-xs opacity-90 mt-0.5">
            A chemical was applied here recently. Workers should not enter until
            the REI clears.
          </p>
          <ul className="mt-2 space-y-1">
            {conflicts.map((c) => (
              <li
                key={c.application_id}
                className="text-xs flex items-center justify-between gap-2"
              >
                <span className="font-medium truncate">{c.product_name}</span>
                <span className="tabular-nums whitespace-nowrap opacity-90">
                  {formatTimeRemaining(c.hours_remaining)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
