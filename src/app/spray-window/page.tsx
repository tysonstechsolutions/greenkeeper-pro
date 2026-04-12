"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wind,
  CloudRain,
  Thermometer,
  Clock,
  CalendarPlus,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Droplets,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/hooks/useAuth";
import { RISK_LEVEL_CONFIG } from "@/lib/utils/disease-models";
import type { SprayWindow, HourlyForecast } from "@/lib/utils/spray-window";

interface SprayWindowResponse {
  disease_pressure: number;
  risk_level: keyof typeof RISK_LEVEL_CONFIG;
  windows: SprayWindow[];
  weather_source: "hourly" | "daily";
  forecast_hours?: HourlyForecast[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatChartTime(iso: string): string {
  const d = new Date(iso);
  const hour = d.getHours();
  if (hour === 0) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

export default function SprayWindowPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<SprayWindowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/spray-window");
        if (!res.ok) throw new Error("Failed to fetch spray window data");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Spray Window Optimizer" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Spray Window Optimizer" />
        <div className="gk-card p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error || "No data available"}</p>
        </div>
      </div>
    );
  }

  const riskConfig = RISK_LEVEL_CONFIG[data.risk_level] || RISK_LEVEL_CONFIG.low;

  // Prepare chart data (sample every 2 hours to avoid overcrowding)
  const chartData = (data.forecast_hours || [])
    .filter((_, i) => i % 2 === 0)
    .map((h) => ({
      time: formatChartTime(h.datetime),
      datetime: h.datetime,
      temp: Math.round(h.temp_f),
      wind: Math.round(h.wind_mph),
      rain: h.precip_chance,
    }));

  // Build schedule URL
  function scheduleUrl(w: SprayWindow): string {
    const startDate = w.start.split("T")[0];
    const title = encodeURIComponent(
      `Chemical application - ${formatDate(w.start)} ${formatTime(w.start)}`
    );
    const desc = encodeURIComponent(
      `Recommended spray window: ${formatTime(w.start)}-${formatTime(w.end)}. Disease pressure: ${w.risk_level}. ${w.reason}`
    );
    return `/tasks/new?title=${title}&due_date=${startDate}&description=${desc}`;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1200px] mx-auto">
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
      </div>

      <PageHeader
        title="Spray Window Optimizer"
        description="Smith-Kerns dollar spot model combined with 72-hour weather forecast to find optimal spray windows."
      />

      {data.weather_source === "daily" && (
        <div className="mb-4 p-3 rounded-xl border bg-amber-500/5 border-amber-500/15 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Using interpolated daily forecast data. Hourly forecasts may provide
            more precise spray windows.
          </span>
        </div>
      )}

      {/* ─── Disease Pressure Card ─── */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="gk-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Dollar Spot Pressure</h2>
              <p className="text-[11px] text-muted-foreground">Smith-Kerns model</p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold tracking-tight">
              {Math.round(data.disease_pressure * 100)}%
            </p>
            <Badge className={riskConfig.color}>{riskConfig.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Based on 5-day average temperature and humidity
          </p>
        </div>

        {/* Quick stats */}
        <div className="gk-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wind className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Best Window Wind
            </span>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            {data.windows[0]?.avg_wind_mph ?? "—"}
            <span className="text-sm font-normal text-muted-foreground ml-1">mph</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.windows[0] ? `${formatDate(data.windows[0].start)}` : "No windows found"}
          </p>
        </div>

        <div className="gk-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <CloudRain className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Best Window Rain
            </span>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            {data.windows[0]?.max_precip_chance ?? "—"}
            <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Max precipitation chance
          </p>
        </div>
      </div>

      {/* ─── Spray Windows ─── */}
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        Recommended Spray Windows
      </h2>
      {data.windows.length > 0 ? (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {data.windows.map((w, idx) => (
            <div
              key={idx}
              className="gk-card p-5 relative overflow-hidden"
            >
              {idx === 0 && (
                <div className="absolute top-2 right-2">
                  <Badge variant="default" className="text-[10px] bg-primary">
                    Best
                  </Badge>
                </div>
              )}
              <div className="mb-3">
                <p className="text-sm font-semibold">{formatDate(w.start)}</p>
                <p className="text-lg font-bold text-primary">
                  {formatTime(w.start)} - {formatTime(w.end)}
                </p>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5" /> Wind
                  </span>
                  <span className="font-medium">{w.avg_wind_mph} mph</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CloudRain className="w-3.5 h-3.5" /> Rain chance
                  </span>
                  <span className="font-medium">{w.max_precip_chance}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5" /> Score
                  </span>
                  <span className="font-medium">{(w.score * 100).toFixed(0)}%</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                {w.reason}
              </p>

              <Link href={scheduleUrl(w)}>
                <Button size="sm" variant="outline" className="w-full gap-1.5">
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Schedule Spray
                </Button>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="gk-card p-6 text-center mb-6">
          <CloudRain className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No good spray windows found in the next 72 hours.
          </p>
        </div>
      )}

      {/* ─── 72h Forecast Chart ─── */}
      {chartData.length > 0 && (
        <div className="gk-card p-5">
          <h2 className="font-semibold text-sm mb-4">72-Hour Forecast</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  className="text-muted-foreground"
                />
                <YAxis
                  yAxisId="temp"
                  tick={{ fontSize: 10 }}
                  domain={["auto", "auto"]}
                  className="text-muted-foreground"
                />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  domain={[0, 100]}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                  }}
                />
                {/* Highlight top window */}
                {data.windows[0] && (
                  <ReferenceArea
                    x1={formatChartTime(data.windows[0].start)}
                    x2={formatChartTime(data.windows[0].end)}
                    yAxisId="temp"
                    fill="#22c55e"
                    fillOpacity={0.1}
                    strokeOpacity={0}
                  />
                )}
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Temp (F)"
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="wind"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  name="Wind (mph)"
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="rain"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  name="Rain (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 rounded" /> Temperature
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-500 rounded" /> Wind
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-violet-500 rounded border-dashed" /> Rain chance
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-green-500/10 rounded border border-green-500/20" /> Best window
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
