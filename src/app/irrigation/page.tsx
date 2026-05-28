"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Droplets,
  Plus,
  Play,
  Search,
  Filter,
  Calendar,
  Clock,
  Activity,
  ChevronRight,
  Loader2,
  X,
  Power,
  PowerOff,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
} from "@/lib/supabase/rest";

// ── Types ──────────────────────────────────────────────────────────────────

interface IrrigationZone {
  id: string;
  name: string;
  zone_number: number | null;
  zone_type: string;
  area: string | null;
  hole_numbers: number[] | null;
  gpm: number | null;
  head_count: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface IrrigationSchedule {
  id: string;
  zone_id: string;
  day_of_week: number[];
  start_time: string;
  run_minutes: number;
  enabled: boolean;
  season: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface IrrigationRun {
  id: string;
  zone_id: string;
  started_at: string;
  ended_at: string | null;
  run_minutes: number | null;
  gallons_used: number | null;
  run_type: string;
  skipped: boolean;
  skip_reason: string | null;
  notes: string | null;
  created_at: string;
}

// ── Constants / helpers ────────────────────────────────────────────────────

const ZONE_TYPES = ["rotor", "spray", "drip", "bubbler", "manual"] as const;
const AREAS = ["green", "tee", "fairway", "rough", "practice", "landscape", "clubhouse"] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEASONS = ["spring", "summer", "fall", "winter", "year_round"] as const;

const zoneTypeColors: Record<string, string> = {
  rotor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  spray: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  drip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  bubbler: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  manual: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
};

const areaColors: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  tee: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  fairway: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  rough: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  practice: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  landscape: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  clubhouse: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
};

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Stats summary ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Droplets;
  color: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-semibold pl-10">{value}</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function IrrigationPage() {
  const supabase = createClient();

