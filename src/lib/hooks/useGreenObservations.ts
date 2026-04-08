"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  GreenObservation,
  GreenIssueType,
  GreenObservationStatus,
  TaskPriority,
  AreaPoint,
} from "@/types/database";

// Re-export shared constants
export { greenIssueTypeLabels, greenIssueTypeIcons } from "@/lib/green-constants";

export const greenStatusLabels: Record<GreenObservationStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  monitoring: "Monitoring",
};

export const greenStatusColors: Record<GreenObservationStatus, { bg: string; text: string }> = {
  open: { bg: "bg-red-100", text: "text-red-700" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700" },
  resolved: { bg: "bg-green-100", text: "text-green-700" },
  monitoring: { bg: "bg-blue-100", text: "text-blue-700" },
};

export const greenPriorityLabels: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const greenPriorityColors: Record<TaskPriority, { bg: string; text: string; pin: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", pin: "#DC2626" },
  high: { bg: "bg-orange-100", text: "text-orange-700", pin: "#EA580C" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", pin: "#2563EB" },
  low: { bg: "bg-gray-100", text: "text-gray-600", pin: "#6B7280" },
};

// ── Create Data ──

export interface CreateGreenObservationData {
  hole_number: number;
  pin_x: number; // centroid X
  pin_y: number; // centroid Y
  area_path?: AreaPoint[] | null; // freehand drawn boundary
  issue_type: GreenIssueType;
  priority: TaskPriority;
  title: string;
  description?: string | null;
  fix_instructions?: string | null;
  photo_url?: string | null;
  diagnosis_result?: Record<string, unknown> | null; // AI diagnosis with treatment plan
}

// ── Hook ──

export function useGreenObservations() {
  const supabase = createClient();
  const { user } = useAuth();
  const [observations, setObservations] = useState<GreenObservation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchObservations = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("green_observations") as any)
        .select(`
          *,
          reporter:profiles!reported_by(id, full_name, avatar_url, role),
          task:tasks!task_id(id, title, status)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch green observations:", error);
        return;
      }
      setObservations(data || []);
    } catch (err) {
      console.error("Green observations fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  const getObservationsForGreen = useCallback(
    (holeNumber: number) =>
      observations.filter((o) => o.hole_number === holeNumber),
    [observations]
  );

  const getOpenCountForGreen = useCallback(
    (holeNumber: number) =>
      observations.filter(
        (o) => o.hole_number === holeNumber && o.status !== "resolved"
      ).length,
    [observations]
  );

  const createObservation = useCallback(
    async (data: CreateGreenObservationData) => {
      if (!user) return null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error } = await (supabase.from("green_observations") as any)
          .insert({
            ...data,
            reported_by: user.id,
            status: "open",
          })
          .select(`
            *,
            reporter:profiles!reported_by(id, full_name, avatar_url, role)
          `)
          .single();

        if (error) {
          console.error("Failed to create green observation:", error);
          return null;
        }

        setObservations((prev) => [created, ...prev]);
        return created as GreenObservation;
      } catch (err) {
        console.error("Create green observation error:", err);
        return null;
      }
    },
    [supabase, user]
  );

  const updateObservation = useCallback(
    async (id: string, updates: Partial<Pick<GreenObservation, "title" | "issue_type" | "status" | "priority" | "description" | "fix_instructions" | "task_id" | "resolved_at" | "resolved_by">>) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error } = await (supabase.from("green_observations") as any)
          .update(updates)
          .eq("id", id)
          .select(`
            *,
            reporter:profiles!reported_by(id, full_name, avatar_url, role),
            task:tasks!task_id(id, title, status)
          `)
          .single();

        if (error) {
          console.error("Failed to update green observation:", error);
          return null;
        }

        setObservations((prev) =>
          prev.map((o) => (o.id === id ? updated : o))
        );
        return updated as GreenObservation;
      } catch (err) {
        console.error("Update green observation error:", err);
        return null;
      }
    },
    [supabase]
  );

  const uploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("green-observations")
        .upload(path, file, { upsert: true });

      if (error) {
        console.error("Photo upload error:", error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("green-observations")
        .getPublicUrl(path);

      return urlData.publicUrl;
    },
    [supabase, user]
  );

  // Summary stats
  const stats = {
    total: observations.length,
    open: observations.filter((o) => o.status === "open").length,
    inProgress: observations.filter((o) => o.status === "in_progress").length,
    resolved: observations.filter((o) => o.status === "resolved").length,
    monitoring: observations.filter((o) => o.status === "monitoring").length,
    critical: observations.filter((o) => o.priority === "critical" && o.status !== "resolved").length,
    high: observations.filter((o) => o.priority === "high" && o.status !== "resolved").length,
  };

  return {
    observations,
    loading,
    stats,
    fetchObservations,
    getObservationsForGreen,
    getOpenCountForGreen,
    createObservation,
    updateObservation,
    uploadPhoto,
  };
}
