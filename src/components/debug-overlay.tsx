"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bug,
  X,
  RefreshCw,
  AlertTriangle,
  Copy,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseTelemetry, resetClient } from "@/lib/supabase/client";
import {
  clearBreadcrumbs,
  formatBreadcrumbsAsText,
  getBreadcrumbs,
  recordBreadcrumb,
  subscribeBreadcrumbs,
  type Breadcrumb,
  type BreadcrumbKind,
} from "@/lib/debug/breadcrumbs";

/**
 * Floating debug button + panel. Designed around the fact that most
 * real-world bugs in this app are SILENT — a click that doesn't navigate,
 * a fetch that never resolves, a layout problem. The previous iteration
 * only caught thrown exceptions, so the user never saw it light up even
 * when things were broken. This version:
 *
 *  - Reads from a breadcrumb buffer that records nav changes, link
 *    clicks, fetch start/done, console.error/warn/info, and lifecycle.
 *  - Shows a status dot on the icon: green = clean, amber = something
 *    pending/warning, red = errors captured. So even when the app is
 *    healthy the user knows the recorder is working.
 *  - Has a one-tap "Copy log" button so the user can send me the
 *    timeline without having to transcribe.
 *  - Has the existing big red "Reset app state" button for when Supabase
 *    is wedged.
 */

// Which kinds we consider "bad" vs "noisy but fine". Drives the status dot.
const ERROR_KINDS: ReadonlySet<BreadcrumbKind> = new Set([
  "error",
  "timeout",
  "reset",
]);
const WARN_KINDS: ReadonlySet<BreadcrumbKind> = new Set(["warn"]);

