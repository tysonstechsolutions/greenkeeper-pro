import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PR_TRACKER_LABELS, prTrackerIndex, type PrStatus } from "@/lib/pr-stages";

/**
 * Horizontal step tracker showing where a PR sits in its lifecycle — every
 * stage is named, completed stages are filled + checked, the current one is
 * highlighted, and upcoming ones are dimmed. No hover needed to read it.
 *
 * The final "Complete" step comes from `completed` (completed_at), not from
 * status, so a received PR shows Complete dimmed ahead of it — the receipt is
 * the thing standing between the two.
 */
export function PrStageTracker({
  status,
  completed = false,
  className,
}: {
  status: PrStatus;
  completed?: boolean;
  className?: string;
}) {
  const current = prTrackerIndex(status, completed);
  // Unknown status — render nothing rather than a broken tracker.
  if (current < 0) return null;
  const last = PR_TRACKER_LABELS.length - 1;

  return (
    <div
      className={cn("w-full", className)}
      aria-label={`Stage ${current + 1} of ${PR_TRACKER_LABELS.length}: ${PR_TRACKER_LABELS[current]}`}
    >
      <div className="flex items-start">
        {PR_TRACKER_LABELS.map((short, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          return (
            <div key={short} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    i === 0
                      ? "bg-transparent"
                      : i - 1 < current
                        ? "bg-emerald-500"
                        : "bg-border",
                  )}
                />
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    isDone && "bg-emerald-500 text-white",
                    isCurrent && "bg-blue-500 text-white",
                    !isDone &&
                      !isCurrent &&
                      "border border-border bg-card text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    i === last
                      ? "bg-transparent"
                      : i < current
                        ? "bg-emerald-500"
                        : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-1 px-0.5 text-center text-[10px] leading-tight",
                  isCurrent
                    ? "font-semibold text-blue-600 dark:text-blue-400"
                    : "text-muted-foreground",
                )}
              >
                {short}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
