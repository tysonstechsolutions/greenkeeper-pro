"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import type { FinancialWatch } from "@/lib/financial-watch/types";
import { todayLocal } from "@/lib/utils/date";
import { STATUS_STYLE } from "./severity";

const KEY = "vmgc:fin-alert-dismissed";

/**
 * A stable fingerprint of the current alert state. Dismissal is keyed to this +
 * the date, so the banner reappears when a NEW problem shows up (different
 * signature) or the next day — but stays hidden once acknowledged today.
 */
function signature(watch: FinancialWatch): string {
  const h = watch.headline;
  return `${h.overallStatus}:${h.criticalCount}:${h.warningCount}:${h.topFlags[0]?.id ?? ""}`;
}

/**
 * Proactive financial alert. When the watchdog finds critical or warning flags,
 * this surfaces them at the top of the GM dashboard so the GM is told without
 * having to open Financial Watch. Dismissible per-day.
 */
function readDismissedSig(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: string; sig?: string };
    if (parsed.date === todayLocal() && typeof parsed.sig === "string") {
      return parsed.sig;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function FinancialAlertBanner({ watch }: { watch: FinancialWatch | null }) {
  // Lazy init (not an effect): the banner is null during SSR/first paint
  // anyway (watch loads client-side), so reading localStorage here is safe.
  const [dismissedSig, setDismissedSig] = useState<string | null>(readDismissedSig);

  if (!watch || watch.headline.overallStatus === "ok") return null;

  const sig = signature(watch);
  if (dismissedSig === sig) return null;

  const isAlert = watch.headline.overallStatus === "alert";
  const top = watch.headline.topFlags[0];
  const status = STATUS_STYLE[watch.headline.overallStatus];

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: todayLocal(), sig }));
    } catch {
      /* ignore */
    }
    setDismissedSig(sig);
  };

  return (
    <div className={`mb-3 rounded-xl border ${status.border} ${status.bg} p-3`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={`w-5 h-5 shrink-0 ${status.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${status.text}`}>
            {isAlert
              ? "Financial issues need your attention"
              : "A few financial items to watch"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {watch.headline.criticalCount} critical · {watch.headline.warningCount} warning
            {top ? ` — ${top.title}` : ""}
          </p>
          <Link
            href="/financial-watch"
            className="text-xs font-medium underline mt-1 inline-block"
          >
            Open Financial Watch
          </Link>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
