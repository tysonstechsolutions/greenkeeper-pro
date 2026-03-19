"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWeather } from "@/lib/hooks/useWeather";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudSun,
  CloudFog,
  CloudLightning,
  Wind,
  Droplets,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

/**
 * Get weather icon based on condition text
 */
function getWeatherIcon(condition: string, className: string = "w-8 h-8") {
  const lowerCondition = condition.toLowerCase();

  if (lowerCondition.includes("thunder") || lowerCondition.includes("lightning")) {
    return <CloudLightning className={className} />;
  }
  if (lowerCondition.includes("snow") || lowerCondition.includes("sleet") || lowerCondition.includes("ice")) {
    return <CloudSnow className={className} />;
  }
  if (lowerCondition.includes("rain") || lowerCondition.includes("drizzle") || lowerCondition.includes("shower")) {
    return <CloudRain className={className} />;
  }
  if (lowerCondition.includes("fog") || lowerCondition.includes("mist") || lowerCondition.includes("haze")) {
    return <CloudFog className={className} />;
  }
  if (lowerCondition.includes("cloud") || lowerCondition.includes("overcast")) {
    if (lowerCondition.includes("partly") || lowerCondition.includes("partial")) {
      return <CloudSun className={className} />;
    }
    return <Cloud className={className} />;
  }
  if (lowerCondition.includes("sunny") || lowerCondition.includes("clear")) {
    return <Sun className={className} />;
  }

  return <CloudSun className={className} />;
}

interface WeatherWidgetProps {
  /** Additional class name */
  className?: string;
  /** Auto-refresh interval in minutes (default: 30) */
  refreshInterval?: number;
}

export function WeatherWidget({ className, refreshInterval = 30 }: WeatherWidgetProps) {
  const router = useRouter();
  const { currentWeather, forecast, getAlerts, loading, error, refetch } = useWeather();
  const alerts = getAlerts();

  // Auto-refresh weather data
  useEffect(() => {
    const intervalMs = refreshInterval * 60 * 1000;
    const interval = setInterval(() => {
      refetch();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [refreshInterval, refetch]);

  // Handle navigation to weather page
  const handleClick = () => {
    router.push("/weather");
  };

  // Loading state
  if (loading && !currentWeather) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="mt-4 flex gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error && !currentWeather) {
    return (
      <Card
        className={`cursor-pointer hover:bg-accent/50 transition-colors ${className}`}
        onClick={handleClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Weather unavailable</span>
            <ChevronRight className="w-4 h-4 ml-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentWeather) return null;

  // Get today's forecast for high/low
  const todayForecast = forecast?.[0];
  const hasAlerts = alerts && alerts.length > 0;

  return (
    <Card
      className={`cursor-pointer hover:bg-accent/50 transition-colors relative overflow-hidden ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label="View weather details"
    >
      {/* Alert indicator */}
      {hasAlerts && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500" />
          </span>
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          {/* Temperature and conditions */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">
                {Math.round(currentWeather.temp_f)}°
              </span>
              <span className="text-lg text-muted-foreground">F</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {currentWeather.conditions}
            </p>
          </div>

          {/* Weather icon */}
          <div className="text-muted-foreground">
            {getWeatherIcon(currentWeather.conditions, "w-12 h-12")}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          {/* High/Low */}
          {todayForecast && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-foreground font-medium">
                H:{Math.round(todayForecast.high_f)}°
              </span>
              <span>/</span>
              <span>L:{Math.round(todayForecast.low_f)}°</span>
            </div>
          )}

          {/* Wind */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wind className="w-4 h-4" />
            <span>{Math.round(currentWeather.wind_mph)} mph</span>
          </div>

          {/* Rain chance */}
          {todayForecast && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Droplets className="w-4 h-4" />
              <span>{todayForecast.precipitation_chance}%</span>
            </div>
          )}
        </div>

        {/* Alert summary */}
        {hasAlerts && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="text-muted-foreground">
                {alerts.length} active alert{alerts.length > 1 ? "s" : ""}
              </span>
              <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Subtle tap indicator when no alerts */}
        {!hasAlerts && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tap for details</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact inline weather display for headers or small spaces
 */
export function WeatherInline({ className }: { className?: string }) {
  const { currentWeather, getAlerts } = useWeather();
  const router = useRouter();

  if (!currentWeather) return null;

  const alerts = getAlerts();
  const hasAlerts = alerts && alerts.length > 0;

  return (
    <button
      onClick={() => router.push("/weather")}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors ${className}`}
      aria-label="View weather details"
    >
      {getWeatherIcon(currentWeather.conditions, "w-4 h-4")}
      <span className="font-medium">{Math.round(currentWeather.temp_f)}°F</span>
      {hasAlerts && (
        <span className="w-2 h-2 rounded-full bg-orange-500" />
      )}
    </button>
  );
}
