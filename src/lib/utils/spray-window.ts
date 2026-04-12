/**
 * Spray-window optimizer
 *
 * Scores forecast hours for spray suitability and finds optimal
 * application windows by combining weather conditions with disease pressure.
 *
 * Works with both hourly (4-hour windows) and daily (1-day windows) data.
 */

export interface HourlyForecast {
  datetime: string; // ISO
  temp_f: number;
  humidity: number;
  wind_mph: number;
  precip_chance: number; // 0-100
}

export interface SprayWindow {
  start: string; // ISO datetime
  end: string;
  score: number; // 0-1, higher = better
  avg_wind_mph: number;
  max_precip_chance: number;
  disease_pressure: number; // Smith-Kerns probability
  risk_level: string;
  reason: string; // human-readable
}

// ─── Per-hour scoring ─────────────────────────────────────────────────────────

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

/**
 * Time-of-day score. Supers prefer spraying 5am-9am for dew dilution
 * and low wind. Late afternoon is acceptable. Midday/night is worst.
 */
function timeScore(hour: number): number {
  if (hour >= 5 && hour <= 9) return 1;
  if (hour >= 4 && hour <= 10) return 0.7;
  if (hour >= 16 && hour <= 19) return 0.5;
  return 0.2;
}

export function scoreHour(forecast: HourlyForecast): number {
  const hour = new Date(forecast.datetime).getHours();
  return windScore(forecast.wind_mph) * rainScore(forecast.precip_chance) * timeScore(hour);
}

// ─── Window detection ─────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildReason(window: {
  avgWind: number;
  maxPrecip: number;
  diseasePressure: number;
  riskLevel: string;
  startHour: number;
}): string {
  const parts: string[] = [];

  if (window.avgWind < 8) parts.push("Low wind");
  else if (window.avgWind < 12) parts.push("Moderate wind");
  else parts.push("Elevated wind");

  if (window.maxPrecip < 10) parts.push("no rain expected");
  else if (window.maxPrecip < 30) parts.push("slight rain chance");
  else parts.push("rain possible");

  if (window.diseasePressure >= 0.6) parts.push("very high disease pressure");
  else if (window.diseasePressure >= 0.4) parts.push("high disease pressure");
  else if (window.diseasePressure >= 0.2) parts.push("moderate disease pressure");

  if (window.startHour >= 5 && window.startHour <= 9) parts.push("ideal morning timing");

  return parts.join(", ");
}

/**
 * Find the best spray windows from a forecast.
 *
 * For hourly data: slides a 4-hour window across the forecast.
 * For daily data:  each day is treated as a single window.
 *
 * @param forecast  - Array of hourly (or daily-interpolated) forecast entries
 * @param diseaseP  - Smith-Kerns probability (0-1)
 * @param windowSize - Number of consecutive entries per window (default: 4 for hourly)
 * @returns Top 3 spray windows sorted by score descending
 */
export function findBestSprayWindows(
  forecast: HourlyForecast[],
  diseaseP: number,
  windowSize: number = 4
): SprayWindow[] {
  if (forecast.length === 0) return [];

  const riskLevel = riskLevelFromProbability(diseaseP);
  const windows: SprayWindow[] = [];

  const limit = Math.max(1, forecast.length - windowSize + 1);
  for (let i = 0; i < limit; i++) {
    const slice = forecast.slice(i, i + windowSize);
    const hourScores = slice.map(scoreHour);
    const avgScore = avg(hourScores);

    // Multiply by disease pressure so high-pressure days rank higher
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
        riskLevel,
        startHour,
      }),
    });
  }

  // Sort descending by score, return top 3
  windows.sort((a, b) => b.score - a.score);
  return windows.slice(0, 3);
}

function riskLevelFromProbability(p: number): string {
  if (p < 0.2) return "low";
  if (p < 0.4) return "moderate";
  if (p < 0.6) return "high";
  return "very-high";
}

// ─── Daily-to-hourly interpolation ────────────────────────────────────────────

/**
 * Interpolate daily forecast data into pseudo-hourly entries.
 *
 * WeatherAPI.com does provide hourly data in the API response, but the
 * existing integration only extracts daily summaries. This helper creates
 * reasonable hourly approximations from daily data so the spray-window
 * optimizer can still find 4-hour windows.
 *
 * Temperature follows a sinusoidal curve peaking at 3pm, with the low at 5am.
 * Wind is assumed constant at max_wind * 0.7 (avg approximation).
 * Humidity is assumed constant at the daily average.
 * Precip chance is assumed constant across the day.
 */
export function interpolateDailyToHourly(day: {
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
  // Approximate average wind from max
  const avgWind = day.max_wind_mph * 0.7;

  for (let h = 0; h < 24; h++) {
    // Sinusoidal temp: peaks at hour 15 (3pm), trough at hour 3 (3am)
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
