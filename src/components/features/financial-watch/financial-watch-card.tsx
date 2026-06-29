"use client";

import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";
import { useFinancialWatch } from "@/lib/financial-watch/load";
import { SEVERITY_STYLE, STATUS_STYLE, formatMoney } from "./severity";

/**
 * Compact Financial Watch summary for the GM dashboard: overall status, net
 * position, and the top few flags. Taps through to the full /financial-watch
 * view. Reads the same engine output as the page (recomputed on mount).
 */
export function FinancialWatchCard() {
  const { watch, loading } = useFinancialWatch();

  return (
    <Link href="/financial-watch" className="gk-card p-4 block">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Financial Watch</h2>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>

      {loading && !watch && (
        <p className="text-xs text-muted-foreground">Reading the books…</p>
      )}

      {watch && (
        <>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[watch.headline.overallStatus].bg} ${STATUS_STYLE[watch.headline.overallStatus].text}`}
            >
              {STATUS_STYLE[watch.headline.overallStatus].label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {watch.headline.criticalCount} critical · {watch.headline.warningCount} warning
            </span>
            {watch.headline.netPositionYtd != null && (
              <span
                className={`text-sm font-bold ${
                  watch.headline.netPositionYtd >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatMoney(watch.headline.netPositionYtd)}
              </span>
            )}
          </div>

          {watch.headline.topFlags.length > 0 ? (
            <ul className="space-y-1">
              {watch.headline.topFlags.map((f) => {
                const s = SEVERITY_STYLE[f.severity];
                const Icon = s.icon;
                return (
                  <li key={f.id} className="flex items-center gap-2 text-xs">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${s.text}`} />
                    <span className="truncate">{f.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              All clear — on track.
            </p>
          )}
        </>
      )}
    </Link>
  );
}
