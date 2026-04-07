import {
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudFog,
  CloudLightning,
  Sun,
} from "lucide-react";

/**
 * Returns a Lucide weather icon based on a condition string from WeatherAPI.
 * Single source of truth — imported by header, dashboard, weather widget, briefing, etc.
 */
export function WeatherIcon({
  condition,
  className = "w-4 h-4",
}: {
  condition: string;
  className?: string;
}) {
  const c = condition.toLowerCase();

  if (c.includes("thunder") || c.includes("lightning"))
    return <CloudLightning className={className} />;
  if (c.includes("snow") || c.includes("sleet") || c.includes("ice"))
    return <CloudSnow className={className} />;
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower"))
    return <CloudRain className={className} />;
  if (c.includes("fog") || c.includes("mist") || c.includes("haze"))
    return <CloudFog className={className} />;
  if (c.includes("cloud") || c.includes("overcast")) {
    if (c.includes("partly") || c.includes("partial"))
      return <CloudSun className={className} />;
    return <Cloud className={className} />;
  }
  if (c.includes("sunny") || c.includes("clear"))
    return <Sun className={className} />;

  // Fallback
  return <CloudSun className={className} />;
}
