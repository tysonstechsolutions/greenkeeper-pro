"use client";

import Link from "next/link";
import { ListChecks, ChevronRight } from "lucide-react";
import { useMyDay } from "@/lib/my-day/use-my-day";

/** Compact My Day summary for the GM dashboard — today's count, taps through. */
export function MyDayCard() {
  const { view, loading } = useMyDay();
  const count = view.overdue.length + view.today.length;

  return (
    <Link href="/my-day" className="gk-card p-4 block">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">My Day</h2>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
      {!loading && (
        <p className="text-xs text-muted-foreground mt-1">
          {count === 0
            ? "Nothing due today — you're caught up."
            : `${count} to do today${view.overdue.length ? ` · ${view.overdue.length} overdue` : ""}`}
        </p>
      )}
    </Link>
  );
}
