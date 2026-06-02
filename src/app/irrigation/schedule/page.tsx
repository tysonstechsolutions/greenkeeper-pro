"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets, Loader2, Save, Clock, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWateringPlan } from "@/lib/hooks/useWateringPlan";
import {
  surfaceRunMinutes,
  buildNightItems,
  generateSequence,
  itemsRunningAt,
  runsPastFinishBy,
  type WateringPlanConfig,
  type SurfaceConfig,
  type WateringSurface,
} from "@/lib/utils/watering-schedule";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SURFACE_META: Record<
  WateringSurface,
  { label: string; block: string; dot: string }
> = {
  green: { label: "Greens", block: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  tee: { label: "Tees", block: "bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  fairway: { label: "Fairways", block: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
};

function fmtClock(minOfDay: number): string {
  const m = ((Math.round(minOfDay) % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
}

function minuteToTimeInput(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeInputToMinute(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

export default function WateringSchedulePage() {
  const { plan, loading, error, savePlan } = useWateringPlan();
  const [config, setConfig] = useState<WateringPlanConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [previewDay, setPreviewDay] = useState<number>(0);
  const [nowMin, setNowMin] = useState<number | null>(null);

  // Sync local editable config when the loaded plan changes (derive editable
  // state from the fetched plan).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from fetched data
    if (plan) setConfig(plan.config);
  }, [plan]);

  // Tick the clock every minute for the "running now" view.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Default the preview to today, once, on mount (client-only date read).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client date post-hydration
    setPreviewDay(new Date().getDay());
  }, []);

  const dirty = useMemo(
    () => !!plan && !!config && JSON.stringify(plan.config) !== JSON.stringify(config),
    [plan, config],
  );

  const preview = useMemo(() => {
    if (!config) return null;
    const items = buildNightItems(config, previewDay);
    const { scheduled, makespan } = generateSequence(
      items,
      config.concurrencyCap,
      config.startMinute,
    );
    const overrun = runsPastFinishBy(config.startMinute, makespan, config.finishByMinute);
    return { items, scheduled, makespan, overrun };
  }, [config, previewDay]);

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  const updateSurface = (key: keyof Pick<WateringPlanConfig, "greens" | "tees" | "fairways">, patch: Partial<SurfaceConfig>) =>
    setConfig((c) => (c ? { ...c, [key]: { ...c[key], ...patch } } : c));

  const toggleDay = (key: "greens" | "tees" | "fairways", day: number) =>
    setConfig((c) => {
      if (!c) return c;
      const days = c[key].days.includes(day)
        ? c[key].days.filter((d) => d !== day)
        : [...c[key].days, day].sort((a, b) => a - b);
      return { ...c, [key]: { ...c[key], days } };
    });

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const ok = await savePlan(config);
    setSaving(false);
    if (ok) {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    }
  };

  // "Running now": only meaningful if the current clock falls inside the cycle.
  const runningNow = (() => {
    if (nowMin === null || !preview) return [];
    const nowAbs = nowMin < config.startMinute ? nowMin + 1440 : nowMin;
    return itemsRunningAt(preview.scheduled, nowAbs);
  })();

  const finishMin = config.startMinute + (preview?.makespan ?? 0);
  const surfaceRows: { key: "greens" | "tees" | "fairways"; surface: WateringSurface }[] = [
    { key: "greens", surface: "green" },
    { key: "tees", surface: "tee" },
    { key: "fairways", surface: "fairway" },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      <DetailPageHeader
        title="Watering Schedule"
        subtitle="Auto-staggered so no more than your pump limit run at once"
      />

      {/* Running now */}
      {runningNow.length > 0 && (
        <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 mb-1.5 flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5" /> Running now ({runningNow.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {runningNow.map((s) => (
              <span key={s.item.id} className="text-xs px-2 py-0.5 rounded-full bg-background border border-border">
                H{s.item.hole} {SURFACE_META[s.item.surface].label.replace(/s$/, "")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Setup */}
      <section className="rounded-xl border border-border bg-card p-4 mb-4">
        <h2 className="font-semibold text-sm mb-3">Per-surface settings</h2>
        <div className="space-y-4">
          {surfaceRows.map(({ key, surface }) => {
            const sc = config[key];
            const mins = surfaceRunMinutes(sc.depthIn, sc.rateInHr);
            return (
              <div key={key} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm flex items-center gap-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full", SURFACE_META[surface].dot)} />
                    {SURFACE_META[surface].label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-muted">
                    {mins} min / cycle
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <label className="text-xs text-muted-foreground">
                    Depth (in)
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min={0}
                      value={sc.depthIn}
                      onChange={(e) => updateSurface(key, { depthIn: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-base"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Rate (in/hr)
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min={0}
                      value={sc.rateInHr}
                      onChange={(e) => updateSurface(key, { rateInHr: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-base"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(key, i)}
                      aria-label={`${DAY_NAMES[i]} ${sc.days.includes(i) ? "on" : "off"}`}
                      aria-pressed={sc.days.includes(i)}
                      className={cn(
                        "flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors",
                        sc.days.includes(i)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Window + cap */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <label className="text-xs text-muted-foreground">
            Start
            <input
              type="time"
              value={minuteToTimeInput(config.startMinute)}
              onChange={(e) => setConfig((c) => (c ? { ...c, startMinute: timeInputToMinute(e.target.value) } : c))}
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-2 text-base"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Finish by
            <input
              type="time"
              value={config.finishByMinute === null ? "" : minuteToTimeInput(config.finishByMinute)}
              onChange={(e) =>
                setConfig((c) =>
                  c ? { ...c, finishByMinute: e.target.value ? timeInputToMinute(e.target.value) : null } : c,
                )
              }
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-2 text-base"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Max at once
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={config.concurrencyCap}
              onChange={(e) => setConfig((c) => (c ? { ...c, concurrencyCap: Math.max(1, parseInt(e.target.value, 10) || 1) } : c))}
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-base"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {dirty ? "Save schedule" : "Saved"}
          </Button>
          {savedMsg && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Minutes are calculated from depth ÷ rate. Run a catch-can test (set flat
          cans on a green, run 15 min, measure depth × 4 = your in/hr) and update
          the rate here to dial it in.
        </p>
      </section>

      {/* Preview */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Tonight&apos;s sequence</h2>
          <div className="flex items-center gap-1">
            {DAY_LABELS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPreviewDay(i)}
                className={cn(
                  "w-7 h-7 rounded-md text-xs font-semibold border transition-colors",
                  previewDay === i ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {preview && preview.scheduled.length > 0 ? (
          <>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg p-3 mb-3 text-sm",
                preview.overrun
                  ? "bg-red-500/10 text-red-700 dark:text-red-400"
                  : "bg-green-500/10 text-green-700 dark:text-green-400",
              )}
            >
              {preview.overrun ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              <span>
                {preview.scheduled.length} runs · starts {fmtClock(config.startMinute)} · done{" "}
                <strong>{fmtClock(finishMin)}</strong>
                {preview.overrun && config.finishByMinute !== null && (
                  <> — past your {fmtClock(config.finishByMinute)} cutoff</>
                )}
              </span>
            </div>

            {/* 5-lane Gantt */}
            <div className="space-y-1.5">
              {Array.from({ length: config.concurrencyCap }).map((_, lane) => {
                const laneItems = preview.scheduled
                  .filter((s) => s.lane === lane)
                  .sort((a, b) => a.startOffset - b.startOffset);
                if (laneItems.length === 0) return null;
                return (
                  <div key={lane} className="flex items-stretch gap-1 h-7">
                    <span className="w-6 shrink-0 text-[10px] text-muted-foreground flex items-center justify-center tabular-nums">
                      {lane + 1}
                    </span>
                    <div className="flex-1 flex items-stretch gap-0.5 overflow-hidden">
                      {laneItems.map((s) => (
                        <div
                          key={s.item.id}
                          title={`H${s.item.hole} ${SURFACE_META[s.item.surface].label} · ${fmtClock(s.startOffset)}–${fmtClock(s.endOffset)} (${s.item.minutes}m)`}
                          style={{ flexGrow: s.item.minutes, flexBasis: 0 }}
                          className={cn(
                            "min-w-0 rounded border px-1 flex items-center text-[10px] font-medium overflow-hidden whitespace-nowrap",
                            SURFACE_META[s.item.surface].block,
                          )}
                        >
                          H{s.item.hole}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
              {(Object.keys(SURFACE_META) as WateringSurface[]).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={cn("w-2.5 h-2.5 rounded-sm", SURFACE_META[s].dot)} />
                  {SURFACE_META[s].label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 opacity-40" />
            Nothing scheduled for {DAY_NAMES[previewDay]}. Enable a surface for this day above.
          </div>
        )}
      </section>
    </div>
  );
}
