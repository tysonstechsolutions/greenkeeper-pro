// src/lib/utils/weather.ts

export interface WeatherData {
  temp_f: number;
  temp_c: number;
  condition: string;
  condition_icon: string;
  humidity: number;
  wind_mph: number;
  wind_direction: string;
  uv: number;
  feels_like_f: number;
  precip_in: number;
  cloud: number;
  is_day: boolean;
}

export interface ForecastDay {
  date: string;
  max_temp_f: number;
  min_temp_f: number;
  condition: string;
  condition_icon: string;
  chance_of_rain: number;
  chance_of_snow: number;
  max_wind_mph: number;
  avg_humidity: number;
  uv: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherAlert {
  headline: string;
  severity: string;
  event: string;
  effective: string;
  expires: string;
  description: string;
}

export interface WeatherResponse {
  current: WeatherData;
  forecast: ForecastDay[];
  alerts: WeatherAlert[];
  location: {
    name: string;
    region: string;
    lat: number;
    lon: number;
    localtime: string;
  };
}

// Cache for weather data (15 minutes)
const CACHE_DURATION_MS = 15 * 60 * 1000;
let weatherCache: { data: WeatherResponse; timestamp: number } | null = null;

/**
 * Fetch current weather and forecast from WeatherAPI.com
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  days: number = 3
): Promise<WeatherResponse | null> {
  // Check cache first
  if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_DURATION_MS) {
    return weatherCache.data;
  }

  const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;

  if (!apiKey) {
    console.error("Weather API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lng}&days=${days}&alerts=yes&aqi=no`,
      { next: { revalidate: 900 } } as RequestInit & { next?: { revalidate?: number } } // Cache for 15 minutes (Next.js specific)
    );

    if (!response.ok) {
      console.error("Weather API error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    const weatherResponse: WeatherResponse = {
      current: {
        temp_f: data.current.temp_f,
        temp_c: data.current.temp_c,
        condition: data.current.condition.text,
        condition_icon: data.current.condition.icon,
        humidity: data.current.humidity,
        wind_mph: data.current.wind_mph,
        wind_direction: data.current.wind_dir,
        uv: data.current.uv,
        feels_like_f: data.current.feelslike_f,
        precip_in: data.current.precip_in,
        cloud: data.current.cloud,
        is_day: data.current.is_day === 1,
      },
      forecast: data.forecast.forecastday.map((day: { date: string; day: { maxtemp_f: number; mintemp_f: number; condition: { text: string; icon: string }; daily_chance_of_rain: number; daily_chance_of_snow: number; maxwind_mph: number; avghumidity: number; uv: number }; astro: { sunrise: string; sunset: string } }) => ({
        date: day.date,
        max_temp_f: day.day.maxtemp_f,
        min_temp_f: day.day.mintemp_f,
        condition: day.day.condition.text,
        condition_icon: day.day.condition.icon,
        chance_of_rain: day.day.daily_chance_of_rain,
        chance_of_snow: day.day.daily_chance_of_snow,
        max_wind_mph: day.day.maxwind_mph,
        avg_humidity: day.day.avghumidity,
        uv: day.day.uv,
        sunrise: day.astro.sunrise,
        sunset: day.astro.sunset,
      })),
      alerts: (data.alerts?.alert || []).map((alert: { headline: string; severity: string; event: string; effective: string; expires: string; desc: string }) => ({
        headline: alert.headline,
        severity: alert.severity,
        event: alert.event,
        effective: alert.effective,
        expires: alert.expires,
        description: alert.desc,
      })),
      location: {
        name: data.location.name,
        region: data.location.region,
        lat: data.location.lat,
        lon: data.location.lon,
        localtime: data.location.localtime,
      },
    };

    // Update cache
    weatherCache = {
      data: weatherResponse,
      timestamp: Date.now(),
    };

    return weatherResponse;
  } catch (error) {
    console.error("Error fetching weather:", error);
    // Return cached data if available, even if stale
    return weatherCache?.data || null;
  }
}

/**
 * Get weather-based recommendations for turf management
 */
export function getWeatherRecommendations(weather: WeatherData): string[] {
  const recommendations: string[] = [];

  // Frost warning
  if (weather.temp_f < 36) {
    recommendations.push("Frost risk: Delay mowing until grass is dry");
  }

  // Heat stress
  if (weather.temp_f > 90) {
    recommendations.push("Heat stress: Increase irrigation, avoid heavy traffic on greens");
  }

  // High wind
  if (weather.wind_mph > 20) {
    recommendations.push("High wind: Postpone chemical applications");
  }

  // Rain expected
  if (weather.precip_in > 0) {
    recommendations.push("Rain expected: Consider postponing fertilizer applications");
  }

  // High UV
  if (weather.uv >= 8) {
    recommendations.push("High UV: Ensure staff have sun protection");
  }

  // Good conditions
  if (
    weather.temp_f >= 50 &&
    weather.temp_f <= 85 &&
    weather.wind_mph < 15 &&
    weather.precip_in === 0
  ) {
    recommendations.push("Ideal conditions for chemical applications and mowing");
  }

  return recommendations;
}

/**
 * Clear the weather cache (useful for testing or manual refresh)
 */
export function clearWeatherCache(): void {
  weatherCache = null;
}
