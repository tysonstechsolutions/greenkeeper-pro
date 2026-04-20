"use client";

import { useCallback, useEffect, useState } from "react";
import { Bug, X, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseTelemetry, resetClient } from "@/lib/supabase/client";

interface LogEntry {
  time: number;
  kind: "error" | "rejection" | "reset" | "timeout";
  message: string;
  source?: string;
}

// Capped ring buffer of recent errors/diagnostics. Module-level so the
// overlay can rehydrate from anywhere in the app.
const MAX_LOGS = 50;
const logBuffer: LogEntry[] = [];

function pushLog(entry: LogEntry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("debug-overlay:update"));
  }
}

/**
 * Floating debug button + overlay for diagnosing "nothing loads" bugs
 * inside the Capacitor APK, where there is no browser devtools to attach.
 *
 * - Bottom-left bug icon, badge shows error count.
 * - Tap → panel with recent errors, pending Supabase requests, and a
 *   Reset button that rebuilds the Supabase client without killing the
 *   app. Also reloads the current route.
 * - Listens for global window errors, unhandledrejection, and the
 *   `supabase:reset-needed` custom event our client dispatches when it
 *   detects too many consecutive fetch timeouts.
 */
export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => [...logBuffer]);
  const [pending, setPending] = useState(0);
  const [showStuck, setShowStuck] = useState(false);

  // Capture global errors and promise rejections.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      pushLog({
        time: Date.now(),
        kind: "error",
        message: e.message || "Unknown error",
        source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : typeof reason === "string"
            ? reason
            : JSON.stringify(reason).slice(0, 200);
      pushLog({
        time: Date.now(),
        kind: "rejection",
        message: msg,
      });
    };
    const onStuck = () => {
      pushLog({
        time: Date.now(),
        kind: "timeout",
        message: "Supabase client looks stuck — 3+ consecutive request timeouts",
      });
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

  // Re-render when buffer changes.
  useEffect(() => {
    const onUpdate = () => setLogs([...logBuffer]);
    window.addEventListener("debug-overlay:update", onUpdate);
    return () => window.removeEventListener("debug-overlay:update", onUpdate);
  }, []);

  // Poll pending-request count from Supabase telemetry. Light: 1 Hz.
  useEffect(() => {
    const id = setInterval(() => {
      setPending(getSupabaseTelemetry().pending);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleReset = useCallback(() => {
    resetClient();
    pushLog({
      time: Date.now(),
      kind: "reset",
      message: "Supabase client reset — reloading route",
    });
    setShowStuck(false);
    // Hard-reload the current path so every hook re-initializes with the
    // fresh client. Uses window.location instead of router.refresh because
    // refresh() relies on the same Supabase session that might be wedged.
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }, []);

  const errorCount = logs.filter(
    (l) => l.kind === "error" || l.kind === "rejection" || l.kind === "timeout",
  ).length;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        className={cn(
          "fixed bottom-24 left-3 md:bottom-6 md:left-6 z-40 w-11 h-11 rounded-full",
          "flex items-center justify-center shadow-lg active:scale-95 transition",
          errorCount > 0 || showStuck
            ? "bg-red-600 text-white animate-pulse"
            : "bg-black/60 text-white/80 backdrop-blur-sm",
        )}
      >
        <Bug className="w-5 h-5" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center">
            {errorCount > 9 ? "9+" : errorCount}
          </span>
        )}
      </button>

      {/* Stuck banner — auto-surfaces when client wedges */}
      {showStuck && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed top-16 left-3 right-3 z-40 flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg shadow-lg active:scale-[0.98] transition"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium flex-1 text-left truncate">
            App looks stuck — tap to see details
          </span>
        </button>
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Bug className="w-5 h-5" />
                  Debug
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {errorCount} errors · {pending} request{pending === 1 ? "" : "s"} in flight
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full active:bg-muted/70 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reset button — most important action */}
            <div className="px-4 py-3 border-b border-border bg-red-500/5 shrink-0">
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg font-semibold active:scale-[0.98] transition"
              >
                <RefreshCw className="w-4 h-4" />
                Reset app state
              </button>
              <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                Rebuilds the Supabase connection and reloads the page.
                Use this when nothing loads — don&apos;t kill the app.
              </p>
            </div>

            {/* Log list */}
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No errors captured this session.
                </p>
              ) : (
                [...logs].reverse().map((log, i) => (
                  <div
                    key={`${log.time}-${i}`}
                    className={cn(
                      "text-xs p-2.5 rounded-lg border",
                      log.kind === "error" && "border-red-500/30 bg-red-500/5",
                      log.kind === "rejection" && "border-orange-500/30 bg-orange-500/5",
                      log.kind === "timeout" && "border-amber-500/30 bg-amber-500/5",
                      log.kind === "reset" && "border-blue-500/30 bg-blue-500/5",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="uppercase font-semibold text-[10px] tracking-wider">
                        {log.kind}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(log.time).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-mono break-all">{log.message}</p>
                    {log.source && (
                      <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all">
                        {log.source}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
