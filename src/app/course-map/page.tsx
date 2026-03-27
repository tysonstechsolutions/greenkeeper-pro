"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Map, Layers, MapPin, AlertTriangle, Droplets, X, ChevronRight, Camera, ClipboardList, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

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
        <Map className="w-12 h-12 text-muted-foreground/20" />
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

function getConditionLabel(score: number | null): { label: string; color: string; textColor: string } {
  if (score === null) return { label: "Unrated", color: conditionColors.unrated, textColor: "text-gray-500" };
  if (score >= 8) return { label: "Excellent", color: conditionColors.excellent, textColor: "text-green-600" };
  if (score >= 5) return { label: "Fair", color: conditionColors.fair, textColor: "text-yellow-600" };
  return { label: "Poor", color: conditionColors.poor, textColor: "text-red-600" };
}

// Zone type options
const zoneTypeOptions: ZoneType[] = [
  "green", "tee", "fairway", "rough", "bunker",
  "cart_path", "practice", "clubhouse", "maintenance", "other"
];

export default function CourseMapPage() {
  const router = useRouter();
  const { isSuper } = useAuth();
  const { zones, fetchZones } = useCourseZones();
  const { tasks, fetchTasks } = useTasks();
  const { photos, fetchPhotos, getPhotoUrl, getThumbnailUrl } = usePhotos();
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("course_zones") as any).insert({
        name: newZoneData.name,
        zone_type: newZoneData.zone_type,
        hole_number: newZoneData.hole_number ? parseInt(newZoneData.hole_number) : null,
        turf_type: newZoneData.turf_type || null,
        acreage: newZoneData.acreage ? parseFloat(newZoneData.acreage) : null,
        geojson: newZoneGeojson,
      });
      if (error) throw error;
      await fetchZones();
      setShowZoneForm(false);
      setNewZoneGeojson(null);
      setNewZoneData({ name: "", zone_type: "green", hole_number: "", turf_type: "", acreage: "" });
    } catch (err) {
      console.error("Error saving zone:", err);
    }
  }, [newZoneGeojson, newZoneData, supabase, fetchZones]);

  // Update zone condition score
  const updateConditionScore = useCallback(async () => {
    if (!selectedZone || conditionScore === null) return;
    setUpdatingCondition(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("course_zones") as any)
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

  // Layer toggle component
  const LayerToggle = ({ icon: Icon, label, checked, onChange, disabled, subtext }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    subtext?: string;
  }) => (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-3 w-full p-2.5 rounded-lg transition-colors text-left ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5 cursor-pointer"
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
        checked ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {subtext && <p className="text-[11px] text-muted-foreground">{subtext}</p>}
      </div>
      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
        checked ? "bg-primary border-primary" : "border-muted-foreground/30"
      }`}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Header - desktop only */}
      <div className="hidden md:flex items-center justify-between p-4 pb-2">
        <PageHeader
          title="Course Map"
          description="Interactive course overview"
          icon={Map}
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="gk-live-dot" />
          <span className="text-xs font-medium">Live data</span>
        </div>
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

        {/* Layer controls - desktop - glassmorphism style */}
        <div className="hidden md:block absolute top-4 right-4 z-[1000]">
          <div className="gk-map-control w-64 p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
              <Layers className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Map Layers</span>
            </div>

            <div className="space-y-0.5">
              <LayerToggle icon={MapPin} label="Zone Overlays" checked={showZones} onChange={setShowZones} />
              <LayerToggle icon={ClipboardList} label="Active Tasks" checked={showTasks} onChange={setShowTasks} />
              <LayerToggle icon={AlertTriangle} label="Problem Areas" checked={showProblems} onChange={setShowProblems} />
              <LayerToggle icon={Droplets} label="Irrigation" checked={showIrrigation} onChange={setShowIrrigation} disabled subtext="Coming soon" />
            </div>

            {/* Legend */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condition</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Excellent (8-10)", color: "bg-green-500" },
                  { label: "Fair (5-7)", color: "bg-yellow-500" },
                  { label: "Poor (1-4)", color: "bg-red-500" },
                  { label: "Unrated", color: "bg-gray-400" },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={`w-2.5 h-2.5 rounded-sm ${color}/50 border border-current`} style={{ borderColor: 'transparent' }}>
                      <span className={`block w-full h-full rounded-sm ${color}/60`} />
                    </span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layer button */}
        <button
          onClick={() => setShowLayerPanel(true)}
          className="md:hidden absolute top-4 right-4 z-[1000] gk-map-control p-3"
          aria-label="Toggle layers"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Mobile back button */}
        <button
          onClick={() => router.back()}
          className="md:hidden absolute top-4 left-4 z-[1000] gk-map-control p-3"
          aria-label="Go back"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Zone stats summary - bottom left - glassmorphism */}
        <div className="absolute bottom-4 left-4 z-[1000]">
          <div className="gk-map-control p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Course Overview
            </p>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="font-bold text-foreground">{zones.length}</span>
                <span className="text-muted-foreground text-xs ml-1">zones</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div>
                <span className="font-bold text-foreground">{activeTasks.length}</span>
                <span className="text-muted-foreground text-xs ml-1">tasks</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div>
                <span className="font-bold text-foreground">{problemPhotos.length}</span>
                <span className="text-muted-foreground text-xs ml-1">issues</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile layer panel (bottom sheet style) */}
      {showLayerPanel && (
        <div className="md:hidden fixed inset-0 z-[2000]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLayerPanel(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 pb-8 animate-in slide-in-from-bottom">
            <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Map Layers</h3>
              <button onClick={() => setShowLayerPanel(false)} className="p-2 -mr-2 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <LayerToggle icon={MapPin} label="Zone Overlays" checked={showZones} onChange={setShowZones} />
              <LayerToggle icon={ClipboardList} label="Active Tasks" checked={showTasks} onChange={setShowTasks} />
              <LayerToggle icon={AlertTriangle} label="Problem Areas" checked={showProblems} onChange={setShowProblems} />
              <LayerToggle icon={Droplets} label="Irrigation Zones" checked={showIrrigation} onChange={setShowIrrigation} disabled subtext="Coming soon" />
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-semibold mb-2">Condition Colors</p>
              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                {[
                  { label: "Excellent", color: "bg-green-500" },
                  { label: "Fair", color: "bg-yellow-500" },
                  { label: "Poor", color: "bg-red-500" },
                  { label: "Unrated", color: "bg-gray-400" },
                ].map(({ label, color }) => (
                  <div key={label}>
                    <div className={`w-full h-4 rounded ${color}/50 border border-current mb-1`} style={{ borderColor: 'transparent' }}>
                      <div className={`w-full h-full rounded ${color}/60`} />
                    </div>
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
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
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  {selectedZone.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Zone info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Type</p>
                    <p className="font-semibold text-sm mt-0.5 capitalize">{zoneTypeLabels[selectedZone.zone_type]}</p>
                  </div>
                  {selectedZone.hole_number && (
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hole</p>
                      <p className="font-semibold text-sm mt-0.5">#{selectedZone.hole_number}</p>
                    </div>
                  )}
                  {selectedZone.turf_type && (
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Turf</p>
                      <p className="font-semibold text-sm mt-0.5">{selectedZone.turf_type}</p>
                    </div>
                  )}
                  {selectedZone.acreage && (
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Acreage</p>
                      <p className="font-semibold text-sm mt-0.5">{selectedZone.acreage} ac</p>
                    </div>
                  )}
                </div>

                {/* Condition score */}
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-sm">Condition Score</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        getConditionLabel(selectedZone.condition_score).textColor
                      } bg-current/10`}>
                        {getConditionLabel(selectedZone.condition_score).label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-card border-2 border-border flex items-center justify-center">
                      <span className="text-2xl font-bold">{selectedZone.condition_score ?? "—"}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (selectedZone.condition_score ?? 0) >= 8 ? "bg-green-500" :
                            (selectedZone.condition_score ?? 0) >= 5 ? "bg-yellow-500" :
                            (selectedZone.condition_score ?? 0) > 0 ? "bg-red-500" : "bg-gray-300"
                          }`}
                          style={{ width: `${((selectedZone.condition_score ?? 0) / 10) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        out of 10
                        {selectedZone.last_condition_update && (
                          <> &middot; Updated {new Date(selectedZone.last_condition_update).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Update condition (super only) */}
                  {isSuper && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <Label className="text-xs font-medium">Update Condition</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Select
                          value={conditionScore?.toString() || ""}
                          onValueChange={(v) => setConditionScore(parseInt(v))}
                        >
                          <SelectTrigger className="flex-1 h-9">
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
                          className="h-9"
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
                    <p className="font-semibold text-sm">Active Tasks</p>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {taskCountsByZone[selectedZone.id] || 0}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-10 rounded-lg"
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
                    <p className="font-semibold text-sm">Photos</p>
                    <span className="text-xs text-muted-foreground">{getZonePhotoCount(selectedZone.id)} total</span>
                  </div>

                  {(() => {
                    const lastPhoto = getLastZonePhoto(selectedZone.id);
                    if (lastPhoto) {
                      return (
                        <div className="mb-2 overflow-hidden rounded-lg">
                          <img
                            src={getThumbnailUrl(lastPhoto) || getPhotoUrl(lastPhoto)}
                            alt={lastPhoto.caption || "Zone photo"}
                            className="w-full h-36 object-cover rounded-lg hover:scale-105 transition-transform duration-300"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            {new Date(lastPhoto.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <Button
                    variant="outline"
                    className="w-full justify-between h-10 rounded-lg"
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
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="font-semibold text-sm mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedZone.notes}</p>
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowZoneForm(false); setNewZoneGeojson(null); }}
          />
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="p-6">
              <h3 className="font-bold text-lg mb-1">Create New Zone</h3>
              <p className="text-sm text-muted-foreground mb-4">Define a new zone on the course map</p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="zone-name" className="text-xs font-medium">Zone Name</Label>
                  <Input
                    id="zone-name"
                    value={newZoneData.name}
                    onChange={(e) => setNewZoneData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Green #7"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="zone-type" className="text-xs font-medium">Zone Type</Label>
                  <Select
                    value={newZoneData.zone_type}
                    onValueChange={(v) => setNewZoneData((prev) => ({ ...prev, zone_type: v as ZoneType }))}
                  >
                    <SelectTrigger className="mt-1">
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
                    <Label htmlFor="hole-number" className="text-xs font-medium">Hole Number</Label>
                    <Input
                      id="hole-number"
                      type="number"
                      min="1"
                      max="18"
                      value={newZoneData.hole_number}
                      onChange={(e) => setNewZoneData((prev) => ({ ...prev, hole_number: e.target.value }))}
                      placeholder="1-18"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="acreage" className="text-xs font-medium">Acreage</Label>
                    <Input
                      id="acreage"
                      type="number"
                      step="0.01"
                      value={newZoneData.acreage}
                      onChange={(e) => setNewZoneData((prev) => ({ ...prev, acreage: e.target.value }))}
                      placeholder="0.5"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="turf-type" className="text-xs font-medium">Turf Type</Label>
                  <Input
                    id="turf-type"
                    value={newZoneData.turf_type}
                    onChange={(e) => setNewZoneData((prev) => ({ ...prev, turf_type: e.target.value }))}
                    placeholder="e.g., Bentgrass"
                    className="mt-1"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowZoneForm(false); setNewZoneGeojson(null); }}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
