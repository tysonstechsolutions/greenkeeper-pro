"use client";

import { useCallback, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Equipment,
  EquipmentLog,
  EquipmentType,
  EquipmentStatus,
  EquipmentLogType,
  PartUsed,
  EquipmentInspection,
  InspectionChecklistItem,
  EquipmentCondition,
  FuelType,
  InspectionType,
  InspectionStatus,
} from "@/types/database";

// Utility label maps
export const equipmentTypeLabels: Record<EquipmentType, string> = {
  mower_reel: "Reel Mower",
  mower_rotary: "Rotary Mower",
  mower_rough: "Rough Mower",
  aerator: "Aerator",
  sprayer: "Sprayer",
  topdresser: "Topdresser",
  utility_vehicle: "Utility Vehicle",
  tractor: "Tractor",
  blower: "Blower",
  trimmer: "Trimmer",
  chainsaw: "Chainsaw",
  roller: "Roller",
  seeder: "Seeder",
  hand_tool: "Hand Tool",
  pump: "Pump",
  other: "Other",
};

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  operational: "Operational",
  needs_service: "Needs Service",
  in_repair: "In Repair",
  out_of_service: "Out of Service",
  retired: "Retired",
};

export const equipmentStatusColors: Record<EquipmentStatus, string> = {
  operational: "#22c55e", // green-500
  needs_service: "#eab308", // yellow-500
  in_repair: "#f97316", // orange-500
  out_of_service: "#ef4444", // red-500
  retired: "#6b7280", // gray-500
};

export const logTypeLabels: Record<EquipmentLogType, string> = {
  service: "Service",
  repair: "Repair",
  fuel: "Fuel",
  inspection: "Inspection",
  incident: "Incident",
  hours_update: "Hours Update",
};

export const logTypeColors: Record<EquipmentLogType, string> = {
  service: "#3b82f6", // blue-500
  repair: "#ef4444", // red-500
  fuel: "#f97316", // orange-500
  inspection: "#22c55e", // green-500
  incident: "#dc2626", // red-600
  hours_update: "#6b7280", // gray-500
};

export const conditionStatusLabels: Record<EquipmentCondition, string> = {
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs Repair",
  beyond_repair: "Beyond Repair",
  unknown: "Unknown",
};

export const conditionStatusColors: Record<EquipmentCondition, string> = {
  good: "#22c55e", // green-500
  fair: "#eab308", // yellow-500
  needs_repair: "#f97316", // orange-500
  beyond_repair: "#ef4444", // red-500
  unknown: "#6b7280", // gray-500
};

export const fuelTypeLabels: Record<FuelType, string> = {
  gasoline: "Gasoline",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
  manual: "Manual/None",
  other: "Other",
};

// Checklist template type (for defining available checklist items)
export interface ChecklistTemplate {
  id: string;
  text: string;
}

// Pre-operation checklist items by equipment type category
export const preOpChecklists: Record<string, ChecklistTemplate[]> = {
  mower: [
    { id: "oil", text: "Check oil level" },
    { id: "fuel", text: "Check fuel level" },
    { id: "blades", text: "Inspect cutting blades/reels for damage" },
    { id: "belts", text: "Check belts for wear and tension" },
    { id: "tires", text: "Check tire pressure" },
    { id: "safety", text: "Test safety features (kill switch, seat switch)" },
    { id: "leaks", text: "Check for fluid leaks" },
    { id: "clip_rate", text: "Verify clip rate/height of cut" },
    { id: "grass_catchers", text: "Inspect grass catchers/baskets" },
  ],
  sprayer: [
    { id: "tank", text: "Check tank condition and cleanliness" },
    { id: "nozzles", text: "Inspect nozzles for wear/clogging" },
    { id: "pressure", text: "Test pressure gauge and pump" },
    { id: "hoses", text: "Check hoses for cracks or leaks" },
    { id: "filters", text: "Inspect and clean filters" },
    { id: "calibration", text: "Verify calibration settings" },
    { id: "agitation", text: "Test agitation system" },
    { id: "boom", text: "Check boom condition and alignment" },
  ],
  vehicle: [
    { id: "fluids", text: "Check all fluid levels (oil, coolant, brake)" },
    { id: "tires", text: "Inspect tires and pressure" },
    { id: "brakes", text: "Test brakes" },
    { id: "lights", text: "Check all lights and signals" },
    { id: "steering", text: "Test steering responsiveness" },
    { id: "horn", text: "Test horn" },
    { id: "mirrors", text: "Adjust and clean mirrors" },
    { id: "seatbelt", text: "Check seatbelt condition" },
  ],
  aerator: [
    { id: "tines", text: "Inspect tines for wear or damage" },
    { id: "depth", text: "Check depth setting mechanism" },
    { id: "hydraulics", text: "Test hydraulic system" },
    { id: "spacing", text: "Verify tine spacing" },
    { id: "drive", text: "Check drive system" },
  ],
  general: [
    { id: "visual", text: "Visual inspection for damage" },
    { id: "guards", text: "Check safety guards in place" },
    { id: "controls", text: "Test all controls" },
    { id: "fasteners", text: "Check for loose fasteners" },
    { id: "clean", text: "Equipment is clean and ready" },
  ],
};