  // Data state
  const [zones, setZones] = useState<IrrigationZone[]>([]);
  const [schedules, setSchedules] = useState<IrrigationSchedule[]>([]);
  const [runs, setRuns] = useState<IrrigationRun[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [selectedZone, setSelectedZone] = useState<IrrigationZone | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [showQuickRun, setShowQuickRun] = useState<IrrigationZone | null>(null);
  const [showScheduleView, setShowScheduleView] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Add zone form
  const [newZone, setNewZone] = useState({
    name: "",
    zone_number: "",
    zone_type: "rotor" as string,
    area: "green" as string,
    hole_numbers: "",
    gpm: "",
    head_count: "",
    notes: "",
  });

  // Add schedule form
  const [newSchedule, setNewSchedule] = useState({
    day_of_week: [] as number[],
    start_time: "05:00",
    run_minutes: "15",
    season: "year_round" as string,
    notes: "",
  });

  // Quick run form
  const [quickRunMinutes, setQuickRunMinutes] = useState("10");
  const [quickRunNotes, setQuickRunNotes] = useState("");

  // ── Data loading ─────────────────────────────────────────────────────────

  // Direct REST so the page can't wedge on a stalled supabase-js auth
  // wrapper. Three independent queries fire in parallel.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesData, schedulesData, runsData] = await Promise.all([
        directSelectList<IrrigationZone>("irrigation_zones", {
          columns: "*",
          orderBy: [{ column: "zone_number", ascending: true }],
          label: "irrigation.loadZones",
        }),
        directSelectList<IrrigationSchedule>("irrigation_schedules", {
          columns: "*",
          orderBy: [{ column: "start_time", ascending: true }],
          label: "irrigation.loadSchedules",
        }),
        directSelectList<IrrigationRun>("irrigation_runs", {
          columns: "*",
          orderBy: [{ column: "started_at", ascending: false }],
          limit: 100,
          label: "irrigation.loadRuns",
        }),
      ]);

      setZones(zonesData);
      setSchedules(schedulesData);
      setRuns(runsData);
    } catch (err) {
      console.error("Failed to load irrigation data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Computed stats ───────────────────────────────────────────────────────

  const totalZones = zones.length;
  const activeZones = zones.filter((z) => z.active).length;

  const today = new Date();
  const todayDow = today.getDay();
  const todayScheduledRuns = schedules.filter(
    (s) => s.enabled && s.day_of_week.includes(todayDow)
  ).length;

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weeklyGallons = runs
    .filter((r) => new Date(r.started_at) >= weekAgo && r.gallons_used)
    .reduce((sum, r) => sum + (r.gallons_used || 0), 0);

  // ── Filtered zones ──────────────────────────────────────────────────────

  const filteredZones = zones.filter((z) => {
    const matchSearch =
      !searchQuery ||
      z.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (z.zone_number !== null && z.zone_number.toString().includes(searchQuery));
    const matchArea = areaFilter === "all" || z.area === areaFilter;
    return matchSearch && matchArea;
  });

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleZoneActive = async (zone: IrrigationZone) => {
    const { error } = await supabase
      .from("irrigation_zones")
      .update({ active: !zone.active, updated_at: new Date().toISOString() })
      .eq("id", zone.id);
    if (!error) {
      setZones((prev) =>
        prev.map((z) => (z.id === zone.id ? { ...z, active: !z.active } : z))
      );
      if (selectedZone?.id === zone.id) {
        setSelectedZone({ ...zone, active: !zone.active });
      }
    }
  };

  const addZone = async () => {
    setActionLoading(true);
    const holes = newZone.hole_numbers
      ? newZone.hole_numbers.split(",").map((h) => parseInt(h.trim(), 10)).filter((n) => !isNaN(n))
      : null;

    try {
      await directInsertRow(
        "irrigation_zones",
        {
          name: newZone.name,
          zone_number: newZone.zone_number ? parseInt(newZone.zone_number, 10) : null,
          zone_type: newZone.zone_type,
          area: newZone.area,
          hole_numbers: holes && holes.length > 0 ? holes : null,
          gpm: newZone.gpm ? parseFloat(newZone.gpm) : null,
          head_count: newZone.head_count ? parseInt(newZone.head_count, 10) : null,
          notes: newZone.notes || null,
        },
        "irrigation.addZone",
      );
      setShowAddZone(false);
      setNewZone({
        name: "",
        zone_number: "",
        zone_type: "rotor",
        area: "green",
        hole_numbers: "",
        gpm: "",
        head_count: "",
        notes: "",
      });
      await loadData();
    } catch (err) {
      console.error("[irrigation] addZone failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const addSchedule = async () => {
    if (!selectedZone || newSchedule.day_of_week.length === 0) return;
    setActionLoading(true);

    try {
      await directInsertRow(
        "irrigation_schedules",
        {
          zone_id: selectedZone.id,
          day_of_week: newSchedule.day_of_week,
          start_time: newSchedule.start_time,
          run_minutes: parseInt(newSchedule.run_minutes, 10),
          season: newSchedule.season,
          notes: newSchedule.notes || null,
        },
        "irrigation.addSchedule",
      );
      setShowAddSchedule(false);
      setNewSchedule({
        day_of_week: [],
        start_time: "05:00",
        run_minutes: "15",
        season: "year_round",
        notes: "",
      });
      await loadData();
    } catch (err) {
      console.error("[irrigation] addSchedule failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const startQuickRun = async () => {
    if (!showQuickRun) return;
    setActionLoading(true);

    const minutes = parseInt(quickRunMinutes, 10);
    const gallons = showQuickRun.gpm ? showQuickRun.gpm * minutes : null;

    try {
      await directInsertRow(
        "irrigation_runs",
        {
          zone_id: showQuickRun.id,
          started_at: new Date().toISOString(),
          ended_at: new Date(Date.now() + minutes * 60000).toISOString(),
          run_minutes: minutes,
          gallons_used: gallons,
          run_type: "manual",
          notes: quickRunNotes || null,
        },
        "irrigation.startQuickRun",
      );
      setShowQuickRun(null);
      setQuickRunMinutes("10");
      setQuickRunNotes("");
      await loadData();
    } catch (err) {
      console.error("[irrigation] startQuickRun failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleScheduleEnabled = async (schedule: IrrigationSchedule) => {
    try {
      await directPatchRow(
        "irrigation_schedules",
        "id",
        schedule.id,
        { enabled: !schedule.enabled, updated_at: new Date().toISOString() },
        "irrigation.toggleSchedule",
      );
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? { ...s, enabled: !s.enabled } : s))
      );
    } catch (err) {
      console.error("[irrigation] toggleScheduleEnabled failed:", err);
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    try {
      await directDeleteRow(
        "irrigation_schedules",
        "id",
        scheduleId,
        "irrigation.deleteSchedule",
      );
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      console.error("[irrigation] deleteSchedule failed:", err);
    }
  };

  // ── Zone schedules and runs for detail view ──────────────────────────────

  const zoneSchedules = selectedZone
    ? schedules.filter((s) => s.zone_id === selectedZone.id)
    : [];
  const zoneRuns = selectedZone
    ? runs.filter((r) => r.zone_id === selectedZone.id).slice(0, 10)
    : [];

  // ── Schedule grid data ───────────────────────────────────────────────────

  const scheduleGridZones = zones.filter((z) => z.active);
  const scheduleGridData = scheduleGridZones.map((zone) => {
    const zoneScheds = schedules.filter(
      (s) => s.zone_id === zone.id && s.enabled
    );
    const daySlots: (IrrigationSchedule | null)[] = Array(7).fill(null);
    for (const s of zoneScheds) {
      for (const d of s.day_of_week) {
        daySlots[d] = s;
      }
    }
    return { zone, daySlots };
  });

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-6">
        <PageHeader
          title="Irrigation"
          description="Zone management and schedules"
          icon={Droplets}
        />
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <PageHeader
        title="Irrigation"
        description="Zone management and schedules"
        icon={Droplets}
      >
        <Link
          href="/irrigation/map"
          className="inline-flex items-center justify-center gap-1.5 h-10 rounded-md px-4 text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          <MapPin className="w-4 h-4" />
          <span className="hidden sm:inline">Sprinkler Map</span>
        </Link>
        <Button
          size="sm"
          variant={showScheduleView ? "default" : "outline"}
          onClick={() => setShowScheduleView(!showScheduleView)}
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden sm:inline">Schedule</span>
        </Button>
        <Button size="sm" onClick={() => setShowAddZone(true)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Zone</span>
        </Button>
      </PageHeader>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Zones"
          value={totalZones}
          icon={Droplets}
          color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <StatCard
          label="Active"
          value={activeZones}
          icon={Power}
          color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
        />
        <StatCard
          label="Today's Runs"
          value={todayScheduledRuns}
          icon={Clock}
          color="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
        />
        <StatCard
          label="Weekly Gal."
          value={weeklyGallons > 0 ? weeklyGallons.toLocaleString() : "0"}
          icon={Activity}
          color="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
        />
      </div>

      {/* ── Schedule grid view ─────────────────────────────────────────────── */}
      {showScheduleView && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-3 text-sm">Weekly Schedule Grid</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground min-w-[120px]">
                      Zone
                    </th>
                    {DAYS.map((d) => (
                      <th
                        key={d}
                        className={`text-center p-2 font-medium min-w-[60px] ${
                          DAYS.indexOf(d) === todayDow
                            ? "text-primary font-bold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleGridData.map(({ zone, daySlots }) => (
                    <tr key={zone.id} className="border-t">
                      <td className="p-2 font-medium truncate max-w-[140px]">
                        {zone.name}
                      </td>
                      {daySlots.map((sched, di) => (
                        <td key={di} className="p-1 text-center">
                          {sched ? (
                            <div
                              className={`rounded px-1 py-0.5 text-[10px] leading-tight ${
                                di === todayDow
                                  ? "bg-primary/20 text-primary font-medium"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {formatTime(sched.start_time)}
                              <br />
                              {sched.run_minutes}m
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">--</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {scheduleGridData.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center p-6 text-muted-foreground"
                      >
                        No active zones with schedules
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search zones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {AREAS.map((a) => (
              <SelectItem key={a} value={a}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Zone list / detail split ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: zone list */}
        <div className={`space-y-2 ${selectedZone ? "lg:col-span-1" : "lg:col-span-3"}`}>
          {filteredZones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
              className={`w-full text-left bg-card rounded-lg border p-3 transition-all hover:shadow-sm ${
                selectedZone?.id === zone.id
                  ? "ring-2 ring-primary border-primary"
                  : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{zone.name}</span>
                      {!zone.active && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          OFF
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 border-0 ${zoneTypeColors[zone.zone_type] || ""}`}
                      >
                        {zone.zone_type}
                      </Badge>
                      {zone.area && (
                        <Badge
                          className={`text-[10px] px-1.5 py-0 border-0 ${areaColors[zone.area] || ""}`}
                        >
                          {zone.area}
                        </Badge>
                      )}
                      {zone.gpm && (
                        <span className="text-[10px] text-muted-foreground">
                          {zone.gpm} GPM
                        </span>
                      )}
                      {zone.head_count && (
                        <span className="text-[10px] text-muted-foreground">
                          {zone.head_count} heads
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuickRun(zone);
                    }}
                    title="Quick run"
                  >
                    <Play className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </button>
          ))}
          {filteredZones.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No zones found
            </div>
          )}
        </div>

        {/* Right: zone detail */}
        {selectedZone && (
          <div className="lg:col-span-2 space-y-4">
            {/* Zone info card */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedZone.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        className={`text-xs border-0 ${zoneTypeColors[selectedZone.zone_type] || ""}`}
                      >
                        {selectedZone.zone_type}
                      </Badge>
                      {selectedZone.area && (
                        <Badge
                          className={`text-xs border-0 ${areaColors[selectedZone.area] || ""}`}
                        >
                          {selectedZone.area}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedZone.active ? "Active" : "Inactive"}
                    </span>
                    <Switch
                      checked={selectedZone.active}
                      onCheckedChange={() => toggleZoneActive(selectedZone)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Zone #</p>
                    <p className="font-medium">{selectedZone.zone_number ?? "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GPM</p>
                    <p className="font-medium">{selectedZone.gpm ?? "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Heads</p>
                    <p className="font-medium">{selectedZone.head_count ?? "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Holes</p>
                    <p className="font-medium">
                      {selectedZone.hole_numbers?.join(", ") || "--"}
                    </p>
                  </div>
                </div>

                {selectedZone.notes && (
                  <p className="text-xs text-muted-foreground mt-3 border-t pt-2">
                    {selectedZone.notes}
                  </p>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <Button
                    size="xs"
                    onClick={() => setShowQuickRun(selectedZone)}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Quick Run
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setShowAddSchedule(true)}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Add Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Schedules */}
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold text-sm mb-3">Schedules</h4>
                {zoneSchedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No schedules configured
                  </p>
                ) : (
                  <div className="space-y-2">
                    {zoneSchedules.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          s.enabled ? "border-border" : "border-border opacity-50"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatTime(s.start_time)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.run_minutes} min
                            </span>
                            {s.season && s.season !== "year_round" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {s.season}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 mt-1">
                            {DAYS.map((d, i) => (
                              <span
                                key={d}
                                className={`text-[10px] w-6 text-center rounded ${
                                  s.day_of_week.includes(i)
                                    ? "bg-primary/20 text-primary font-medium"
                                    : "text-muted-foreground/40"
                                }`}
                              >
                                {d.charAt(0)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch
                            size="sm"
                            checked={s.enabled}
                            onCheckedChange={() => toggleScheduleEnabled(s)}
                          />
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => deleteSchedule(s.id)}
                          >
                            <X className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent runs */}
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold text-sm mb-3">Recent Runs</h4>
                {zoneRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No run history
                  </p>
                ) : (
                  <div className="space-y-1">
                    {zoneRuns.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between py-2 border-b last:border-0 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {r.skipped ? (
                            <PowerOff className="w-3.5 h-3.5 text-orange-500" />
                          ) : (
                            <Droplets className="w-3.5 h-3.5 text-blue-500" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(r.started_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {r.run_type}
                          </Badge>
                          {r.run_minutes && (
                            <span className="text-xs">{r.run_minutes}m</span>
                          )}
                          {r.gallons_used && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(r.gallons_used)} gal
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Add Zone Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Irrigation Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Zone name (e.g., Green 1)"
              value={newZone.name}
              onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Zone #"
                type="number"
                value={newZone.zone_number}
                onChange={(e) =>
                  setNewZone({ ...newZone, zone_number: e.target.value })
                }
              />
              <Select
                value={newZone.zone_type}
                onValueChange={(v) => setNewZone({ ...newZone, zone_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select
              value={newZone.area}
              onValueChange={(v) => setNewZone({ ...newZone, area: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <Input
                placeholder="GPM"
                type="number"
                step="0.1"
                value={newZone.gpm}
                onChange={(e) => setNewZone({ ...newZone, gpm: e.target.value })}
              />
              <Input
                placeholder="Heads"
                type="number"
                value={newZone.head_count}
                onChange={(e) =>
                  setNewZone({ ...newZone, head_count: e.target.value })
                }
              />
              <Input
                placeholder="Holes (1,2,3)"
                value={newZone.hole_numbers}
                onChange={(e) =>
                  setNewZone({ ...newZone, hole_numbers: e.target.value })
                }
              />
            </div>
            <Input
              placeholder="Notes (optional)"
              value={newZone.notes}
              onChange={(e) => setNewZone({ ...newZone, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddZone(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addZone}
              disabled={!newZone.name || actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Schedule Dialog ────────────────────────────────────────────── */}
      <Dialog open={showAddSchedule} onOpenChange={setShowAddSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add Schedule {selectedZone ? `- ${selectedZone.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Days of week</p>
              <div className="flex gap-1">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => {
                      const dow = newSchedule.day_of_week.includes(i)
                        ? newSchedule.day_of_week.filter((x) => x !== i)
                        : [...newSchedule.day_of_week, i];
                      setNewSchedule({ ...newSchedule, day_of_week: dow });
                    }}
                    className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                      newSchedule.day_of_week.includes(i)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Start time</p>
                <Input
                  type="time"
                  value={newSchedule.start_time}
                  onChange={(e) =>
                    setNewSchedule({ ...newSchedule, start_time: e.target.value })
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Run minutes</p>
                <Input
                  type="number"
                  value={newSchedule.run_minutes}
                  onChange={(e) =>
                    setNewSchedule({ ...newSchedule, run_minutes: e.target.value })
                  }
                />
              </div>
            </div>
            <Select
              value={newSchedule.season}
              onValueChange={(v) =>
                setNewSchedule({ ...newSchedule, season: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {SEASONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "year_round"
                      ? "Year Round"
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Notes (optional)"
              value={newSchedule.notes}
              onChange={(e) =>
                setNewSchedule({ ...newSchedule, notes: e.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddSchedule(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addSchedule}
              disabled={
                newSchedule.day_of_week.length === 0 || actionLoading
              }
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Run Dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={!!showQuickRun}
        onOpenChange={(open) => !open && setShowQuickRun(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Quick Run {showQuickRun ? `- ${showQuickRun.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Run minutes</p>
              <Input
                type="number"
                value={quickRunMinutes}
                onChange={(e) => setQuickRunMinutes(e.target.value)}
              />
            </div>
            {showQuickRun?.gpm && (
              <p className="text-xs text-muted-foreground">
                Estimated water use:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(
                    showQuickRun.gpm * parseInt(quickRunMinutes || "0", 10)
                  ).toLocaleString()}{" "}
                  gallons
                </span>{" "}
                ({showQuickRun.gpm} GPM x {quickRunMinutes || 0} min)
              </p>
            )}
            <Input
              placeholder="Notes (optional)"
              value={quickRunNotes}
              onChange={(e) => setQuickRunNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowQuickRun(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={startQuickRun}
              disabled={!quickRunMinutes || actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Play className="w-4 h-4" />
              Start Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
