"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Users,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { directSelectList } from "@/lib/supabase/rest";
import type { OneOnOneSession } from "@/lib/oneonone/types";
import {
  buildInsightsPayload,
  snapshotDataPoints,
} from "@/lib/oneonone/insights";
import { generateInsights, type InsightsResult } from "@/lib/oneonone/ai";

interface ProfileLite {
  id: string;
  full_name: string | null;
  role: string | null;
}
interface ConcernLite {
  employee_id: string;
  title: string;
  status: string;
}

const PERIODS: { label: string; days: number | null }[] = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
];

function cutoff(days: number | null): string | null {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function OneOnOneInsightsPage() {
  const [sessions, setSessions] = useState<OneOnOneSession[]>([]);
  const [concerns, setConcerns] = useState<ConcernLite[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [periodIdx, setPeriodIdx] = useState(1); // default 60 days

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sess, cons, profs] = await Promise.all([
          directSelectList<OneOnOneSession>("staff_one_on_one_sessions", {
            filters: ["status=eq.completed"],
            orderBy: [{ column: "session_date", ascending: false }],
            label: "insights.sessions",
          }),
          directSelectList<ConcernLite>("staff_concerns", {
            filters: ["status=eq.open"],
            label: "insights.concerns",
          }),
          directSelectList<ProfileLite>("profiles", {
            columns: "id,full_name,role",
            label: "insights.profiles",
          }),
        ]);
        if (cancelled) return;
        setSessions(sess);
        setConcerns(cons);
        setProfiles(profs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load 1:1 data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const period = PERIODS[periodIdx];
  const payload = useMemo(
    () =>
      buildInsightsPayload(
        sessions,
        concerns,
        profiles,
        cutoff(period.days),
        `the last ${period.label.toLowerCase()}`,
      ),
    [sessions, concerns, profiles, period],
  );
  const dataPoints = snapshotDataPoints(payload);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateInsights(payload);
      setResult(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Couldn't generate the report: ${e.message}`
          : "Couldn't generate the report.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-[#1B4332] dark:text-emerald-400" />
        <h1 className="text-lg font-semibold">1:1 Insights</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Reads across everyone&apos;s recent 1:1s and open follow-ups to surface
        common themes — pay, friction, workload, equipment — so patterns don&apos;t
        hide in individual conversations. Grounded strictly in what your crew
        actually said.
      </p>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(i)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
              i === periodIdx
                ? "bg-[#1B4332] text-white border-[#1B4332]"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loadingData ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading 1:1 history…
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4" />
              {payload.employees.length} employee
              {payload.employees.length === 1 ? "" : "s"} · {dataPoints} data points
            </span>
          </div>
          {dataPoints === 0 ? (
            <p className="text-sm text-muted-foreground">
              No 1:1 answers or open follow-ups in this window yet. Run a 1:1 from
              a{" "}
              <Link href="/staff" className="underline">
                staff member&apos;s page
              </Link>{" "}
              first.
            </p>
          ) : (
            <Button
              className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]"
              disabled={generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading the 1:1s…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate report
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-sm">{result.summary}</p>
            </div>
          )}

          {result.themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clear cross-crew themes surfaced from this window.
            </p>
          ) : (
            result.themes.map((t, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm">{t.theme}</h2>
                  <span className="text-[11px] font-semibold rounded-full bg-[#1B4332]/10 text-[#1B4332] dark:text-emerald-400 px-2 py-0.5">
                    {t.count} {t.count === 1 ? "person" : "people"}
                  </span>
                </div>
                {t.employees.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t.employees.join(", ")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{t.detail}</p>
                {t.suggested_action && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-muted/40 p-2">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs">{t.suggested_action}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