// Pre-inspection checklist
export const preInspectionChecklist: ChecklistTemplate[] = [
  { id: "engine_hours", text: "Record engine hours" },
  { id: "oil_level", text: "Check oil level" },
  { id: "fuel_level", text: "Check fuel level" },
  { id: "coolant", text: "Check coolant level" },
  { id: "hydraulic_fluid", text: "Check hydraulic fluid" },
  { id: "tire_pressure", text: "Check tire pressure/tracks" },
  { id: "lights", text: "Test all lights (headlights, tail, turn signals)" },
  { id: "horn", text: "Test horn/backup alarm" },
  { id: "safety_devices", text: "Test safety shutoffs and kill switch" },
  { id: "belts_hoses", text: "Inspect belts and hoses" },
  { id: "leaks", text: "Check for fluid leaks" },
  { id: "blades_cutting", text: "Inspect cutting units/blades" },
  { id: "guards_shields", text: "Check guards and safety shields" },
  { id: "mirrors", text: "Clean and adjust mirrors" },
  { id: "brakes", text: "Test brakes" },
  { id: "steering", text: "Check steering response" },
  { id: "damage_body", text: "Check for body damage or dents" },
  { id: "cleanliness", text: "General cleanliness check" },
];

// Post-inspection checklist
export const postInspectionChecklist: ChecklistTemplate[] = [
  { id: "clean_exterior", text: "Clean exterior/wash down" },
  { id: "clean_deck", text: "Clean mowing deck/attachments" },
  { id: "blow_off", text: "Blow off debris from engine area" },
  { id: "check_damage", text: "Check for new damage" },
  { id: "fluid_leaks", text: "Check for fluid leaks after use" },
  { id: "engine_hours_final", text: "Record final engine hours" },
  { id: "fuel_up", text: "Refuel if below half tank" },
  { id: "park_properly", text: "Park in designated area" },
  { id: "report_issues", text: "Report any issues found during use" },
];

// Cleaning checklist
export const cleaningChecklist: ChecklistTemplate[] = [
  { id: "wash_exterior", text: "Wash entire exterior" },
  { id: "clean_engine", text: "Clean engine compartment" },
  { id: "clean_undercarriage", text: "Clean undercarriage" },
  { id: "clean_cab", text: "Clean operator station/cab" },
  { id: "grease_points", text: "Grease all fittings" },
  { id: "sharpen_blades", text: "Sharpen/check blade condition" },
  { id: "air_filter", text: "Clean/replace air filter" },
];

// Map equipment types to checklist categories
export function getChecklistCategory(equipmentType: EquipmentType): string {
  switch (equipmentType) {
    case "mower_reel":
    case "mower_rotary":
    case "mower_rough":
      return "mower";
    case "sprayer":
      return "sprayer";
    case "utility_vehicle":
    case "tractor":
      return "vehicle";
    case "aerator":
      return "aerator";
    default:
      return "general";
  }
}

export interface EquipmentFilters {
  type?: EquipmentType;
  status?: EquipmentStatus;
  search?: string;
}

