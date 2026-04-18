/**
 * spray-window — Deno edge function port of /api/spray-window.
 *
 * Returns ranked spray-window recommendations:
 *   1. Pulls last-5-days weather_logs to compute Smith-Kerns dollar-spot
 *      probability (disease pressure).
 *   2. Pulls a 3-day forecast from WeatherAPI.com (hourly when available,
 *      interpolated daily when not).
 *   3. Slides a 4-hour window across the forecast and scores each by wind,
 *      precip chance, and time-of-day, multiplied by disease pressure.
 *   4. Returns the top 3 windows.
 *
 * Auth: requires a signed-in user.
 * Secrets needed: NEXT_PUBLIC_WEATHER_API_KEY (or WEATHER_API_KEY)
 *
 * Deploy:  supabase functions deploy spray-window
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const WEATHER_API_BASE = "https://api.weatherapi.com/v1";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Inlined from src/lib/constants.ts
const COURSE = { lat: 42.3095, lng: -87.8475 };

// ── Smith-Kerns disease model (inlined from src/lib/utils/disease-models.ts) ─

const SMITH_KERNS_INTERCEPT = -11.4041;
const SMITH_KERNS_TEMP_COEFF = 0.1932;
const SMITH_KERNS_RH_COEFF = 0.0894;

function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

function calculateDollarSpotProbability(
  avgTemp5dF: number,
  avgRh5d: number,
): number {
  const tempC = fahrenheitToCelsius(avgTemp5dF);
  const logitP = SMITH_KERNS_INTERCEPT +
    SMITH_KERNS_TEMP_COEFF * tempC +
    SMITH_KERNS_RH_COEFF * avgRh5d;
  return 1 / (1 + Math.exp(-logitP));
}

function getDollarSpotRisk(p: number): "low" | "moderate" | "high" | "very-high" {
  if (p < 0.2) return "low";
  if (p < 0.4) return "moderate";
  if (p < 0.6) return "high";
  return "very-high";
}

// ── Spray window scoring (inlined from src/lib/utils/spray-window.ts) ───────

interface HourlyForecast {
  datetime: string;
  temp_f: number;
  humidity: number;
  wind_mph: number;
  precip_chance: number;
}

interface SprayWindow {
  start: string;
  end: string;
  score: number;
  avg_wind_mph: number;
  max_precip_chance: number;
  disease_pressure: number;
  risk_level: string;
  reason: string;
}

function windScore(windMph: number): number {
  if (windMph < 8) return 1;
  if (windMph < 12) return 0.7;
  if (windMph < 15) return 0.3;
  return 0;
}

function rainScore(precipChance: number): number {
  if (precipChance < 10) return 1;
  if (precipChance < 30) return 0.6;
  if (precipChance < 50) return 0.3;
  return 0;
}

function timeScore(hour: number): number {
  if (hour >= 5 && hour <= 9) return 1;
  if (hour >= 4 && hour <= 10) return 0.7;
  if (hour >= 16 && hour <= 19) return 0.5;
  return 0.2;
}

function scoreHour(forecast: HourlyForecast): number {
  const hour = new Date(forecast.datetime).getHours();
  return windScore(forecast.wind_mph) *
    rainScore(forecast.precip_chance) *
    timeScore(hour);
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildReason(w: {
  avgWind: number;
  maxPrecip: number;
  diseasePressure: number;
  startHour: number;
}): string {
  const parts: string[] = [];
  if (w.avgWind < 8) parts.push("Low wind");
  else if (w.avgWind < 12) parts.push("Moderate wind");
  else parts.push("Elevated wind");

  if (w.maxPrecip < 10) parts.push("no rain expected");
  else if (w.maxPrecip < 30) parts.push("slight rain chance");
  else parts.push("rain possible");

  if (w.diseasePressure >= 0.6) parts.push("very high disease pressure");
  else if (w.diseasePressure >= 0.4) parts.push("high disease pressure");
  else if (w.diseasePressure >= 0.2) parts.push("moderate disease pressure");

  if (w.startHour >= 5 && w.startHour <= 9) parts.push("ideal morning timing");
  return parts.join(", ");
}

function findBestSprayWindows(
  forecast: HourlyForecast[],
  diseaseP: number,
  windowSize = 4,
): SprayWindow[] {
  if (forecast.length === 0) return [];

  const riskLevel = getDollarSpotRisk(diseaseP);
  const windows: SprayWindow[] = [];
  const limit = Math.max(1, forecast.length - windowSize + 1);

  for (let i = 0; i < limit; i++) {
    const slice = forecast.slice(i, i + windowSize);
    const hourScores = slice.map(scoreHour);
    const avgScore = avg(hourScores);
    const windowScore = avgScore * diseaseP;

    const avgWind = avg(slice.map((h) => h.wind_mph));
    const maxPrecip = Math.max(...slice.map((h) => h.precip_chance));
    const startHour = new Date(slice[0].datetime).getHours();

    windows.push({
      start: slice[0].datetime,
      end: slice[slice.length - 1].datetime,
      score: Math.round(windowScore * 1000) / 1000,
      avg_wind_mph: Math.round(avgWind * 10) / 10,
      max_precip_chance: maxPrecip,
      disease_pressure: diseaseP,
      risk_level: riskLevel,
      reason: buildReason({
        avgWind,
        maxPrecip,
        diseasePressure: diseaseP,
        startHour,
      }),
    });
  }

  windows.sort((a, b) => b.score - a.score);
  return windows.slice(0, 3);
}

function interpolateDailyToHourly(day: {
  date: string;
  max_temp_f: number;
  min_temp_f: number;
  max_wind_mph: number;
  avg_humidity: number;
  chance_of_rain: number;
}): HourlyForecast[] {
  const hours: HourlyForecast[] = [];
  const midTemp = (day.max_temp_f + day.min_temp_f) / 2;
  const amplitude = (day.max_temp_f - day.min_temp_f) / 2;
  const avgWind = day.max_wind_mph * 0.7;

  for (let h = 0; h < 24; h++) {
    // Sinusoidal temp peaks at 3pm, troughs at 3am
    const tempF = midTemp + amplitude * Math.sin(((h - 3) / 24) * 2 * Math.PI);
    hours.push({
      datetime: `${day.date}T${String(h).padStart(2, "0")}:00:00`,
      temp_f: Math.round(tempF * 10) / 10,
      humidity: day.avg_humidity,
      wind_mph: Math.round(avgWind * 10) / 10,
      precip_chance: day.chance_of_rain,
    });
  }
  return hours;
}

// ── In-memory cache (per isolate) ───────────────────────────────────────────

interface SprayWindowResponse {
  disease_pressure: number;
  risk_level: string;
  windows: SprayWindow[];
  weather_source: "hourly" | "daily";
  forecast_hours?: HourlyForecast[];
}

let sprayCache: { data: SprayWindowResponse; timestamp: number } | null = null;

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  // GET = full request; POST also accepted because the client wraps GETs
  // in POSTs when calling via supabase.functions.invoke().
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    // Cache check — same response for everyone for 30 min
    if (sprayCache && Date.now() - sprayCache.timestamp < CACHE_DURATION_MS) {
      return jsonResponse(sprayCache.data);
    }

    const supabase = getUserClient(req);

    // 1. Last-5-days weather_logs → disease pressure ────────────────────
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoStr = fiveDaysAgo.toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("weather_logs")
      .select("high_temp_f, low_temp_f, humidity_avg")
      .gte("log_date", fiveDaysAgoStr)
      .order("log_date", { ascending: false })
      .limit(5);

    let avgTemp5dF = 72;
    let avgRh5d = 65;

    if (logs && logs.length > 0) {
      const rows = logs as Array<{
        high_temp_f: number;
        low_temp_f: number;
        humidity_avg: number;
      }>;
      const temps = rows.map((l) => (l.high_temp_f + l.low_temp_f) / 2);
      const humidities = rows.map((l) => l.humidity_avg);
      avgTemp5dF = temps.reduce((a, b) => a + b, 0) / temps.length;
      avgRh5d = humidities.reduce((a, b) => a + b, 0) / humidities.length;
    }

    const diseasePressure = calculateDollarSpotProbability(avgTemp5dF, avgRh5d);
    const riskLevel = getDollarSpotRisk(diseasePressure);

    // 2. WeatherAPI.com 3-day forecast ───────────────────────────────────
    const apiKey = Deno.env.get("NEXT_PUBLIC_WEATHER_API_KEY") ??
      Deno.env.get("WEATHER_API_KEY");
    if (!apiKey) {
      return jsonError("Weather API key not configured", 500);
    }

    const forecastRes = await fetch(
      `${WEATHER_API_BASE}/forecast.json?key=${apiKey}&q=${COURSE.lat},${COURSE.lng}&days=3&aqi=no&alerts=no`,
    );

    if (!forecastRes.ok) {
      console.error("Weather forecast fetch failed:", forecastRes.status);
      return jsonError("Failed to fetch forecast", 502);
    }

    const forecastData = await forecastRes.json();
    const forecastDays = forecastData?.forecast?.forecastday || [];

    // 3. Hourly preferred, daily-interpolated fallback ───────────────────
    let hourlyForecast: HourlyForecast[] = [];
    let weatherSource: "hourly" | "daily" = "daily";

    const hasHourly = forecastDays.length > 0 &&
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

    // 4. Find best windows ───────────────────────────────────────────────
    const windows = findBestSprayWindows(hourlyForecast, diseasePressure);

    const response: SprayWindowResponse = {
      disease_pressure: Math.round(diseasePressure * 1000) / 1000,
      risk_level: riskLevel,
      windows,
      weather_source: weatherSource,
      forecast_hours: hourlyForecast,
    };

    sprayCache = { data: response, timestamp: Date.now() };
    return jsonResponse(response);
  } catch (err) {
    console.error("Spray window API error:", err);
    return jsonError("Internal server error", 500);
  }
});
