"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCourseZones } from "@/lib/hooks/useCourseZones";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ChevronRight } from "lucide-react";

// Dynamically import the map component to avoid SSR issues with Leaflet
const CourseMapComponent = dynamic(
  () => import("./course-map-component").then((mod) => mod.CourseMapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
        <MapPin className="w-8 h-8 text-muted-foreground/50" />
      </div>
    ),
  }
);

interface MiniMapWidgetProps {
  /** Additional class name */
  className?: string;
}

export function MiniMapWidget({ className }: MiniMapWidgetProps) {
  const router = useRouter();
  const { zones, loading, error } = useCourseZones();

  // Navigate to full course map
  const handleClick = () => {
    router.push("/course-map");
  };

  // Count zones by condition
  const conditionCounts = {
    excellent: zones.filter((z) => z.condition_score !== null && z.condition_score >= 8).length,
    fair: zones.filter((z) => z.condition_score !== null && z.condition_score >= 5 && z.condition_score < 8).length,
    poor: zones.filter((z) => z.condition_score !== null && z.condition_score < 5).length,
    unrated: zones.filter((z) => z.condition_score === null).length,
  };

  // Zones with geojson for map display
  const mappedZones = zones.filter((z) => z.geojson !== null);

  // Loading state
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-0 overflow-hidden">
          <div className="h-[200px] bg-muted animate-pulse" />
          <div className="p-3 border-t">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card
        className={`cursor-pointer hover:bg-accent/50 transition-colors ${className}`}
        onClick={handleClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <MapPin className="w-5 h-5" />
            <span className="text-sm">Course map unavailable</span>
            <ChevronRight className="w-4 h-4 ml-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all overflow-hidden ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label="View course map"
    >
      <CardContent className="p-0">
        {/* Map preview */}
        <div className="h-[180px] relative">
          <CourseMapComponent
            zones={mappedZones}
            showZones={true}
            showTasks={false}
            showProblems={false}
            minimal={true}
            className="w-full h-full"
          />
          {/* Overlay gradient for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

          {/* Zone count badge */}
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-medium">
            {mappedZones.length} zones mapped
          </div>
        </div>

        {/* Condition summary */}
        <div className="p-3 border-t bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Course Conditions</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-3 text-xs">
            {conditionCounts.excellent > 0 && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{conditionCounts.excellent}</span>
              </div>
            )}
            {conditionCounts.fair > 0 && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">{conditionCounts.fair}</span>
              </div>
            )}
            {conditionCounts.poor > 0 && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">{conditionCounts.poor}</span>
              </div>
            )}
            {conditionCounts.unrated > 0 && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="text-muted-foreground">{conditionCounts.unrated}</span>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Excellent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Fair
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Poor
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
