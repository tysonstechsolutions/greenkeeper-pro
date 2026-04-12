import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COURSE } from "@/lib/constants";
import {
  calculateDollarSpotProbability,
  getDollarSpotRisk,
} from "@/lib/utils/disease-models";
import {
  findBestSprayWindows,
  interpolateDailyToHourly,
  type HourlyForecast,
} from "@/lib/utils/spray-window";

const WEATHER_API_BASE = "https://api.weatherapi.com/v1";

// Cache spray-window results for 30 minutes
let sprayCache: { data: SprayWindowResponse; timestamp: number } | null = null;
const CACHE_DURATION_MS = 30 * 60 * 1000;

interface SprayWindowResponse {
  disease_pressure: number;
  risk_level: string;
  windows: ReturnType<typeof findBestSprayWindows>;
  weather_source: "hourly" | "daily";
  forecast_hours?: HourlyForecast[];
}

/**
 * GET /api/spray-window
 *
 * Returns spray-window recommendations based on:
 * 1. Historical weather data (last 5 days) for disease pressure
 * 2. 72-hour forecast for window scoring
 *
 * WeatherAPI.com provides hourly data within the forecast response.
 * We extract hourly data when available, falling back to interpolated
 * daily data if the API tier doesn't include hourly.
 */
export async function GET() {
  try {
    // Check cache
    if (sprayCache && Date.now() - sprayCache.timestamp < CACHE_DURATION_MS) {
      return NextResponse.json(sprayCache.data);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── 1. Compute disease pressure from last 5 days of weather_logs ───
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoStr = fiveDaysAgo.toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("weather_logs")
      .select("high_temp_f, low_temp_f, humidity_avg")
      .gte("log_date", fiveDaysAgoStr)
      .order("log_date", { ascending: false })
      .limit(5);

    // Calculate 5-day averages from weather logs
    let avgTemp5dF = 72; // fallback defaults
    let avgRh5d = 65;

    if (logs && logs.length > 0) {
      const temps = logs.map(
        (l: { high_temp_f: number; low_temp_f: number }) =>
          (l.high_temp_f + l.low_temp_f) / 2
      );
      const humidities = logs.map(
        (l: { humidity_avg: number }) => l.humidity_avg
      );
      avgTemp5dF = temps.reduce((a: number, b: number) => a + b, 0) / temps.length;
      avgRh5d =
        humidities.reduce((a: number, b: number) => a + b, 0) / humidities.length;
    }

    const diseasePressure = calculateDollarSpotProbability({
      avgTemp5dF,
      avgRh5d,
    });
    const riskLevel = getDollarSpotRisk(diseasePressure);

    // ─── 2. Fetch 3-day forecast from WeatherAPI.com ───
    const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Weather API key not configured" },
        { status: 500 }
      );
    }

    const forecastRes = await fetch(
      `${WEATHER_API_BASE}/forecast.json?key=${apiKey}&q=${COURSE.lat},${COURSE.lng}&days=3&aqi=no&alerts=no`,
      { next: { revalidate: 1800 } } as RequestInit & {
        next?: { revalidate?: number };
      }
    );

    if (!forecastRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch forecast" },
        { status: 502 }
      );
    }

    const forecastData = await forecastRes.json();
    const forecastDays = forecastData?.forecast?.forecastday || [];

    // ─── 3. Extract hourly data if available, else interpolate ───
    let hourlyForecast: HourlyForecast[] = [];
    let weatherSource: "hourly" | "daily" = "daily";

    // WeatherAPI.com includes hourly data in forecastday[].hour[]
    const hasHourly =
      forecastDays.length > 0 &&
      Array.isArray(forecastDays[0]?.hour) &&
      forecastDays[0].hour.length > 0;

    if (hasHourly) {
      weatherSource = "hourly";
      for (const day of forecastDays) {
        for (const hour of day.hour) {
          hourlyForecast.push({
            datetime: hour.time.replace(" ", "T"),
            temp_f: hour.temp_f,
            humidity: hour.humidity,
            wind_mph: hour.wind_mph,
            precip_chance: hour.chance_of_rain || 0,
          });
        }
      }
    } else {
      // Fallback: interpolate daily data into pseudo-hourly
      weatherSource = "daily";
      for (const day of forecastDays) {
        const interpolated = interpolateDailyToHourly({
          date: day.date,
          max_temp_f: day.day.maxtemp_f,
          min_temp_f: day.day.mintemp_f,
          max_wind_mph: day.day.maxwind_mph,
          avg_humidity: day.day.avghumidity,
          chance_of_rain: day.day.daily_chance_of_rain,
        });
        hourlyForecast = hourlyForecast.concat(interpolated);
      }
    }

    // ─── 4. Find best spray windows ───
    const windows = findBestSprayWindows(hourlyForecast, diseasePressure);

    const response: SprayWindowResponse = {
      disease_pressure: Math.round(diseasePressure * 1000) / 1000,
      risk_level: riskLevel,
      windows,
      weather_source: weatherSource,
      forecast_hours: hourlyForecast,
    };

    // Update cache
    sprayCache = { data: response, timestamp: Date.now() };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Spray window API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