export interface EquipmentStats {
  operational: number;
  needs_service: number;
  in_repair: number;
  out_of_service: number;
  total: number;
}

export interface CreateEquipmentData {
  name: string;
  equipment_type: EquipmentType;
  make?: string;
  model?: string;
  year?: number;
  serial_number?: string;
  asset_tag?: string;
  status?: EquipmentStatus;
  current_hours?: number;
  service_interval_hours?: number;
  next_service_due_hours?: number;
  next_service_due_date?: string;
  location?: string;
  purchase_date?: string;
  purchase_price?: number;
  notes?: string;
  photo_url?: string;
}

export interface CreateLogData {
  log_type: EquipmentLogType;
  description: string;
  hours_at_service?: number;
  cost?: number;
  parts_used?: PartUsed[];
  vendor?: string;
  downtime_hours?: number;
  photos?: string[];
}

export interface CreateInspectionData {
  equipment_id: string;
  inspection_type: InspectionType;
  condition_status: EquipmentCondition;
  notes?: string;
  checklist_items?: Record<string, boolean>;
  photos?: string[];
  inspector_id?: string;
}

export interface EquipmentWithLogs extends Equipment {
  logs?: EquipmentLog[];
}

interface UseEquipmentReturn {
  equipment: Equipment[];
  loading: boolean;
  error: string | null;
  fetchEquipment: (filters?: EquipmentFilters) => Promise<Equipment[]>;
  fetchEquipmentItem: (id: string) => Promise<EquipmentWithLogs | null>;
  createEquipment: (data: CreateEquipmentData) => Promise<Equipment | null>;
  updateEquipment: (id: string, data: Partial<Equipment>) => Promise<Equipment | null>;
  deleteEquipment: (id: string) => Promise<boolean>;
  updateHours: (id: string, newHours: number) => Promise<Equipment | null>;
  retireEquipment: (id: string) => Promise<Equipment | null>;
  fetchEquipmentLogs: (equipmentId: string) => Promise<EquipmentLog[]>;
  createLog: (equipmentId: string, logData: CreateLogData) => Promise<EquipmentLog | null>;
  fetchDueForService: () => Promise<Equipment[]>;
  fetchEquipmentStats: () => Promise<EquipmentStats>;
  uploadEquipmentPhoto: (file: File, equipmentId: string) => Promise<string | null>;
  deleteEquipmentPhoto: (photoUrl: string, equipmentId: string) => Promise<boolean>;
  createInspection: (data: CreateInspectionData) => Promise<EquipmentInspection | null>;
  fetchInspections: (equipmentId: string) => Promise<EquipmentInspection[]>;
  fetchLatestInspection: (equipmentId: string, type: InspectionType) => Promise<EquipmentInspection | null>;
  refetch: () => Promise<void>;
}

