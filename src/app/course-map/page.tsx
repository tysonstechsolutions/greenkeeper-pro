"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Map, Layers, MapPin, AlertTriangle, Droplets, X, ChevronRight, Camera, ClipboardList, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCourseZones, zoneTypeLabels } from "@/lib/hooks/useCourseZones";
import { useTasks } from "@/lib/hooks/useTasks";
import { usePhotos } from "@/lib/hooks/usePhotos";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { CourseZone, ZoneType, GeoJsonPolygon } from "@/types/database";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { PhotoWithUploader } from "@/lib/hooks/usePhotos";

// Dynamically import the map component to avoid SSR issues
const CourseMapComponent = dynamic(
  () => import("@/components/features/map/course-map-component").then((mod) => mod.CourseMapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
        <Map className="w-12 h-12 text-muted-foreground/30" />
      </div>
    ),
  }
);

// Condition score colors
const conditionColors = {
  excellent: "bg-green-500",
  fair: "bg-yellow-500",
  poor: "bg-red-500",
  unrated: "bg-gray-400",
};

function getConditionLabel(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "Unrated", color: conditionColors.unrated };
  if (score >= 8) return { label: "Excellent", color: conditionColors.excellent };
  if (score >= 5) return { label: "Fair", color: conditionColors.fair };
  return { label: "Poor", color: conditionColors.poor };
}

// Zone type options
const zoneTypeOptions: ZoneType[] = [
  "green", "tee", "fairway", "rough", "bunker",
  "cart_path", "practice", "clubhouse", "maintenance", "other"
];

