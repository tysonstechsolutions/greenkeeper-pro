"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  Snowflake,
  ChevronDown,
  RefreshCw,
  Download,
  TrendingUp,
  Calendar,
  Eye,
  Gauge,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  useWeather,
  GDD_MILESTONES,
  type WeatherAlert,
  type GDDData,
} from "@/lib/hooks/useWeather";
import { createClient } from "@/lib/supabase/client";
import type { WeatherLog } from "@/types/database";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Alert styles
const alertStyles: Record<
  WeatherAlert["type"],
  { bg: string; border: string; icon: typeof Snowflake; iconColor: string }
> = {
  frost: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: Snowflake,
    iconColor: "text-blue-600",
  },
  wind: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: Wind,
    iconColor: "text-orange-600",
  },
  rain: {
    bg: "bg-slate-50",
    border: "border-slate-300",
    icon: CloudRain,
    iconColor: "text-slate-600",
  },
  heat: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: Thermometer,
    iconColor: "text-red-600",
  },
  uv: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: Sun,
    iconColor: "text-amber-600",
  },
};

export default function WeatherPage() {
  const {
    currentWeather,
    forecast,
    loading,
    error,
    fetchCurrentWeather,
    fetchForecast,
    logDailyWeather,
    fetchGDDSeason,
    getAlerts,
  } = useWeather();

  const [gddData, setGddData] = useState<GDDData | null>(null);
  const [weatherLogs, setWeatherLogs] = useState<WeatherLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof WeatherLog>("log_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const currentYear = new Date().getFullYear();
  const today = todayLocal();

  const supabase = createClient();

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchCurrentWeather(), fetchForecast()]);
      const gdd = await fetchGDDSeason(currentYear);
      setGddData(gdd);
    };
    loadData();
  }, [fetchCurrentWeather, fetchForecast, fetchGDDSeason, currentYear]);

  // Fetch weather logs
  useEffect(() => {
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error: fetchError } = await supabase
          .from("weather_logs")
          .select("*")
          .gte("log_date", formatLocalDate(thirtyDaysAgo))
          .order("log_date", { ascending: false });

        if (fetchError) {
          console.error("Error fetching logs:", fetchError);
          return;
        }

        setWeatherLogs(data as WeatherLog[]);
      } catch (err) {
        console.error("Error fetching weather logs:", err);
      } finally {
        setLogsLoading(false);
      }
    };

    fetchLogs();
  }, [supabase]);

  // Refresh all data
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchCurrentWeather(),
        fetchForecast(),
        logDailyWeather(),
      ]);
      const gdd = await fetchGDDSeason(currentYear);
      setGddData(gdd);
    } finally {
      setRefreshing(false);
    }
  }, [fetchCurrentWeather, fetchForecast, logDailyWeather, fetchGDDSeason, currentYear]);

  // Export weather logs to CSV
  const exportToCSV = useCallback(() => {
    const headers = [
      "Date",
      "High (F)",
      "Low (F)",
      "Precipitation (in)",
      "Max Wind (mph)",
      "Avg Humidity (%)",
      "GDD",
      "Frost Observed",
      "Conditions",
    ];

    const rows = weatherLogs.map((log) => [
      log.log_date,
      log.high_temp_f || "",
      log.low_temp_f || "",
      log.precipitation_inches || 0,
      log.wind_max_mph || "",
      log.humidity_avg || "",
      log.gdd_base50 || 0,
      log.frost_observed ? "Yes" : "No",
      log.conditions || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weather-logs-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [weatherLogs, today]);

  // Sort logs
  const sortedLogs = [...weatherLogs].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  const handleSort = (column: keyof WeatherLog) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const alerts = getAlerts();

  // Loading state
  if (loading && !currentWeather) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Weather Center"
          description="Naval Station Great Lakes, IL"
          icon={Cloud}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-1 text-red-500">
            Check that the get-weather edge function is deployed and the WEATHER_API_KEY secret is set on Supabase.
          </p>
        </div>
      )}

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert, idx) => {
            const style = alertStyles[alert.type];
            const Icon = style.icon;
            const isExpanded = expandedAlert === `${alert.type}-${idx}`;

            return (
              <div
                key={`${alert.type}-${idx}`}
                className={`${style.bg} border ${style.border} rounded-lg overflow-hidden`}
              >
                <button
                  onClick={() =>
                    setExpandedAlert(isExpanded ? null : `${alert.type}-${idx}`)
                  }
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}
                    >
                      <Icon className={`w-5 h-5 ${style.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{alert.title}</p>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-dashed border-gray-200">
                    <p className="text-sm text-gray-700 mt-3">
                      <span className="font-medium">Recommendation:</span>{" "}
                      {alert.recommendation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Current Conditions Card */}
      {currentWeather && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Temperature Display */}
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentWeather.icon_url}
                alt={currentWeather.conditions}
                className="w-20 h-20"
              />
              <div>
                <p className="text-5xl font-bold">{currentWeather.temp_f}°</p>
                <p className="text-lg text-muted-foreground">
                  {currentWeather.conditions}
                </p>
              </div>
            </div>

            {/* Detailed Stats */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Feels Like</p>
                  <p className="font-semibold">{currentWeather.feels_like_f}°F</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Humidity</p>
                  <p className="font-semibold">{currentWeather.humidity}%</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Wind className="w-5 h-5 text-cyan-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Wind</p>
                  <p className="font-semibold">
                    {currentWeather.wind_mph} mph {currentWeather.wind_direction}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-slate-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Rain Chance</p>
                  <p className="font-semibold">
                    {currentWeather.precipitation_chance}%
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-xs text-muted-foreground">UV Index</p>
                  <p className="font-semibold">{currentWeather.uv_index}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Pressure</p>
                  <p className="font-semibold">{currentWeather.pressure_in} in</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Visibility</p>
                  <p className="font-semibold">
                    {currentWeather.visibility_miles} mi
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Cloud Cover</p>
                  <p className="font-semibold">{currentWeather.cloud_cover}%</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Last updated: {new Date(currentWeather.last_updated).toLocaleString()}
          </p>
        </div>
      )}

      {/* 7-Day Forecast */}
      {forecast.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            7-Day Forecast
          </h2>

          <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
            {forecast.map((day, idx) => (
              <div
                key={day.date}
                className={`flex-shrink-0 w-28 p-3 rounded-lg border text-center ${
                  idx === 0
                    ? "bg-primary/5 border-primary"
                    : "bg-muted/50 border-border"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    idx === 0 ? "text-primary" : ""
                  }`}
                >
                  {idx === 0 ? "Today" : day.day_name}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={day.icon_url}
                  alt={day.conditions}
                  className="w-12 h-12 mx-auto"
                />
                <div className="flex items-center justify-center gap-1 text-sm">
                  <span className="font-semibold">{day.high_f}°</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{day.low_f}°</span>
                </div>
                <div className="flex items-center justify-center gap-1 mt-1 text-xs text-muted-foreground">
                  <CloudRain className="w-3 h-3" />
                  <span>{day.precipitation_chance}%</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Wind className="w-3 h-3" />
                  <span>{day.wind_mph} mph</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growing Degree Days Section */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Growing Degree Days ({currentYear})
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Season Total */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-4xl font-bold text-primary">
              {gddData?.seasonTotal.toLocaleString() || 0}
            </p>
            <p className="text-sm text-muted-foreground">Season Total GDD</p>
            <p className="text-xs text-muted-foreground mt-1">Base 50°F</p>
          </div>

          {/* Milestones */}
          <div className="md:col-span-2 space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Key Milestones
            </p>
            {GDD_MILESTONES.map((milestone) => {
              const reached = (gddData?.seasonTotal || 0) >= milestone.gdd;
              return (
                <div
                  key={milestone.gdd}
                  className={`flex items-center justify-between p-2 rounded ${
                    reached ? "bg-muted/50" : "bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        reached ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        reached ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {milestone.label}
                    </span>
                  </div>
                  <span
                    className="text-sm font-mono"
                    style={{ color: milestone.color }}
                  >
                    {milestone.gdd} GDD
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* GDD Chart */}
        {gddData && gddData.dailyData.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Cumulative GDD Over Season
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gddData.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                          <p className="text-sm font-medium">
                            {new Date(data.date + "T12:00:00").toLocaleDateString(
                              "en-US",
                              { month: "long", day: "numeric" }
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Daily: {data.gdd} GDD
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            Cumulative: {data.cumulative} GDD
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  {/* Milestone reference lines */}
                  {GDD_MILESTONES.slice(0, 3).map((milestone) => (
                    <ReferenceLine
                      key={milestone.gdd}
                      y={milestone.gdd}
                      stroke={milestone.color}
                      strokeDasharray="5 5"
                      label={{
                        value: `${milestone.gdd}`,
                        position: "right",
                        fontSize: 10,
                        fill: milestone.color,
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Monthly Breakdown */}
        {gddData && gddData.monthlyTotals.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Monthly Breakdown
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium">Month</th>
                    <th className="text-right py-2 px-3 font-medium">GDD</th>
                    <th className="text-right py-2 px-3 font-medium">
                      Cumulative
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gddData.monthlyTotals.map((month) => (
                    <tr key={month.month} className="border-b border-border/50">
                      <td className="py-2 px-3">{month.month}</td>
                      <td className="text-right py-2 px-3 font-mono">
                        {month.gdd.toFixed(1)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-primary">
                        {month.cumulative.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Weather Log Table */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Weather Log (Last 30 Days)
          </h2>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : weatherLogs.length === 0 ? (
          <div className="text-center py-12">
            <Cloud className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No weather logs recorded yet.</p>
            <p className="text-sm text-muted-foreground">
              Click &quot;Refresh&quot; to log today&apos;s weather.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    className="text-left py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("log_date")}
                  >
                    <div className="flex items-center gap-1">
                      Date
                      {sortColumn === "log_date" &&
                        (sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </div>
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("high_temp_f")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      High
                      {sortColumn === "high_temp_f" &&
                        (sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </div>
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("low_temp_f")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Low
                      {sortColumn === "low_temp_f" &&
                        (sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </div>
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("precipitation_inches")}
                  >
                    Precip
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("wind_max_mph")}
                  >
                    Wind
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("humidity_avg")}
                  >
                    Humidity
                  </th>
                  <th
                    className="text-center py-3 px-2 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("gdd_base50")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      GDD
                      {sortColumn === "gdd_base50" &&
                        (sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 font-medium">Frost</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={`border-b border-border/50 hover:bg-muted/30 ${
                      log.log_date === today ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="py-2 px-2">
                      {new Date(log.log_date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", weekday: "short" }
                      )}
                    </td>
                    <td className="text-center py-2 px-2 font-mono">
                      {log.high_temp_f ? `${log.high_temp_f}°` : "-"}
                    </td>
                    <td className="text-center py-2 px-2 font-mono">
                      {log.low_temp_f ? `${log.low_temp_f}°` : "-"}
                    </td>
                    <td className="text-center py-2 px-2 font-mono">
                      {log.precipitation_inches
                        ? `${log.precipitation_inches}"`
                        : "-"}
                    </td>
                    <td className="text-center py-2 px-2 font-mono">
                      {log.wind_max_mph ? `${log.wind_max_mph}` : "-"}
                    </td>
                    <td className="text-center py-2 px-2 font-mono">
                      {log.humidity_avg ? `${log.humidity_avg}%` : "-"}
                    </td>
                    <td className="text-center py-2 px-2 font-mono text-primary">
                      {log.gdd_base50 ?? "-"}
                    </td>
                    <td className="text-center py-2 px-2">
                      {log.frost_observed ? (
                        <Snowflake className="w-4 h-4 text-blue-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