const KIND_CLASS: Record<BreadcrumbKind, string> = {
  nav: "border-primary/40 bg-primary/5",
  click: "border-blue-500/30 bg-blue-500/5",
  fetch: "border-slate-500/30 bg-slate-500/5",
  "fetch-done": "border-slate-500/20 bg-slate-500/5 opacity-70",
  error: "border-red-500/40 bg-red-500/10",
  warn: "border-amber-500/40 bg-amber-500/10",
  info: "border-sky-500/30 bg-sky-500/5",
  lifecycle: "border-violet-500/30 bg-violet-500/5",
  reset: "border-blue-600/40 bg-blue-600/10",
  timeout: "border-orange-500/40 bg-orange-500/10",
};

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<readonly Breadcrumb[]>(() =>
    getBreadcrumbs(),
  );
  const [pending, setPending] = useState(0);
  const [showStuck, setShowStuck] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Subscribe to breadcrumb updates.
  useEffect(() => {
    const unsubscribe = subscribeBreadcrumbs(() => {
      setLogs([...getBreadcrumbs()]);
    });
    // Catch up on any breadcrumbs added between the useState initializer
    // running and the subscription being installed — race window is tiny
    // but real on slow mounts.
    setLogs([...getBreadcrumbs()]); // eslint-disable-line react-hooks/set-state-in-effect
    return unsubscribe;
  }, []);

  // Capture window errors + promise rejections into the breadcrumb buffer.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      recordBreadcrumb(
        "error",
        e.message || "Unknown error",
        e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      );
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        r instanceof Error
          ? `${r.name}: ${r.message}`
          : typeof r === "string"
            ? r
            : (() => {
                try {
                  return JSON.stringify(r);
                } catch {
                  return String(r);
                }
              })();
      recordBreadcrumb("error", `UnhandledRejection: ${msg}`);
    };
    const onStuck = () => {
      recordBreadcrumb(
        "timeout",
        "Supabase client signalled a stuck state (1+ request timed out)",
      );
      setShowStuck(true);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("supabase:reset-needed", onStuck);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("supabase:reset-needed", onStuck);
    };
  }, []);

  // Poll pending-request count + run the silent-hang watchdog. Guard the
  // setState with a change check so the 1Hz interval doesn't schedule a
  // React re-render every second when nothing changed.
  useEffect(() => {
    let stuckSince: number | null = null;
    let prevPending = -1;
    const id = setInterval(() => {
      const p = getSupabaseTelemetry().pending;
      if (p !== prevPending) {
        prevPending = p;
        setPending(p);
      }
      if (p > 0) {
        if (stuckSince === null) stuckSince = Date.now();
        else if (Date.now() - stuckSince > 10_000 && !showStuck) {
          recordBreadcrumb(
            "timeout",
            `App stuck: ${p} request(s) pending for 10+ seconds`,
          );
          setShowStuck(true);
        }
      } else {
        stuckSince = null;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [showStuck]);

  const stats = useMemo(() => {
    let errors = 0;
    let warns = 0;
    for (const c of logs) {
      if (ERROR_KINDS.has(c.kind)) errors++;
      else if (WARN_KINDS.has(c.kind)) warns++;
    }
    return { errors, warns, total: logs.length };
  }, [logs]);

  // Memoize the reversed list so the map() doesn't re-spread the whole
  // buffer on every render — the panel also renders per-row elements so
  // this scales with total render work.
  const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

  const status: "healthy" | "warning" | "error" =
    stats.errors > 0 || showStuck ? "error" : stats.warns > 0 ? "warning" : "healthy";

  const handleReset = useCallback(() => {
    resetClient();
    recordBreadcrumb("reset", "Manual client reset → reloading");
    setShowStuck(false);
    setTimeout(() => window.location.reload(), 300);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatBreadcrumbsAsText({
      status,
      errors: String(stats.errors),
      warns: String(stats.warns),
      pending: String(pending),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied!");
    } catch {
      // Fallback: show inline so the user can select-copy manually.
      setCopyFeedback("Copy failed — long-press the log text");
    }
    setTimeout(() => setCopyFeedback(null), 2500);
  }, [stats, pending, status]);

  const handleClear = useCallback(() => {
    clearBreadcrumbs();
    recordBreadcrumb("lifecycle", "Log cleared");
  }, []);

  return (
    <>
      {/* Floating button — always visible with a live status dot so the
          user knows the recorder is working even when nothing is wrong. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        className={cn(
          "fixed bottom-28 left-3 md:bottom-6 md:left-6 z-40 w-11 h-11 rounded-full",
          "flex items-center justify-center shadow-lg active:scale-95 transition",
          status === "error"
            ? "bg-red-600 text-white animate-pulse"
            : status === "warning"
              ? "bg-amber-500 text-white"
              : "bg-black/60 text-white/90 backdrop-blur-sm",
        )}
      >
        <Bug className="w-5 h-5" />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-background",
            status === "error" && "bg-red-500",
            status === "warning" && "bg-amber-400",
            status === "healthy" && "bg-emerald-500",
          )}
        />
        {stats.errors > 0 && (
          <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center">
            {stats.errors > 9 ? "9+" : stats.errors}
          </span>
        )}
      </button>

      {/* Auto-surfaced banner when the client wedges. One-tap Reset +
          dismissable X so the user doesn't have to open the panel. */}
      {showStuck && !open && (
        <div className="fixed top-16 left-3 right-3 z-40 flex items-stretch gap-2 bg-red-600 text-white rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 pl-3 py-2 flex-1 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">App stuck</p>
              <p className="text-[11px] opacity-90 truncate">
                Request pending too long — reset to recover
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 active:scale-95 transition text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setShowStuck(false)}
            aria-label="Dismiss"
            className="px-2 flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl border border-border shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Bug className="w-5 h-5" />
                  Debug
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {stats.total} event{stats.total === 1 ? "" : "s"} · {stats.errors} error{stats.errors === 1 ? "" : "s"} · {pending} pending
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted/70 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* What's happening right now — the most useful thing when
                something "doesn't load" but nothing obviously errored. */}
            <div className="px-4 py-3 border-b border-border bg-muted/10 shrink-0 space-y-1.5 text-xs">
              <StatRow label="On page" value={getCurrentPath()} />
              <StatRow
                label="Status"
                value={
                  status === "healthy"
                    ? "🟢 healthy"
                    : status === "warning"
                      ? "🟠 warnings"
                      : "🔴 errors captured"
                }
              />
              <StatRow label="Requests in flight" value={String(pending)} />
            </div>

            {/* Primary actions */}
            <div className="flex gap-2 px-4 py-3 border-b border-border bg-red-500/5 shrink-0">
              <button
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm active:scale-[0.98] transition"
              >
                <RefreshCw className="w-4 h-4" />
                Reset app
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm active:scale-[0.98] transition"
              >
                <Copy className="w-4 h-4" />
                {copyFeedback ?? "Copy log"}
              </button>
            </div>

            {/* Breadcrumb timeline */}
            <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
              {reversedLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No activity captured yet. Navigate around the app and
                  come back.
                </p>
              ) : (
                reversedLogs.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "text-xs px-2.5 py-1.5 rounded-lg border",
                      KIND_CLASS[c.kind],
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="uppercase font-semibold text-[10px] tracking-wider shrink-0">
                        {c.kind}
                      </span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {new Date(c.time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      <span className="font-mono break-words min-w-0">
                        {c.message}
                        {c.count && c.count > 1 ? (
                          <span className="ml-1.5 text-muted-foreground">
                            ×{c.count}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {c.detail && (
                      <p className="font-mono text-[10px] text-muted-foreground mt-1 pl-2 break-words">
                        {c.detail}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Clear button — tucked at the bottom so it's not easy to
                tap by accident. */}
            <div className="px-3 py-2 border-t border-border bg-muted/20 shrink-0 flex justify-end">
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground rounded active:bg-muted/70 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear log
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-foreground truncate min-w-0">{value}</span>
    </div>
  );
}

function getCurrentPath(): string {
  if (typeof window === "undefined") return "(ssr)";
  return window.location.pathname + window.location.search;
}
