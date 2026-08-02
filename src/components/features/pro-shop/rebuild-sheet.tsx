"use client";

/**
 * Choose which days a rebuild is allowed to touch.
 *
 * Regenerate used to be all-or-nothing, which is the wrong shape once a month
 * contains work done by hand. After a Tuesday call-out the GM wants Tuesday
 * rebuilt, not the three weeks he already fixed. The window is stated in days,
 * and what is being protected is stated in numbers, because "this replaces
 * every unpinned shift" is not something anyone can check before pressing it.
 */

import { useMemo, useState } from "react";
import { CalendarRange, Loader2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Overlay } from "@/components/features/pro-shop/overlay";
import { datesInMonth, shortDate } from "@/lib/pro-shop/schedule-engine";
import { isDayLocked, type DayOverrides } from "@/lib/pro-shop/day-overrides";
import type { ProShopShift } from "@/lib/pro-shop/types";

export type RebuildScope = "month" | "forward" | "range";

export function RebuildSheet({
  year,
  month0,
  today,
  overrides,
  shifts,
  hasExisting,
  busy,
  onClose,
  onRebuild,
}: {
  year: number;
  month0: number;
  /** Today as YYYY-MM-DD, for the "from today onward" window. */
  today: string;
  overrides: DayOverrides;
  /** The month's active shifts, to count what is pinned inside the window. */
  shifts: ProShopShift[];
  /** Whether a schedule already exists — a first build has nothing to replace. */
  hasExisting: boolean;
  busy: boolean;
  onClose: () => void;
  onRebuild: (dates: string[]) => Promise<void>;
}) {
  const monthDates = useMemo(() => datesInMonth(year, month0), [year, month0]);
  const [scope, setScope] = useState<RebuildScope>("month");
  const [from, setFrom] = useState(monthDates[0] ?? today);
  const [to, setTo] = useState(monthDates[monthDates.length - 1] ?? today);

  /** Every day in the chosen window, before held days are taken out. */
  const requested = useMemo(() => {
    if (scope === "forward") return monthDates.filter((date) => date >= today);
    if (scope === "range") {
      const lo = from <= to ? from : to;
      const hi = from <= to ? to : from;
      return monthDates.filter((date) => date >= lo && date <= hi);
    }
    return monthDates;
  }, [scope, monthDates, today, from, to]);

  const held = requested.filter((date) => isDayLocked(date, overrides));
  const willBuild = requested.filter((date) => !isDayLocked(date, overrides));
  const buildSet = useMemo(() => new Set(willBuild), [willBuild]);
  const pinnedInside = shifts.filter((s) => s.locked && buildSet.has(s.shift_date)).length;

  return (
    <Overlay title={hasExisting ? "Rebuild the schedule" : "Generate the schedule"} onClose={onClose}>
      <div className="p-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium mb-1.5">Which days?</legend>
          {([
            { key: "month" as const, label: "Whole month", hint: "Every day the rules cover" },
            { key: "forward" as const, label: "From today onward", hint: `${shortDate(today)} to the end of the month` },
            { key: "range" as const, label: "Pick a date range", hint: "Just the days you choose" },
          ]).map((option) => (
            <label
              key={option.key}
              className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                scope === option.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="rebuild-scope"
                className="mt-0.5 h-4 w-4 accent-emerald-700"
                checked={scope === option.key}
                onChange={() => setScope(option.key)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {scope === "range" && (
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={from}
                min={monthDates[0]}
                max={monthDates[monthDates.length - 1]}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                min={monthDates[0]}
                max={monthDates[monthDates.length - 1]}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* What this will and will not touch, counted out. */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium text-foreground flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" />
            {willBuild.length === 0
              ? "Nothing to rebuild"
              : `Rebuilding ${willBuild.length} day${willBuild.length === 1 ? "" : "s"}`}
            {willBuild.length > 0 && (
              <span className="font-normal text-muted-foreground">
                · {shortDate(willBuild[0])} – {shortDate(willBuild[willBuild.length - 1])}
              </span>
            )}
          </p>
          {held.length > 0 && (
            <p className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> Keeping {held.length} held day{held.length === 1 ? "" : "s"} untouched
            </p>
          )}
          {pinnedInside > 0 && (
            <p className="text-muted-foreground">
              Keeping {pinnedInside} pinned shift{pinnedInside === 1 ? "" : "s"} inside the window.
            </p>
          )}
          <p className="text-muted-foreground">
            Everything else in the window is replaced. Days outside it are left alone.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="flex-1 gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]"
            disabled={busy || willBuild.length === 0}
            onClick={() => void onRebuild(willBuild)}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {hasExisting ? "Rebuild" : "Generate"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
