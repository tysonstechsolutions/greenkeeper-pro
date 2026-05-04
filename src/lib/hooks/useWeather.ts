"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callApi } from "@/lib/api/client";
import { COURSE } from "@/lib/constants";
import type { WeatherLog } from "@/types/database";

/**
 * Weather API Configuration
 *
 * The browser does NOT call WeatherAPI.com directly. Calls are proxied
 * through the `get-weather` Supabase Edge Function. This:
 *   - Hides the API key from the client bundle
 *   - Avoids "TypeError: Failed to fetch" caused by browser extensions,
 *     ad/privacy blockers, or networks that block third-party domains
 *   - Works in the Capacitor build, which has no Next.js server
 *
 * Deploy:
 *   1. Sign up at https://www.weatherapi.com/ (free tier: 1M calls/month).
 *   2. supabase secrets set WEATHER_API_KEY=<your_key>
 *   3. supabase functions deploy get-weather
 */

// Sourced from shared constants — used for display labels only.
const LOCATION_NAME = `${COURSE.name}, ${COURSE.location}`;

interface WeatherApiCurrent {
  temp_f: number;
  feelslike_f: number;
  humidity: number;
  wind_mph: number;
  wind_dir: string;
  condition: { text: string; icon: string };
  uv: number;
  pressure_in: number;
  vis_miles: number;
  cloud: number;
  is_day: number;
  last_updated: string;
}

interface WeatherApiForecastDay {
  date: string;
  day: {
    maxtemp_f: number;
    mintemp_f: number;
    condition: { text: string; icon: string };
    daily_chance_of_rain: number;
    maxwind_mph: number;
    avghumidity: number;
    uv: number;
    totalprecip_in?: number;
  };
  astro: { sunrise: string; sunset: string };
}

interface WeatherApiResponse {
  current: WeatherApiCurrent;
  forecast: { forecastday: WeatherApiForecastDay[] };
}

// Types
export interface CurrentWeather {
  temp_f: number;
  feels_like_f: number;
  humidity: number;
  wind_mph: number;
  wind_direction: string;
  conditions: string;
  icon_url: string;
  precipitation_chance: number;
  uv_index: number;
  pressure_in: number;
  visibility_miles: number;
  cloud_cover: number;
  is_day: boolean;
  last_updated: string;
}