export function useEquipment(): UseEquipmentReturn {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  /**
   * Fetch equipment with optional filters
   */
  const fetchEquipment = useCallback(
    async (filters?: EquipmentFilters): Promise<Equipment[]> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase.from("equipment") as any)
          .select("*")
          .neq("status", "retired")
          .order("name", { ascending: true })
          .limit(100); // Limit equipment list

        if (filters?.type) {
          query = query.eq("equipment_type", filters.type);
        }

        if (filters?.status) {
          query = query.eq("status", filters.status);
        }

        if (filters?.search) {
          const searchTerm = `%${filters.search}%`;
          query = query.or(
            `name.ilike.${searchTerm},make.ilike.${searchTerm},model.ilike.${searchTerm}`
          );
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        const items = (data as Equipment[]) || [];
        setEquipment(items);
        return items;
      } catch (err) {
        console.error("Error fetching equipment:", err);
        const message = err instanceof Error ? err.message : "Failed to fetch equipment";
        setError(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Fetch single equipment item with full details
   */
  const fetchEquipmentItem = useCallback(
    async (id: string): Promise<EquipmentWithLogs | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase.from("equipment") as any)
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Fetch logs separately
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: logsData } = await (supabase.from("equipment_logs") as any)
          .select("*")
          .eq("equipment_id", id)
          .order("created_at", { ascending: false });

        const item = data as Equipment;
        return {
          ...item,
          logs: (logsData as EquipmentLog[]) || [],
        };
      } catch (err) {
        console.error("Error fetching equipment item:", err);
        const message = err instanceof Error ? err.message : "Failed to fetch equipment";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Create new equipment
   */
  const createEquipment = useCallback(
    async (data: CreateEquipmentData): Promise<Equipment | null> => {
      setError(null);

      try {
        // Calculate next_service_due_hours if not provided
        const nextServiceHours =
          data.next_service_due_hours ??
          (data.current_hours !== undefined && data.service_interval_hours !== undefined
            ? data.current_hours + data.service_interval_hours
            : undefined);

        const insertData = {
          ...data,
          status: data.status || "operational",
          next_service_due_hours: nextServiceHours,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newEquipment, error: insertError } = await (supabase.from("equipment") as any)
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        // Update local state
        setEquipment((prev) => [...prev, newEquipment as Equipment]);
        return newEquipment as Equipment;
      } catch (err) {
        console.error("Error creating equipment:", err);
        const message = err instanceof Error ? err.message : "Failed to create equipment";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Update equipment fields
   */
  const updateEquipment = useCallback(
    async (id: string, data: Partial<Equipment>): Promise<Equipment | null> => {
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase.from("equipment") as any)
          .update(data)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setEquipment((prev) =>
          prev.map((item) => (item.id === id ? (updated as Equipment) : item))
        );
        return updated as Equipment;
      } catch (err) {
        console.error("Error updating equipment:", err);
        const message = err instanceof Error ? err.message : "Failed to update equipment";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Update hours and recalculate next service due
   */
  const updateHours = useCallback(
    async (id: string, newHours: number): Promise<Equipment | null> => {
      setError(null);

      try {
        // First get the equipment to calculate new service due
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: currentEquipment, error: fetchError } = await (supabase.from("equipment") as any)
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        const current = currentEquipment as Equipment;

        // Calculate next service due based on service interval
        const nextServiceDueHours = current.next_service_due_hours;
        if (current.service_interval_hours && current.next_service_due_hours) {
          // If we've passed the service due point, calculate new one from current hours
          if (newHours >= current.next_service_due_hours) {
            // Keep the existing next_service_due_hours - they need to do service first
          }
        }

        const updateData: Partial<Equipment> = {
          current_hours: newHours,
        };

        // Check if status should change to needs_service
        if (nextServiceDueHours && newHours >= nextServiceDueHours && current.status === "operational") {
          updateData.status = "needs_service";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase.from("equipment") as any)
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Create hours_update log entry
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("equipment_logs") as any).insert({
          equipment_id: id,
          log_type: "hours_update",
          description: `Hours updated from ${current.current_hours ?? 0} to ${newHours}`,
          hours_at_service: newHours,
          parts_used: [],
          photos: [],
        });

        // Update local state
        setEquipment((prev) =>
          prev.map((item) => (item.id === id ? (updated as Equipment) : item))
        );
        return updated as Equipment;
      } catch (err) {
        console.error("Error updating hours:", err);
        const message = err instanceof Error ? err.message : "Failed to update hours";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Retire equipment
   */
  const retireEquipment = useCallback(
    async (id: string): Promise<Equipment | null> => {
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase.from("equipment") as any)
          .update({ status: "retired" })
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Remove from local state (retired items hidden by default)
        setEquipment((prev) => prev.filter((item) => item.id !== id));
        return updated as Equipment;
      } catch (err) {
        console.error("Error retiring equipment:", err);
        const message = err instanceof Error ? err.message : "Failed to retire equipment";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Fetch maintenance logs for an equipment item
   */
  const fetchEquipmentLogs = useCallback(
    async (equipmentId: string): Promise<EquipmentLog[]> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase.from("equipment_logs") as any)
          .select("*")
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false })
          .limit(50); // Limit logs per equipment

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        return (data as EquipmentLog[]) || [];
      } catch (err) {
        console.error("Error fetching equipment logs:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Create a log entry for equipment
   */
  const createLog = useCallback(
    async (equipmentId: string, logData: CreateLogData): Promise<EquipmentLog | null> => {
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newLog, error: insertError } = await (supabase.from("equipment_logs") as any)
          .insert({
            equipment_id: equipmentId,
            log_type: logData.log_type,
            description: logData.description,
            hours_at_service: logData.hours_at_service,
            cost: logData.cost,
            parts_used: logData.parts_used || [],
            vendor: logData.vendor,
            downtime_hours: logData.downtime_hours,
            photos: logData.photos || [],
          })
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        // If this is a service log, update next service due hours
        if (logData.log_type === "service") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: equipmentData } = await (supabase.from("equipment") as any)
            .select("*")
            .eq("id", equipmentId)
            .single();

          if (equipmentData) {
            const eq = equipmentData as Equipment;
            const currentHours = logData.hours_at_service ?? eq.current_hours ?? 0;
            const interval = eq.service_interval_hours;

            if (interval) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from("equipment") as any)
                .update({
                  next_service_due_hours: currentHours + interval,
                  status: "operational",
                  current_hours: currentHours,
                })
                .eq("id", equipmentId);
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from("equipment") as any)
                .update({ status: "operational" })
                .eq("id", equipmentId);
            }
          }
        }

        return newLog as EquipmentLog;
      } catch (err) {
        console.error("Error creating log:", err);
        const message = err instanceof Error ? err.message : "Failed to create log";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Fetch all equipment due for service
   */
  const fetchDueForService = useCallback(async (): Promise<Equipment[]> => {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Get equipment where current_hours >= next_service_due_hours
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: hoursDue, error: hoursError } = await (supabase.from("equipment") as any)
        .select("*")
        .neq("status", "retired")
        .not("current_hours", "is", null)
        .not("next_service_due_hours", "is", null);

      if (hoursError) {
        throw new Error(hoursError.message);
      }

      // Filter for hours-based service due
      const hoursDueFiltered = ((hoursDue as Equipment[]) || []).filter(
        (eq: Equipment) =>
          eq.current_hours !== null &&
          eq.next_service_due_hours !== null &&
          eq.current_hours >= eq.next_service_due_hours
      );

      // Get equipment where next_service_due_date <= today
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dateDue, error: dateError } = await (supabase.from("equipment") as any)
        .select("*")
        .neq("status", "retired")
        .not("next_service_due_date", "is", null)
        .lte("next_service_due_date", today);

      if (dateError) {
        throw new Error(dateError.message);
      }

      // Combine and deduplicate
      const combined = [...hoursDueFiltered, ...((dateDue as Equipment[]) || [])];
      const uniqueMap = new Map<string, Equipment>();
      combined.forEach((eq) => uniqueMap.set(eq.id, eq));

      return Array.from(uniqueMap.values());
    } catch (err) {
      console.error("Error fetching due for service:", err);
      return [];
    }
  }, [supabase]);

  /**
   * Fetch equipment stats by status
   */
  const fetchEquipmentStats = useCallback(async (): Promise<EquipmentStats> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase.from("equipment") as any)
        .select("status")
        .neq("status", "retired");

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const items = (data as { status: EquipmentStatus }[]) || [];
      const stats: EquipmentStats = {
        operational: 0,
        needs_service: 0,
        in_repair: 0,
        out_of_service: 0,
        total: items.length,
      };

      items.forEach((item) => {
        if (item.status in stats && item.status !== "retired") {
          stats[item.status as keyof Omit<EquipmentStats, "total">]++;
        }
      });

      return stats;
    } catch (err) {
      console.error("Error fetching equipment stats:", err);
      return {
        operational: 0,
        needs_service: 0,
        in_repair: 0,
        out_of_service: 0,
        total: 0,
      };
    }
  }, [supabase]);

  /**
   * Delete equipment record
   */
  const deleteEquipment = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase.from("equipment") as any)
          .delete()
          .eq("id", id);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Remove from local state
        setEquipment((prev) => prev.filter((item) => item.id !== id));
        return true;
      } catch (err) {
        console.error("Error deleting equipment:", err);
        const message = err instanceof Error ? err.message : "Failed to delete equipment";
        setError(message);
        return false;
      }
    },
    [supabase]
  );

  /**
   * Upload equipment photo to storage
   */
  const uploadEquipmentPhoto = useCallback(
    async (file: File, equipmentId: string): Promise<string | null> => {
      setError(null);

      try {
        const timestamp = Date.now();
        const filename = `${timestamp}-${file.name}`;
        const filePath = `equipment/${equipmentId}/${filename}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: uploadError, data } = await (supabase.storage.from("photos") as any)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        // Get public URL for the uploaded file
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: publicUrlData } = (supabase.storage.from("photos") as any)
          .getPublicUrl(filePath);

        return publicUrlData?.publicUrl || null;
      } catch (err) {
        console.error("Error uploading photo:", err);
        const message = err instanceof Error ? err.message : "Failed to upload photo";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Delete equipment photo from storage and update equipment record
   */
  const deleteEquipmentPhoto = useCallback(
    async (photoUrl: string, equipmentId: string): Promise<boolean> => {
      setError(null);

      try {
        // Extract file path from URL
        const urlParts = photoUrl.split("/");
        const filename = urlParts[urlParts.length - 1];
        const filePath = `equipment/${equipmentId}/${filename}`;

        // Delete from storage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase.storage.from("photos") as any)
          .remove([filePath]);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Update equipment record to remove photo from photos array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: currentData } = await (supabase.from("equipment") as any)
          .select("photos")
          .eq("id", equipmentId)
          .single();

        if (currentData) {
          const photos = (currentData.photos as string[]) || [];
          const updatedPhotos = photos.filter((url) => url !== photoUrl);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("equipment") as any)
            .update({ photos: updatedPhotos })
            .eq("id", equipmentId);
        }

        return true;
      } catch (err) {
        console.error("Error deleting photo:", err);
        const message = err instanceof Error ? err.message : "Failed to delete photo";
        setError(message);
        return false;
      }
    },
    [supabase]
  );

  /**
   * Create equipment inspection record
   */
  const createInspection = useCallback(
    async (data: CreateInspectionData): Promise<EquipmentInspection | null> => {
      setError(null);

      try {
        const inspectionData = {
          equipment_id: data.equipment_id,
          inspection_type: data.inspection_type,
          condition_status: data.condition_status,
          notes: data.notes,
          checklist_items: data.checklist_items || {},
          photos: data.photos || [],
          inspector_id: data.inspector_id,
          status: "completed" as InspectionStatus,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newInspection, error: insertError } = await (supabase.from("equipment_inspections") as any)
          .insert(inspectionData)
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        return newInspection as EquipmentInspection;
      } catch (err) {
        console.error("Error creating inspection:", err);
        const message = err instanceof Error ? err.message : "Failed to create inspection";
        setError(message);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Fetch inspections for equipment
   */
  const fetchInspections = useCallback(
    async (equipmentId: string): Promise<EquipmentInspection[]> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase.from("equipment_inspections") as any)
          .select("*")
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false });

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        return (data as EquipmentInspection[]) || [];
      } catch (err) {
        console.error("Error fetching inspections:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Fetch latest inspection of a specific type for equipment
   */
  const fetchLatestInspection = useCallback(
    async (equipmentId: string, type: InspectionType): Promise<EquipmentInspection | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase.from("equipment_inspections") as any)
          .select("*")
          .eq("equipment_id", equipmentId)
          .eq("inspection_type", type)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          // PGRST116 = no rows returned, which is expected
          throw new Error(fetchError.message);
        }

        return (data as EquipmentInspection) || null;
      } catch (err) {
        console.error("Error fetching latest inspection:", err);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Refetch equipment list
   */
  const refetch = useCallback(async () => {
    await fetchEquipment();
  }, [fetchEquipment]);

  // Initial fetch
  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  return {
    equipment,
    loading,
    error,
    fetchEquipment,
    fetchEquipmentItem,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    updateHours,
    retireEquipment,
    fetchEquipmentLogs,
    createLog,
    fetchDueForService,
    fetchEquipmentStats,
    uploadEquipmentPhoto,
    deleteEquipmentPhoto,
    createInspection,
    fetchInspections,
    fetchLatestInspection,
    refetch,
  };
}
