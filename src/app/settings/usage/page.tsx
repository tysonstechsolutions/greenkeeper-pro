"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/hooks/useAuth";
import { directDeleteByFilter, directSelectAll } from "@/lib/supabase/rest";
import { isUsageTrackingEnabled, setUsageTrackingEnabled } from "@/lib/usage/track";

interface UsageRow {
  event_kind: string;
  route: string;
  label: string | null;
  duration_ms: number | null;
  occurred_at: string;
}

interface RouteSummary {
  route: string;
  views: number;
  actions: number;
  slow: number;
  avgMs: number | null;
  worstMs: number | null;
  lastSeen: string;
}

/**
 * What the app has recorded about its own use, shown plainly.
 *
 * Tracking is only defensible if the person being tracked can see exactly what
 * was captured, and switch it off. Both live here.
 */
export default function UsageReviewPage() {
  const { isManager } = useAuth();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tracking, setTracking] = useState(true);

  useEffect(() => { setTracking(isUsageTrackingEnabled()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await directSelectAll<UsageRow>("usage_events", {
          columns: "event_kind,route,label,duration_ms,occurred_at",
          orderBy: [{ column: "occurred_at", ascending: false }, { column: "id" }],
          label: "usage.review",
        });
        if (!cancelled) setRows(data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load usage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  const byRoute = useMemo<RouteSummary[]>(() => {
    const map = new Map<string, { views: number; actions: number; slow: number; durations: number[]; lastSeen: string }>();
    for (const row of rows) {
      const entry = map.get(row.route) ?? { views: 0, actions: 0, slow: 0, durations: [], lastSeen: row.occurred_at };
      if (row.event_kind === "view") entry.views += 1;
      else if (row.event_kind === "action") entry.actions += 1;
      else if (row.event_kind === "slow") entry.slow += 1;
      if (row.duration_ms !== null) entry.durations.push(row.duration_ms);
      if (row.occurred_at > entry.lastSeen) entry.lastSeen = row.occurred_at;
      map.set(row.route, entry);
    }
    return [...map.entries()]
      .map(([route, e]) => ({
        route,
        views: e.views,
        actions: e.actions,
        slow: e.slow,
        avgMs: e.durations.length ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.durations.length) : null,
        worstMs: e.durations.length ? Math.max(...e.durations) : null,
        lastSeen: e.lastSeen,
      }))
      .sort((a, b) => (b.views + b.actions) - (a.views + a.actions) || a.route.localeCompare(b.route));
  }, [rows]);

  const topActions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.event_kind !== "action" || !row.label) continue;
      counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      await directDeleteByFilter("usage_events", ["id=gt.0"], "usage.clear");
      setNonce((n) => n + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't clear usage.");
    }
  }, []);

  if (!isManager) {
    return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">Manager access only.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-3 pb-28 pt-4 sm:px-5 md:pb-8">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Settings
      </Link>

      <PageHeader
        title="How you use the app"
        description="Recorded so the app can be improved from real days instead of guesses."
      />

      <div className="mb-4 rounded-xl border border-border bg-card p-3 text-sm">
        <p className="font-medium">What is recorded</p>
        <p className="mt-1 text-muted-foreground">
          Which screen you opened, how long it took to become useful, and the name of any
          action you pressed — from a fixed list the app defines. Nothing you type is ever
          recorded: no task titles, no notes, no names, no search terms. It stays in your own
          database and goes nowhere else.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant={tracking ? "outline" : "default"}
            size="sm"
            onClick={() => { setUsageTrackingEnabled(!tracking); setTracking(!tracking); }}
          >
            {tracking ? "Turn recording off" : "Turn recording on"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className={loading ? "animate-spin" : ""} />Refresh
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={clearAll}>
            <Trash2 />Delete everything recorded
          </Button>
          <span className="text-xs text-muted-foreground">
            {tracking ? "Recording is on." : "Recording is off on this device."}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing recorded yet. Use the app for a few days and this fills in.
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{rows.length} events recorded.</p>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide">Screens, most used first</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Screen</th>
                    <th className="py-2 pr-3 text-right font-semibold">Opened</th>
                    <th className="py-2 pr-3 text-right font-semibold">Actions</th>
                    <th className="py-2 pr-3 text-right font-semibold">Avg load</th>
                    <th className="py-2 pr-3 text-right font-semibold">Worst</th>
                    <th className="py-2 text-right font-semibold">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {byRoute.map((row) => (
                    <tr key={row.route} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">
                        {row.route}
                        {row.slow > 0 && (
                          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                            slow {row.slow}x
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.views}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.actions || ""}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.avgMs !== null ? `${row.avgMs} ms` : "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.worstMs !== null ? `${row.worstMs} ms` : "—"}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">{row.lastSeen.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {topActions.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide">Actions you use</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {topActions.map(([label, count]) => (
                  <li key={label} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
                    {label.replaceAll("_", " ")} <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