export interface ForecastDay {
  date: string;
  day_name: string;
  high_f: number;
  low_f: number;
  conditions: string;
  icon_url: string;
  precipitation_chance: number;
  wind_mph: number;
  humidity: number;
  uv_index: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherAlert {
  type: "frost" | "wind" | "rain" | "heat" | "uv";
  severity: "warning" | "caution" | "info";
  title: string;
  message: string;
  recommendation: string;
}

export interface GDDData {
  seasonTotal: number;
  monthlyTotals: { month: string; gdd: number; cumulative: number }[];
  dailyData: { date: string; gdd: number; cumulative: number }[];
}

interface UseWeatherReturn {
  currentWeather: CurrentWeather | null;
  forecast: ForecastDay[];
  todayLog: WeatherLog | null;
  loading: boolean;
  error: string | null;
  fetchCurrentWeather: () => Promise<CurrentWeather | null>;
  fetchForecast: () => Promise<ForecastDay[]>;
  fetchWeatherLog: (date: string) => Promise<WeatherLog | null>;
  logDailyWeather: () => Promise<WeatherLog | null>;
  calculateGDD: (high: number, low: number, baseTemp?: number) => number;
  fetchGDDSeason: (year: number) => Promise<GDDData>;
  getAlerts: () => WeatherAlert[];
  refetch: () => Promise<void>;
}

export function useWeather(): UseWeatherReturn {
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [todayLog, setTodayLog] = useState<WeatherLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  /**
   * Fetch current weather conditions
   */
  const fetchCurrentWeather = useCallback(async (): Promise<CurrentWeather | null> => {
    setLoading(true);
    setError(null);

    try {
      const data = await callApi<WeatherApiResponse>("get-weather", {
        method: "GET",
        query: { days: 1 },
      });

      const current = data.current;
      const todayForecast = data.forecast?.forecastday?.[0]?.day;

      const weather: CurrentWeather = {
        temp_f: Math.round(current.temp_f),
        feels_like_f: Math.round(current.feelslike_f),
        humidity: current.humidity,
        wind_mph: Math.round(current.wind_mph),
        wind_direction: current.wind_dir,
        conditions: current.condition.text,
        icon_url: `https:${current.condition.icon}`,
        precipitation_chance: todayForecast?.daily_chance_of_rain || 0,
        uv_index: current.uv,
        pressure_in: current.pressure_in,
        visibility_miles: current.vis_miles,
        cloud_cover: current.cloud,
        is_day: current.is_day === 1,
        last_updated: current.last_updated,
      };

      setCurrentWeather(weather);
      return weather;
    } catch (err) {
      console.error("Error fetching current weather:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch weather");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch current weather on mount (so header widget gets data immediately)
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchCurrentWeather();
    }
  }, [fetchCurrentWeather]);

  /**
   * Fetch 7-day forecast
   */
  const fetchForecast = useCallback(async (): Promise<ForecastDay[]> => {
    setLoading(true);
    setError(null);

    try {
      const data = await callApi<WeatherApiResponse>("get-weather", {
        method: "GET",
        query: { days: 7 },
      });

      const forecastDays: ForecastDay[] = data.forecast.forecastday.map(
        (day: WeatherApiForecastDay) => {
          const date = new Date(day.date + "T12:00:00");
          return {
            date: day.date,
            day_name: date.toLocaleDateString("en-US", { weekday: "short" }),
            high_f: Math.round(day.day.maxtemp_f),
            low_f: Math.round(day.day.mintemp_f),
            conditions: day.day.condition.text,
            icon_url: `https:${day.day.condition.icon}`,
            precipitation_chance: day.day.daily_chance_of_rain,
            wind_mph: Math.round(day.day.maxwind_mph),
            humidity: day.day.avghumidity,
            uv_index: day.day.uv,
            sunrise: day.astro.sunrise,
            sunset: day.astro.sunset,
          };
        }
      );

      setForecast(forecastDays);
      return forecastDays;
    } catch (err) {
      console.error("Error fetching forecast:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch forecast");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch weather log for a specific date from database
   */
  const fetchWeatherLog = useCallback(
    async (date: string): Promise<WeatherLog | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("weather_logs")
          .select("*")
          .eq("log_date", date)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          console.error("Error fetching weather log:", fetchError);
          return null;
        }

        if (date === new Date().toISOString().split("T")[0]) {
          setTodayLog(data as WeatherLog | null);
        }

        return data as WeatherLog | null;
      } catch (err) {
        console.error("Unexpected error fetching weather log:", err);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Calculate Growing Degree Days
   * GDD = ((High + Low) / 2) - Base Temperature
   * Minimum value is 0
   */
  const calculateGDD = useCallback(
    (high: number, low: number, baseTemp: number = 50): number => {
      const avgTemp = (high + low) / 2;
      const gdd = avgTemp - baseTemp;
      return Math.max(0, Math.round(gdd * 10) / 10);
    },
    []
  );

  /**
   * Log today's weather to the database
   */
  const logDailyWeather = useCallback(async (): Promise<WeatherLog | null> => {
    try {
      // Fetch current conditions and today's forecast
      const data = await callApi<WeatherApiResponse>("get-weather", {
        method: "GET",
        query: { days: 1 },
      });

      const current = data.current;
      const todayForecast = data.forecast.forecastday[0].day;
      const today = new Date().toISOString().split("T")[0];

      const high = Math.round(todayForecast.maxtemp_f);
      const low = Math.round(todayForecast.mintemp_f);
      const gdd = calculateGDD(high, low);
      const frostObserved = low <= 32;

      const logData = {
        log_date: today,
        high_temp_f: high,
        low_temp_f: low,
        precipitation_inches: todayForecast.totalprecip_in || 0,
        wind_max_mph: Math.round(todayForecast.maxwind_mph),
        humidity_avg: todayForecast.avghumidity,
        conditions: todayForecast.condition.text,
        gdd_base50: gdd,
        frost_observed: frostObserved,
        raw_data: {
          current,
          forecast: todayForecast,
          location: { lat: COURSE.lat, lng: COURSE.lng, name: LOCATION_NAME },
        },
      };

      // Upsert (insert or update) the weather log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upsertedData, error: upsertError } = await (supabase as any)
        .from("weather_logs")
        .upsert(logData, { onConflict: "log_date" })
        .select()
        .single() as { data: WeatherLog | null; error: Error | null };

      if (upsertError) {
        console.error("Error logging weather:", upsertError);
        setError(upsertError.message);
        return null;
      }

      setTodayLog(upsertedData);
      return upsertedData;
    } catch (err) {
      console.error("Error logging daily weather:", err);
      setError(err instanceof Error ? err.message : "Failed to log weather");
      return null;
    }
  }, [supabase, calculateGDD]);

  /**
   * Fetch GDD data for an entire season/year
   */
  const fetchGDDSeason = useCallback(
    async (year: number): Promise<GDDData> => {
      const emptyData: GDDData = {
        seasonTotal: 0,
        monthlyTotals: [],
        dailyData: [],
      };

      try {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        type GDDLogResult = { log_date: string; gdd_base50: number | null };
        const { data, error: fetchError } = await supabase
          .from("weather_logs")
          .select("log_date, gdd_base50")
          .gte("log_date", startDate)
          .lte("log_date", endDate)
          .order("log_date", { ascending: true }) as { data: GDDLogResult[] | null; error: Error | null };

        if (fetchError) {
          console.error("Error fetching GDD season:", fetchError);
          return emptyData;
        }

        if (!data || data.length === 0) {
          return emptyData;
        }

        // Calculate cumulative GDD
        let cumulative = 0;
        const dailyData = data.map((log) => {
          const gdd = log.gdd_base50 || 0;
          cumulative += gdd;
          return {
            date: log.log_date,
            gdd,
            cumulative: Math.round(cumulative * 10) / 10,
          };
        });

        // Group by month
        const monthlyMap = new Map<string, number>();
        const monthNames = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];

        data.forEach((log) => {
          const monthIndex = new Date(log.log_date + "T12:00:00").getMonth();
          const monthName = monthNames[monthIndex];
          const current = monthlyMap.get(monthName) || 0;
          monthlyMap.set(monthName, current + (log.gdd_base50 || 0));
        });

        let monthCumulative = 0;
        const monthlyTotals = monthNames
          .filter((month) => monthlyMap.has(month))
          .map((month) => {
            const gdd = Math.round((monthlyMap.get(month) || 0) * 10) / 10;
            monthCumulative += gdd;
            return {
              month,
              gdd,
              cumulative: Math.round(monthCumulative * 10) / 10,
            };
          });

        return {
          seasonTotal: Math.round(cumulative * 10) / 10,
          monthlyTotals,
          dailyData,
        };
      } catch (err) {
        console.error("Unexpected error fetching GDD season:", err);
        return emptyData;
      }
    },
    [supabase]
  );

  /**
   * Get active weather alerts based on current conditions and forecast
   */
  const getAlerts = useCallback((): WeatherAlert[] => {
    const alerts: WeatherAlert[] = [];

    if (!currentWeather && forecast.length === 0) {
      return alerts;
    }

    const today = forecast[0];
    const tonight = forecast[0];

    // Frost alert - tonight's low < 36°F
    if (tonight && tonight.low_f < 36) {
      alerts.push({
        type: "frost",
        severity: tonight.low_f <= 32 ? "warning" : "caution",
        title: tonight.low_f <= 32 ? "Frost Warning" : "Frost Advisory",
        message: `Tonight's low: ${tonight.low_f}°F. ${
          tonight.low_f <= 32 ? "Freezing temperatures expected." : "Near-freezing temperatures expected."
        }`,
        recommendation:
          "Cover sensitive plants. Delay early morning irrigation. Check frost blankets on greens.",
      });
    }

    // Wind alert - wind > 10 mph (spray restriction)
    const windSpeed = currentWeather?.wind_mph || today?.wind_mph || 0;
    if (windSpeed > 10) {
      alerts.push({
        type: "wind",
        severity: windSpeed > 15 ? "warning" : "caution",
        title: "High Wind Advisory",
        message: `Current wind speed: ${windSpeed} mph from ${currentWeather?.wind_direction || "N/A"}.`,
        recommendation:
          "Postpone spray operations. Secure lightweight equipment and materials. Consider delaying topdressing.",
      });
    }

    // Rain alert - precipitation chance > 50%
    const rainChance =
      currentWeather?.precipitation_chance || today?.precipitation_chance || 0;
    if (rainChance > 50) {
      alerts.push({
        type: "rain",
        severity: rainChance > 75 ? "warning" : "info",
        title: "Rain Expected",
        message: `${rainChance}% chance of precipitation today.`,
        recommendation:
          "Avoid scheduling chemical applications. Consider rain delays for aerification. Check drainage systems.",
      });
    }

    // Heat stress alert - high > 95°F
    if (today && today.high_f > 95) {
      alerts.push({
        type: "heat",
        severity: today.high_f > 100 ? "warning" : "caution",
        title: "Heat Stress Warning",
        message: `Today's high: ${today.high_f}°F. Turf stress likely.`,
        recommendation:
          "Increase syringing cycles on greens. Schedule mowing early. Hydration breaks for crew every 30 minutes.",
      });
    }

    // UV alert - UV index > 8
    const uvIndex = currentWeather?.uv_index || today?.uv_index || 0;
    if (uvIndex > 8) {
      alerts.push({
        type: "uv",
        severity: uvIndex > 10 ? "warning" : "caution",
        title: "High UV Index",
        message: `UV Index: ${uvIndex}. Very high sun exposure.`,
        recommendation:
          "Ensure crew has sunscreen and protective clothing. Schedule breaks in shaded areas.",
      });
    }

    return alerts;
  }, [currentWeather, forecast]);

  /**
   * Refetch all weather data
   */
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCurrentWeather(),
        fetchForecast(),
        fetchWeatherLog(new Date().toISOString().split("T")[0]),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchCurrentWeather, fetchForecast, fetchWeatherLog]);

  return {
    currentWeather,
    forecast,
    todayLog,
    loading,
    error,
    fetchCurrentWeather,
    fetchForecast,
    fetchWeatherLog,
    logDailyWeather,
    calculateGDD,
    fetchGDDSeason,
    getAlerts,
    refetch,
  };
}

// GDD milestone constants for turf management
export const GDD_MILESTONES = [
  { gdd: 150, label: "Crabgrass germination begins", color: "#f59e0b" },
  { gdd: 200, label: "Pre-emergent window closes", color: "#ef4444" },
  { gdd: 350, label: "First crabgrass application cutoff", color: "#dc2626" },
  { gdd: 500, label: "Peak grub activity", color: "#8b5cf6" },
  { gdd: 750, label: "Summer stress management begins", color: "#f97316" },
  { gdd: 1000, label: "Pre-emergence for Poa annua", color: "#22c55e" },
  { gdd: 2500, label: "Fall overseeding window", color: "#06b6d4" },
];
