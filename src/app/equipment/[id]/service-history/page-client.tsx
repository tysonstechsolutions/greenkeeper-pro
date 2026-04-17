"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  DollarSign,
  Wrench,
  AlertCircle,
  Loader2,
  User,
  Gauge,
} from "lucide-react";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type {
  Equipment,
  EquipmentLog,
  EquipmentInspection,
  EquipmentServiceRecord,
  EquipmentLogType,
  InspectionType,
  InspectionStatus,
} from "@/types/database";

// ── Type & color mappings ──

const logTypeLabels: Record<EquipmentLogType, string> = {
  service: "Service",
  repair: "Repair",
  fuel: "Fuel",
  inspection: "Inspection",
  incident: "Incident",
  hours_update: "Hours Update",
};

const logTypeColors: Record<EquipmentLogType, string> = {
  service: "#3b82f6",
  repair: "#ef4444",
  fuel: "#f97316",
  inspection: "#22c55e",
  incident: "#dc2626",
  hours_update: "#6b7280",
};

const inspectionTypeLabels: Record<InspectionType, string> = {
  pre: "Pre-Op Inspection",
  post: "Post-Op Inspection",
  cleaning: "Cleaning Inspection",
};

const inspectionStatusColors: Record<InspectionStatus, string> = {
  pass: "#22c55e",
  fail: "#ef4444",
  needs_attention: "#f59e0b",
};

// ── Unified timeline entry ──

interface TimelineEntry {
  id: string;
  date: string;
  type: "service" | "log" | "inspection";
  badge: string;
  badgeColor: string;
  description: string;
  cost: number | null;
  hoursAtService: number | null;
  performedBy: string | null;
}

function toTimelineEntry(
  source: "service" | "log" | "inspection",
  record: EquipmentServiceRecord | EquipmentLog | EquipmentInspection
): TimelineEntry {
  if (source === "service") {
    const r = record as EquipmentServiceRecord;
    return {
      id: r.id,
      date: r.service_date,
      type: "service",
      badge: "Service Record",
      badgeColor: "#3b82f6",
      description: r.description,
      cost: r.cost,
      hoursAtService: r.hours_at_service,
      performedBy: r.performed_by || null,
    };
  }
  if (source === "log") {
    const r = record as EquipmentLog;
    return {
      id: r.id,
      date: r.created_at,
      type: "log",
      badge: logTypeLabels[r.log_type] || r.log_type,
      badgeColor: logTypeColors[r.log_type] || "#6b7280",
      description: r.description,
      cost: r.cost,
      hoursAtService: r.hours_at_service,
      performedBy: r.performed_by || null,
    };
  }
  // inspection
  const r = record as EquipmentInspection;
  return {
    id: r.id,
    date: r.created_at,
    type: "inspection",
    badge: inspectionTypeLabels[r.inspection_type] || "Inspection",
    badgeColor: inspectionStatusColors[r.overall_status] || "#6b7280",
    description: r.notes || `${inspectionTypeLabels[r.inspection_type]} - ${r.overall_status}`,
    cost: null,
    hoursAtService: r.engine_hours,
    performedBy: r.inspected_by || null,
  };
}

// ── Component ──

export default function RouteContent() {
  const params = useParams();
  const equipmentId = params.id as string;

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // Fetch equipment name
      const { data: eq } = await supabase
        .from("equipment")
        .select("*")
        .eq("id", equipmentId)
        .single();

      if (eq) setEquipment(eq as Equipment);

      // Fetch all three tables in parallel
      const [serviceRes, logRes, inspRes] = await Promise.all([
        supabase
          .from("equipment_service_records")
          .select("*")
          .eq("equipment_id", equipmentId),
        supabase
          .from("equipment_logs")
          .select("*")
          .eq("equipment_id", equipmentId),
        supabase
          .from("equipment_inspections")
          .select("*")
          .eq("equipment_id", equipmentId),
      ]);

      const timeline: TimelineEntry[] = [];

      if (serviceRes.data) {
        (serviceRes.data as EquipmentServiceRecord[]).forEach((r) =>
          timeline.push(toTimelineEntry("service", r))
        );
      }
      if (logRes.data) {
        (logRes.data as EquipmentLog[]).forEach((r) =>
          timeline.push(toTimelineEntry("log", r))
        );
      }
      if (inspRes.data) {
        (inspRes.data as EquipmentInspection[]).forEach((r) =>
          timeline.push(toTimelineEntry("inspection", r))
        );
      }

      // Sort newest first
      timeline.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setEntries(timeline);
    } catch (err) {
      console.error("Error fetching service history:", err);
      setError("Failed to load service history");
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Summary stats ──
  const totalServices = entries.length;
  const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0);
  const avgDaysBetween = (() => {
    if (entries.length < 2) return null;
    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalGap +=
        (new Date(sorted[i].date).getTime() -
          new Date(sorted[i - 1].date).getTime()) /
        (1000 * 60 * 60 * 24);
    }
    return Math.round(totalGap / (sorted.length - 1));
  })();

  // ── Format date ──
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="p-4 md:p-6 pb-24">
        <DetailPageHeader
          title="Service History"
          backHref={`/equipment/${equipmentId}`}
          backLabel="Back to Equipment"
        />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 pb-24">
        <DetailPageHeader
          title="Service History"
          backHref={`/equipment/${equipmentId}`}
          backLabel="Back to Equipment"
        />
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <AlertCircle className="w-8 h-8" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24">
      <DetailPageHeader
        title={equipment ? `${equipment.name} — Service History` : "Service History"}
        backHref={`/equipment/${equipmentId}`}
        backLabel="Back to Equipment"
      />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <Wrench className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{totalServices}</p>
            <p className="text-xs text-muted-foreground">Total Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">
              ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">Total Cost</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{avgDaysBetween ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Avg Days Between</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No service history yet</p>
          <p className="text-sm mt-1">Logs, service records, and inspections will appear here.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={`${entry.type}-${entry.id}`} className="relative pl-10">
                {/* Dot on timeline */}
                <div
                  className="absolute left-[11px] top-4 w-[10px] h-[10px] rounded-full border-2 border-background"
                  style={{ backgroundColor: entry.badgeColor }}
                />

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge
                        style={{ backgroundColor: entry.badgeColor }}
                        className="text-white text-xs"
                      >
                        {entry.badge}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.date)}
                      </span>
                    </div>

                    <p className="text-sm">{entry.description}</p>

                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {entry.cost != null && entry.cost > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${entry.cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {entry.hoursAtService != null && (
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {entry.hoursAtService} hrs
                        </span>
                      )}
                      {entry.performedBy && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {entry.performedBy}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