export default function CourseMapPage() {
  const router = useRouter();
  const { isSuper } = useAuth();
  const { zones, loading: zonesLoading, fetchZones } = useCourseZones();
  const { tasks, fetchTasks } = useTasks();
  const { photos, fetchPhotos } = usePhotos();
  const supabase = createClient();

  // Layer visibility state
  const [showZones, setShowZones] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showProblems, setShowProblems] = useState(true);
  const [showIrrigation, setShowIrrigation] = useState(false);

  // Layer controls panel visibility (mobile)
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // Selected zone state
  const [selectedZone, setSelectedZone] = useState<CourseZone | null>(null);
  const [showZoneSheet, setShowZoneSheet] = useState(false);

  // Edit mode state
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [newZoneGeojson, setNewZoneGeojson] = useState<GeoJsonPolygon | null>(null);
  const [newZoneData, setNewZoneData] = useState({
    name: "",
    zone_type: "green" as ZoneType,
    hole_number: "",
    turf_type: "",
    acreage: "",
  });

  // Condition update state
  const [updatingCondition, setUpdatingCondition] = useState(false);
  const [conditionScore, setConditionScore] = useState<number | null>(null);

  // Load tasks and photos
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetchTasks({
      status: ["pending", "in_progress"],
      dateRange: { start: today, end: today },
    });
    fetchPhotos({ photoType: "problem" });
  }, [fetchTasks, fetchPhotos]);

  // Tasks filtered for active ones with zones
  const activeTasks = useMemo(() => {
    return tasks.filter((t) =>
      ["pending", "in_progress"].includes(t.status) && t.zone_id
    );
  }, [tasks]);

  // Problem photos with GPS
  const problemPhotos = useMemo(() => {
    return photos.filter((p) => p.photo_type === "problem" && p.gps_lat && p.gps_lng);
  }, [photos]);

  // Count tasks by zone
  const taskCountsByZone = useMemo(() => {
    const counts: Record<string, number> = {};
    activeTasks.forEach((task) => {
      if (task.zone_id) {
        counts[task.zone_id] = (counts[task.zone_id] || 0) + 1;
      }
    });
    return counts;
  }, [activeTasks]);

  // Handle zone click
  const handleZoneClick = useCallback((zone: CourseZone) => {
    setSelectedZone(zone);
    setConditionScore(zone.condition_score);
    setShowZoneSheet(true);
  }, []);

  // Handle task click
  const handleTaskClick = useCallback((task: TaskWithRelations) => {
    router.push(`/tasks/${task.id}`);
  }, [router]);

  // Handle zone save from draw mode
  const handleZoneSave = useCallback((data: { geojson: GeoJsonPolygon }) => {
    setNewZoneGeojson(data.geojson);
    setShowZoneForm(true);
  }, []);

  // Save new zone to database
  const saveNewZone = useCallback(async () => {
    if (!newZoneGeojson) return;

    try {
      const { error } = await supabase.from("course_zones").insert({
        name: newZoneData.name,
        zone_type: newZoneData.zone_type,
        hole_number: newZoneData.hole_number ? parseInt(newZoneData.hole_number) : null,
        turf_type: newZoneData.turf_type || null,
        acreage: newZoneData.acreage ? parseFloat(newZoneData.acreage) : null,
        geojson: newZoneGeojson,
      });

      if (error) throw error;

      // Refresh zones
      await fetchZones();
      setShowZoneForm(false);
      setNewZoneGeojson(null);
      setNewZoneData({
        name: "",
        zone_type: "green",
        hole_number: "",
        turf_type: "",
        acreage: "",
      });
    } catch (err) {
      console.error("Error saving zone:", err);
    }
  }, [newZoneGeojson, newZoneData, supabase, fetchZones]);

  // Update zone condition score
  const updateConditionScore = useCallback(async () => {
    if (!selectedZone || conditionScore === null) return;

    setUpdatingCondition(true);
    try {
      const { error } = await supabase
        .from("course_zones")
        .update({
          condition_score: conditionScore,
          last_condition_update: new Date().toISOString(),
        })
        .eq("id", selectedZone.id);

      if (error) throw error;

      await fetchZones();
      setSelectedZone((prev) =>
        prev ? { ...prev, condition_score: conditionScore, last_condition_update: new Date().toISOString() } : null
      );
    } catch (err) {
      console.error("Error updating condition:", err);
    } finally {
      setUpdatingCondition(false);
    }
  }, [selectedZone, conditionScore, supabase, fetchZones]);

  // Get zone photos count
  const getZonePhotoCount = useCallback((zoneId: string) => {
    return photos.filter((p) => p.zone_id === zoneId).length;
  }, [photos]);

  // Get last zone photo
  const getLastZonePhoto = useCallback((zoneId: string): PhotoWithUploader | undefined => {
    return photos
      .filter((p) => p.zone_id === zoneId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [photos]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      {/* Header - desktop only */}
      <div className="hidden md:block p-4 pb-2">
        <PageHeader
          title="Course Map"
          description="Interactive course overview"
          icon={Map}
        />
      </div>

      {/* Map container */}
      <div className="flex-1 relative">
        <CourseMapComponent
          zones={zones}
          tasks={activeTasks}
          photos={problemPhotos}
          editable={isSuper}
          showZones={showZones}
          showTasks={showTasks}
          showProblems={showProblems}
          selectedZoneId={selectedZone?.id}
          onZoneClick={handleZoneClick}
          onTaskClick={handleTaskClick}
          onZoneSave={handleZoneSave}
          className="w-full h-full"
        />

        {/* Layer controls - desktop */}
        <div className="hidden md:block absolute top-4 right-4 z-[1000]">
          <Card className="w-64">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4" />
                <span className="font-medium text-sm">Layers</span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showZones}
                    onChange={(e) => setShowZones(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500/30 border border-green-500 rounded-sm" />
                    <span className="text-sm">Zone Overlays</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTasks}
                    onChange={(e) => setShowTasks(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Active Tasks</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProblems}
                    onChange={(e) => setShowProblems(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span className="text-sm">Problem Areas</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer opacity-50">
                  <input
                    type="checkbox"
                    checked={showIrrigation}
                    onChange={(e) => setShowIrrigation(e.target.checked)}
                    className="rounded border-gray-300"
                    disabled
                  />
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">Irrigation Zones</span>
                    <span className="text-xs text-muted-foreground">(Coming soon)</span>
                  </div>
                </label>
              </div>

              {/* Legend */}
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Condition Legend</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-500/50 border border-green-600" />
                    <span>Excellent (8-10)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-yellow-500/50 border border-yellow-600" />
                    <span>Fair (5-7)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-red-500/50 border border-red-600" />
                    <span>Poor (1-4)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-400/50 border border-gray-500" />
                    <span>Unrated</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile layer button */}
        <button
          onClick={() => setShowLayerPanel(true)}
          className="md:hidden absolute top-4 right-4 z-[1000] bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3"
          aria-label="Toggle layers"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Mobile back button */}
        <button
          onClick={() => router.back()}
          className="md:hidden absolute top-4 left-4 z-[1000] bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3"
          aria-label="Go back"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Zone stats summary - bottom left */}
        <div className="absolute bottom-4 left-4 z-[1000]">
          <Card className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Course Overview</p>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="font-semibold">{zones.length}</span>
                  <span className="text-muted-foreground ml-1">zones</span>
                </div>
                <div>
                  <span className="font-semibold">{activeTasks.length}</span>
                  <span className="text-muted-foreground ml-1">active tasks</span>
                </div>
                <div>
                  <span className="font-semibold">{problemPhotos.length}</span>
                  <span className="text-muted-foreground ml-1">issues</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile layer panel (bottom sheet style) */}
      {showLayerPanel && (
        <div className="md:hidden fixed inset-0 z-[2000]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLayerPanel(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 pb-8 animate-in slide-in-from-bottom">
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Map Layers</h3>
              <button
                onClick={() => setShowLayerPanel(false)}
                className="p-2 -mr-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-500/30 border-2 border-green-500 rounded" />
                  <span>Zone Overlays</span>
                </div>
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={(e) => setShowZones(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer">
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-6 h-6 text-green-600" />
                  <span>Active Tasks</span>
                </div>
                <input
                  type="checkbox"
                  checked={showTasks}
                  onChange={(e) => setShowTasks(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                  <span>Problem Areas</span>
                </div>
                <input
                  type="checkbox"
                  checked={showProblems}
                  onChange={(e) => setShowProblems(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer opacity-50">
                <div className="flex items-center gap-3">
                  <Droplets className="w-6 h-6 text-blue-500" />
                  <div>
                    <span>Irrigation Zones</span>
                    <p className="text-xs text-muted-foreground">Coming soon</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showIrrigation}
                  disabled
                  className="w-5 h-5 rounded"
                />
              </label>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Condition Colors</p>
              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                <div>
                  <div className="w-full h-4 rounded bg-green-500/50 border border-green-600 mb-1" />
                  <span className="text-muted-foreground">Excellent</span>
                </div>
                <div>
                  <div className="w-full h-4 rounded bg-yellow-500/50 border border-yellow-600 mb-1" />
                  <span className="text-muted-foreground">Fair</span>
                </div>
                <div>
                  <div className="w-full h-4 rounded bg-red-500/50 border border-red-600 mb-1" />
                  <span className="text-muted-foreground">Poor</span>
                </div>
                <div>
                  <div className="w-full h-4 rounded bg-gray-400/50 border border-gray-500 mb-1" />
                  <span className="text-muted-foreground">Unrated</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone detail sheet */}
      <Sheet open={showZoneSheet} onOpenChange={setShowZoneSheet}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedZone && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {selectedZone.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Zone info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Zone Type</p>
                    <p className="font-medium capitalize">
                      {zoneTypeLabels[selectedZone.zone_type]}
                    </p>
                  </div>
                  {selectedZone.hole_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Hole</p>
                      <p className="font-medium">#{selectedZone.hole_number}</p>
                    </div>
                  )}
                  {selectedZone.turf_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Turf Type</p>
                      <p className="font-medium">{selectedZone.turf_type}</p>
                    </div>
                  )}
                  {selectedZone.acreage && (
                    <div>
                      <p className="text-xs text-muted-foreground">Acreage</p>
                      <p className="font-medium">{selectedZone.acreage} acres</p>
                    </div>
                  )}
                </div>

                {/* Condition score */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium">Condition Score</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${getConditionLabel(selectedZone.condition_score).color}`} />
                      <span className="text-lg font-bold">
                        {selectedZone.condition_score ?? "—"}
                      </span>
                      <span className="text-sm text-muted-foreground">/10</span>
                    </div>
                  </div>

                  {selectedZone.last_condition_update && (
                    <p className="text-xs text-muted-foreground">
                      Last updated: {new Date(selectedZone.last_condition_update).toLocaleDateString()}
                    </p>
                  )}

                  {/* Update condition (super only) */}
                  {isSuper && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-sm">Update Condition</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Select
                          value={conditionScore?.toString() || ""}
                          onValueChange={(v) => setConditionScore(parseInt(v))}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select score" />
                          </SelectTrigger>
                          <SelectContent>
                            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => (
                              <SelectItem key={score} value={score.toString()}>
                                {score} - {getConditionLabel(score).label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={updateConditionScore}
                          disabled={updatingCondition || conditionScore === selectedZone.condition_score}
                        >
                          {updatingCondition ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active tasks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">Active Tasks</p>
                    <span className="text-sm text-muted-foreground">
                      {taskCountsByZone[selectedZone.id] || 0}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => router.push(`/tasks?zone=${selectedZone.id}`)}
                  >
                    <span className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      View Tasks
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Recent photos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">Recent Photos</p>
                    <span className="text-sm text-muted-foreground">
                      {getZonePhotoCount(selectedZone.id)}
                    </span>
                  </div>

                  {/* Last photo thumbnail */}
                  {(() => {
                    const lastPhoto = getLastZonePhoto(selectedZone.id);
                    if (lastPhoto) {
                      return (
                        <div className="mb-2">
                          <img
                            src={lastPhoto.thumbnail_url || lastPhoto.url}
                            alt={lastPhoto.caption || "Zone photo"}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(lastPhoto.taken_at || lastPhoto.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => router.push(`/photos?zone=${selectedZone.id}`)}
                  >
                    <span className="flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      View Photos
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Zone notes */}
                {selectedZone.notes && (
                  <div>
                    <p className="font-medium mb-2">Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedZone.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* New zone form dialog */}
      {showZoneForm && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowZoneForm(false);
              setNewZoneGeojson(null);
            }}
          />
          <Card className="relative w-full max-w-md">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4">Create New Zone</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="zone-name">Zone Name</Label>
                  <Input
                    id="zone-name"
                    value={newZoneData.name}
                    onChange={(e) => setNewZoneData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Green #7"
                  />
                </div>

                <div>
                  <Label htmlFor="zone-type">Zone Type</Label>
                  <Select
                    value={newZoneData.zone_type}
                    onValueChange={(v) => setNewZoneData((prev) => ({ ...prev, zone_type: v as ZoneType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {zoneTypeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          {zoneTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="hole-number">Hole Number</Label>
                    <Input
                      id="hole-number"
                      type="number"
                      min="1"
                      max="18"
                      value={newZoneData.hole_number}
                      onChange={(e) => setNewZoneData((prev) => ({ ...prev, hole_number: e.target.value }))}
                      placeholder="1-18"
                    />
                  </div>
                  <div>
                    <Label htmlFor="acreage">Acreage</Label>
                    <Input
                      id="acreage"
                      type="number"
                      step="0.01"
                      value={newZoneData.acreage}
                      onChange={(e) => setNewZoneData((prev) => ({ ...prev, acreage: e.target.value }))}
                      placeholder="0.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="turf-type">Turf Type</Label>
                  <Input
                    id="turf-type"
                    value={newZoneData.turf_type}
                    onChange={(e) => setNewZoneData((prev) => ({ ...prev, turf_type: e.target.value }))}
                    placeholder="e.g., Bentgrass"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowZoneForm(false);
                      setNewZoneGeojson(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={saveNewZone}
                    disabled={!newZoneData.name}
                  >
                    Save Zone
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
