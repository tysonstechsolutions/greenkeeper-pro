"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CourseZone, ZoneType } from "@/types/database";

interface UseCourseZonesReturn {
  zones: CourseZone[];
  loading: boolean;
  error: string | null;
  fetchZones: (zoneType?: ZoneType) => Promise<void>;
  getZone: (id: string) => CourseZone | undefined;
  getZoneAsync: (id: string) => Promise<CourseZone | null>;
  getZonesByType: (zoneType: ZoneType) => CourseZone[];
  getZonesByHole: (holeNumber: number) => CourseZone[];
  greens: CourseZone[];
  tees: CourseZone[];
  fairways: CourseZone[];
  bunkers: CourseZone[];
}

export function useCourseZones(): UseCourseZonesReturn {
  const [zones, setZones] = useState<CourseZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch all zones, optionally filtered by type
  const fetchZones = useCallback(
    async (zoneType?: ZoneType) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("course_zones")
          .select("*")
          .order("hole_number", { ascending: true, nullsFirst: false })
          .order("zone_type", { ascending: true })
          .order("name", { ascending: true });

        if (zoneType) {
          query = query.eq("zone_type", zoneType);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching zones:", fetchError);
          setError(fetchError.message);
          return;
        }

        setZones((data as CourseZone[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching zones:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Get a zone by ID from local state (synchronous)
  const getZone = useCallback(
    (id: string): CourseZone | undefined => {
      return zones.find((z) => z.id === id);
    },
    [zones]
  );

  // Get a zone by ID from database (async, for when you need fresh data)
  const getZoneAsync = useCallback(
    async (id: string): Promise<CourseZone | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("course_zones")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          console.error("Error fetching zone:", fetchError);
          return null;
        }

        return data as CourseZone;
      } catch (err) {
        console.error("Unexpected error fetching zone:", err);
        return null;
      }
    },
    [supabase]
  );

  // Get zones by type from local state
  const getZonesByType = useCallback(
    (zoneType: ZoneType): CourseZone[] => {
      return zones.filter((z) => z.zone_type === zoneType);
    },
    [zones]
  );

  // Get zones by hole number from local state
  const getZonesByHole = useCallback(
    (holeNumber: number): CourseZone[] => {
      return zones.filter((z) => z.hole_number === holeNumber);
    },
    [zones]
  );

  // Memoized filtered zone lists for common access patterns
  const greens = useMemo(
    () => zones.filter((z) => z.zone_type === "green"),
    [zones]
  );

  const tees = useMemo(
    () => zones.filter((z) => z.zone_type === "tee"),
    [zones]
  );

  const fairways = useMemo(
    () => zones.filter((z) => z.zone_type === "fairway"),
    [zones]
  );

  const bunkers = useMemo(
    () => zones.filter((z) => z.zone_type === "bunker"),
    [zones]
  );

  // Initial fetch
  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  return {
    zones,
    loading,
    error,
    fetchZones,
    getZone,
    getZoneAsync,
    getZonesByType,
    getZonesByHole,
    greens,
    tees,
    fairways,
    bunkers,
  };
}

// Utility function to format zone display name
export function formatZoneName(zone: CourseZone): string {
  if (zone.hole_number) {
    const typeLabel = zoneTypeLabels[zone.zone_type] || zone.zone_type;
    return `Hole ${zone.hole_number} ${typeLabel}`;
  }
  return zone.name;
}

// Zone type display labels
export const zoneTypeLabels: Record<ZoneType, string> = {
  green: "Green",
  tee: "Tee",
  fairway: "Fairway",
  rough: "Rough",
  bunker: "Bunker",
  cart_path: "Cart Path",
  practice: "Practice Area",
  clubhouse: "Clubhouse",
  maintenance: "Maintenance",
  other: "Other",
};

// Zone type colors for UI
export const zoneTypeColors: Record<ZoneType, string> = {
  green: "#22c55e", // Green
  tee: "#3b82f6", // Blue
  fairway: "#84cc16", // Lime
  rough: "#a3e635", // Light green
  bunker: "#fbbf24", // Amber
  cart_path: "#9ca3af", // Gray
  practice: "#8b5cf6", // Violet
  clubhouse: "#f97316", // Orange
  maintenance: "#6b7280", // Dark gray
  other: "#d1d5db", // Light gray
};
