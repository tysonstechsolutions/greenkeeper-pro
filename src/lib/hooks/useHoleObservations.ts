"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import { translateSafe } from "@/lib/utils/translate";
import type {
  HoleObservation,
  HoleIssueType,
  HoleObservationStatus,
  TaskPriority,
} from "@/types/database";

// Re-export shared constants so existing imports still work
export { issueTypeLabels, issueTypeIcons } from "@/lib/hole-constants";

export const statusLabels: Record<HoleObservationStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  monitoring: "Monitoring",
};

export const statusColors: Record<HoleObservationStatus, { bg: string; text: string }> = {
  open: { bg: "bg-red-100", text: "text-red-700" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700" },
  resolved: { bg: "bg-green-100", text: "text-green-700" },
  monitoring: { bg: "bg-blue-100", text: "text-blue-700" },
};

export const priorityLabels: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const priorityColors: Record<TaskPriority, { bg: string; text: string; pin: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", pin: "#DC2626" },
  high: { bg: "bg-orange-100", text: "text-orange-700", pin: "#EA580C" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", pin: "#2563EB" },
  low: { bg: "bg-gray-100", text: "text-gray-600", pin: "#6B7280" },
};

// ── Create Data ──

export interface CreateHoleObservationData {
  hole_number: number;
  pin_x: number;
  pin_y: number;
  issue_type: HoleIssueType;
  priority: TaskPriority;
  title: string;
  description?: string | null;
  fix_instructions?: string | null;
  photo_url?: string | null;
  diagnosis_result?: Record<string, unknown> | null; // AI diagnosis with treatment plan
}

// ── Hole Info ──

export const HOLE_PARS: Record<number, number> = {
  1: 4, 2: 4, 3: 3, 4: 5, 5: 3, 6: 4, 7: 3, 8: 4, 9: 4,
  10: 4, 11: 4, 12: 3, 13: 4, 14: 5, 15: 4, 16: 3, 17: 5, 18: 4,
};

export const HOLE_YARDS: Record<number, number> = {
  1: 375, 2: 390, 3: 165, 4: 520, 5: 155, 6: 410, 7: 180, 8: 405, 9: 385,
  10: 370, 11: 420, 12: 145, 13: 430, 14: 535, 15: 360, 16: 195, 17: 545, 18: 415,
};

// ── Hook ──

export function useHoleObservations() {
  const supabase = createClient();
  const { user } = useAuth();
  const [observations, setObservations] = useState<HoleObservation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchObservations = useCallback(async () => {
    setLoading(true);
    try {
       
      const { data, error } = await supabase.from("hole_observations")
        .select(`
          *,
          reporter:profiles!reported_by(id, full_name, avatar_url, role),
          task:tasks!task_id(id, title, status)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch hole observations:", error);
        return;
      }
      setObservations(data || []);
    } catch (err) {
      console.error("Hole observations fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  const getObservationsForHole = useCallback(
    (holeNumber: number) =>
      observations.filter((o) => o.hole_number === holeNumber),
    [observations]
  );

  const getOpenCountForHole = useCallback(
    (holeNumber: number) =>
      observations.filter(
        (o) => o.hole_number === holeNumber && o.status !== "resolved"
      ).length,
    [observations]
  );

  const createObservation = useCallback(
    async (data: CreateHoleObservationData) => {
      if (!user) return null;
      try {
        // Translate user-facing text fields — non-blocking.
        const [titleEs, descriptionEs] = await Promise.all([
          data.title && data.title.trim()
            ? translateSafe({ text: data.title, from: "en", to: "es" })
            : Promise.resolve(null),
          data.description && data.description.trim()
            ? translateSafe({ text: data.description, from: "en", to: "es" })
            : Promise.resolve(null),
        ]);


        const { data: created, error } = await supabase.from("hole_observations")
          .insert({
            ...data,
            title_es: titleEs,
            description_es: descriptionEs,
            reported_by: user.id,
            status: "open",
          })
          .select(`
            *,
            reporter:profiles!reported_by(id, full_name, avatar_url, role)
          `)
          .single();

        if (error) {
          console.error("Failed to create observation:", error);
          return null;
        }

        setObservations((prev) => [created, ...prev]);
        return created as HoleObservation;
      } catch (err) {
        console.error("Create observation error:", err);
        return null;
      }
    },
    [supabase, user]
  );

  const updateObservation = useCallback(
    async (id: string, updates: Partial<Pick<HoleObservation, "title" | "issue_type" | "status" | "priority" | "description" | "fix_instructions" | "task_id" | "resolved_at" | "resolved_by">>) => {
      try {
         
        const { data: updated, error } = await supabase.from("hole_observations")
          .update(updates)
          .eq("id", id)
          .select(`
            *,
            reporter:profiles!reported_by(id, full_name, avatar_url, role),
            task:tasks!task_id(id, title, status)
          `)
          .single();

        if (error) {
          console.error("Failed to update observation:", error);
          return null;
        }

        setObservations((prev) =>
          prev.map((o) => (o.id === id ? updated : o))
        );
        return updated as HoleObservation;
      } catch (err) {
        console.error("Update observation error:", err);
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
        .from("hole-observations")
        .upload(path, file, { upsert: true });

      if (error) {
        console.error("Photo upload error:", error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("hole-observations")
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
    getObservationsForHole,
    getOpenCountForHole,
    createObservation,
    updateObservation,
    uploadPhoto,
  };
}
