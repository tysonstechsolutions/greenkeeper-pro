"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  Sun,
  Wind,
  Droplets,
  Flag,
  Car,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  TreePine,
  CircleDot,
  Thermometer,
  CloudRain,
  Eye,
} from "lucide-react";

interface CourseConditions {
  green_speed: string;
  pin_positions: string;
  cart_rules: string;
  frost_delay: boolean;
  frost_delay_until: string | null;
  course_status: "Open" | "Closed" | "Delayed";
  tee_assignments: string;
  practice_range: "Open" | "Closed";
  last_updated_by: string | null;
  notes: string;
}

interface WeatherLog {
  id: string;
  temperature: number;
  wind_speed: number;
  humidity: number;
  conditions: string;
  created_at: string;
}

interface ChemicalApplication {
  id: string;
  area_name: string;
  rei_expires_at: string;
  product_name: string;
}

interface CourseZone {
  id: string;
  zone_name: string;
  condition_score: number;
}

export default function CourseConditionsPage() {
  const { user } = useAuth();
  const [conditions, setConditions] = useState<CourseConditions | null>(null);
  const [weather, setWeather] = useState<WeatherLog | null>(null);
  const [chemicals, setChemicals] = useState<ChemicalApplication[]>([]);
  const [zones, setZones] = useState<CourseZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeAgo, setTimeAgo] = useState("just now");

  const supabase = createClient();

  const fetchConditions = async () => {
    try {
      setError(null);
      const queries = await Promise.all([
        // Fetch course conditions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        withTimeout(
          (supabase.from("app_settings") as any)
            .select("*")
            .eq("key", "course_conditions")
            .single(),
          8000,
          { data: null, error: null }
        ),
        // Fetch latest weather
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        withTimeout(
          (supabase.from("weather_logs") as any)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1),
          8000,
          { data: null, error: null }
        ),
        // Fetch active chemical applications
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        withTimeout(
          (supabase.from("chemical_applications") as any)
            .select("*")
            .gt("rei_expires_at", new Date().toISOString()),
          8000,
          { data: null, error: null }
        ),
        // Fetch course zones
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        withTimeout(
          (supabase.from("course_zones") as any).select("*"),
          8000,
          { data: null, error: null }
        ),
      ]);

      const [conditionsResult, weatherResult, chemicalsResult, zonesResult] =
        queries;

      if ((conditionsResult as any).data?.value) {
        setConditions((conditionsResult as any).data.value.value || {});
      }

      if ((weatherResult as any).data?.data && (weatherResult as any).data.data.length > 0) {
        setWeather((weatherResult as any).data.data[0]);
      }

      if ((chemicalsResult as any).data?.data) {
        setChemicals((chemicalsResult as any).data.data);
      }

      if ((zonesResult as any).data?.data) {
        setZones((zonesResult as any).data.data);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching conditions:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load course conditions"
      );
    } finally {
      setLoading(false);
    }
  };

  // Update time ago display
  useEffect(() => {
    const updateTimeAgo = () => {
      const now = new Date();
      const diffMs = now.getTime() - lastUpdated.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins === 0) {
        setTimeAgo("just now");
      } else if (diffMins === 1) {
        setTimeAgo("1 minute ago");
      } else if (diffMins < 60) {
        setTimeAgo(`${diffMins} minutes ago`);
      } else {
        const hours = Math.floor(diffMins / 60);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Initial fetch
  useEffect(() => {
    fetchConditions();
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConditions();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Open":
        return "bg-green-100 border-green-300 text-green-900";
      case "Closed":
        return "bg-red-100 border-red-300 text-red-900";
      case "Delayed":
        return "bg-amber-100 border-amber-300 text-amber-900";
      default:
        return "bg-gray-100 border-gray-300 text-gray-900";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Open":
        return <CircleDot className="w-5 h-5 text-green-600" />;
      case "Closed":
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case "Delayed":
        return <Clock className="w-5 h-5 text-amber-600" />;
      default:
        return <CircleDot className="w-5 h-5 text-gray-600" />;
    }
  };

  const getZoneConditionColor = (score: number) => {
    if (score >= 8) return "bg-green-50 border-green-200";
    if (score >= 6) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  };

  const getZoneConditionText = (score: number) => {
    if (score >= 8) return "Excellent";
    if (score >= 6) return "Fair";
    return "Poor";
  };

  const getZoneConditionTextColor = (score: number) => {
    if (score >= 8) return "text-green-700";
    if (score >= 6) return "text-amber-700";
    return "text-red-700";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 sm:px-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-green-600" />
            Course Conditions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Veterans Memorial Golf Course — Live Updates
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 sm:px-6">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
            <p className="text-gray-600">Loading course conditions...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Unable to Load</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && conditions && (
          <>
            {/* Refresh Button & Timestamp */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Clock className="w-4 h-4" />
                <span>Updated {timeAgo}</span>
              </div>
              <button
                onClick={fetchConditions}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            {/* Course Status Banner */}
            <div
              className={`mb-6 p-4 sm:p-6 border-2 rounded-lg ${getStatusColor(conditions.course_status)}`}
            >
              <div className="flex items-center gap-3 mb-2">
                {getStatusIcon(conditions.course_status)}
                <h2 className="text-2xl sm:text-3xl font-bold">
                  {conditions.course_status}
                </h2>
              </div>

              {conditions.frost_delay && conditions.frost_delay_until && (
                <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                  <p className="text-sm font-semibold">
                    ❄️ Frost Delay until{" "}
                    {new Date(
                      `2000-01-01T${conditions.frost_delay_until}`
                    ).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
              )}

              {conditions.notes && (
                <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                  <p className="text-sm leading-relaxed">{conditions.notes}</p>
                </div>
              )}
            </div>

            {/* Chemical Alerts */}
            {chemicals.length > 0 && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 mb-2">
                      Chemical Application in Progress
                    </h3>
                    <div className="space-y-2">
                      {chemicals.map((chem) => {
                        const expiresAt = new Date(chem.rei_expires_at);
                        const now = new Date();
                        const hoursLeft = Math.ceil(
                          (expiresAt.getTime() - now.getTime()) / 3600000
                        );

                        return (
                          <div key={chem.id} className="text-sm text-amber-800">
                            <p className="font-medium">{chem.area_name}</p>
                            <p className="text-xs text-amber-700">
                              {chem.product_name} — REI expires in{" "}
                              {hoursLeft > 0 ? `${hoursLeft}h` : "expiring soon"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Today's Conditions Card */}
            <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 sm:px-6 py-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TreePine className="w-5 h-5" />
                  Today's Conditions
                </h3>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {/* Green Speed */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Green Speed
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {conditions.green_speed || "Not set"}
                    </p>
                    {conditions.green_speed && (
                      <p className="text-xs text-gray-500 mt-1">
                        on the Stimpmeter
                      </p>
                    )}
                  </div>
                  <CircleDot className="w-6 h-6 text-green-600 flex-shrink-0" />
                </div>

                {/* Pin Positions */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Pin Positions
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {conditions.pin_positions || "Not set"}
                    </p>
                  </div>
                  <Flag className="w-6 h-6 text-green-600 flex-shrink-0" />
                </div>

                {/* Cart Rules */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Cart Rules
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {conditions.cart_rules || "Not set"}
                    </p>
                  </div>
                  <Car className="w-6 h-6 text-green-600 flex-shrink-0" />
                </div>

                {/* Tee Assignments */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Tee Assignments
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {conditions.tee_assignments || "Not set"}
                    </p>
                  </div>
                  <CircleDot className="w-6 h-6 text-green-600 flex-shrink-0" />
                </div>

                {/* Practice Range */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      Practice Range
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {conditions.practice_range || "Not set"}
                    </p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full flex-shrink-0 ${conditions.practice_range === "Open" ? "bg-green-500" : "bg-red-500"}`}
                  />
                </div>
              </div>
            </div>

            {/* Weather Section */}
            {weather && (
              <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 sm:px-6 py-3">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Sun className="w-5 h-5" />
                    Today's Weather
                  </h3>
                </div>

                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Temperature */}
                    <div className="text-center">
                      <div className="flex justify-center mb-2">
                        <Thermometer className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {Math.round(weather.temperature)}°F
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Temperature</p>
                    </div>

                    {/* Wind Speed */}
                    <div className="text-center">
                      <div className="flex justify-center mb-2">
                        <Wind className="w-6 h-6 text-blue-500" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {Math.round(weather.wind_speed)} mph
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Wind</p>
                    </div>

                    {/* Humidity */}
                    <div className="text-center">
                      <div className="flex justify-center mb-2">
                        <Droplets className="w-6 h-6 text-cyan-500" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {weather.humidity}%
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Humidity</p>
                    </div>
                  </div>

                  {weather.conditions && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-sm text-gray-600">Conditions</p>
                      <p className="text-base font-semibold text-gray-900 mt-1">
                        {weather.conditions}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-100">
                    Last update:{" "}
                    {new Date(weather.created_at).toLocaleTimeString(
                      "en-US",
                      {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      }
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Course Zone Conditions */}
            {zones.length > 0 && (
              <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-4 sm:px-6 py-3">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Course Zone Conditions
                  </h3>
                </div>

                <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {zones.map((zone) => (
                    <div
                      key={zone.id}
                      className={`p-4 rounded-lg border ${getZoneConditionColor(zone.condition_score)}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {zone.zone_name}
                          </p>
                          <p
                            className={`text-sm font-semibold mt-2 ${getZoneConditionTextColor(zone.condition_score)}`}
                          >
                            {getZoneConditionText(zone.condition_score)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">
                            {zone.condition_score}
                          </p>
                          <p className="text-xs text-gray-600">/10</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Note */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 text-center leading-relaxed">
                Course conditions updated regularly throughout the day. Check back
                for the latest information. Last update: {timeAgo}
              </p>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && !conditions && !error && (
          <div className="text-center py-12">
            <TreePine className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No conditions available</p>
            <p className="text-sm text-gray-500 mt-1">
              Course conditions have not been configured yet.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
