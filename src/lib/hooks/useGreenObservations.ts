"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { translateSafe } from "@/lib/utils/translate";
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
      // Direct REST so the fetch can't wedge on a stalled supabase-js
      // auth wrapper after navigation. PostgREST supports the embedded
      // resource syntax we were using inside the select string.
      const data = await directSelectList<GreenObservation>(
        "green_observations",
        {
          columns:
            "*, reporter:profiles!reported_by(id, full_name, avatar_url, role), task:tasks!task_id(id, title, status)",
          orderBy: [{ column: "created_at", ascending: false }],
          label: "useGreenObservations.fetch",
        },
      );
      setObservations(data);
    } catch (err) {
      console.error("Green observations fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
        // Insert immediately — don't block on translation. Direct REST
        // returns the inserted row WITH the embedded resources we asked
        // for (PostgREST evaluates the select on insert+representation).
        const created = await directInsertRow<GreenObservation>(
          "green_observations",
          {
            ...data,
            reported_by: user.id,
            status: "open",
          },
          "useGreenObservations.create",
        );

        // The directInsertRow helper doesn't currently let us pass a
        // custom select string. Re-fetch the row with embeds so the UI
        // gets the reporter info immediately.
        const enriched = await directSelectList<GreenObservation>(
          "green_observations",
          {
            columns:
              "*, reporter:profiles!reported_by(id, full_name, avatar_url, role)",
            filters: [`id=eq.${encodeURIComponent(created.id)}`],
            limit: 1,
            label: "useGreenObservations.create:enrich",
          },
        );
        const row = enriched[0] ?? created;

        setObservations((prev) => [row, ...prev]);

        // Fire-and-forget: translate and patch in background.
        Promise.all([
          data.title && data.title.trim()
            ? translateSafe({ text: data.title, from: "en", to: "es" })
            : Promise.resolve(null),
          data.description && data.description.trim()
            ? translateSafe({ text: data.description, from: "en", to: "es" })
            : Promise.resolve(null),
        ]).then(async ([titleEs, descriptionEs]) => {
          if (!titleEs && !descriptionEs) return;
          const patch: Record<string, string> = {};
          if (titleEs) patch.title_es = titleEs;
          if (descriptionEs) patch.description_es = descriptionEs;
          await directPatchRow(
            "green_observations",
            "id",
            created.id,
            patch,
            "useGreenObservations.create:translate",
          );
        }).catch((err) => console.error("Background translation failed:", err));

        return row;
      } catch (err) {
        console.error("Create green observation error:", err);
        return null;
      }
    },
    [user]
  );

  const updateObservation = useCallback(
    async (id: string, updates: Partial<Pick<GreenObservation, "title" | "issue_type" | "status" | "priority" | "description" | "fix_instructions" | "photo_url" | "task_id" | "resolved_at" | "resolved_by">>) => {
      try {
        await directPatchRowReturning<GreenObservation>(
          "green_observations",
          "id",
          id,
          updates,
          "useGreenObservations.update",
        );
        // Re-fetch with embeds so the UI keeps reporter/task data fresh.
        const enriched = await directSelectList<GreenObservation>(
          "green_observations",
          {
            columns:
              "*, reporter:profiles!reported_by(id, full_name, avatar_url, role), task:tasks!task_id(id, title, status)",
            filters: [`id=eq.${encodeURIComponent(id)}`],
            limit: 1,
            label: "useGreenObservations.update:enrich",
          },
        );
        const updated = enriched[0];
        if (updated) {
          setObservations((prev) =>
            prev.map((o) => (o.id === id ? updated : o))
          );
        }
        return updated ?? null;
      } catch (err) {
        console.error("Update green observation error:", err);
        return null;
      }
    },
    []
  );

  const uploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;

      // Derive extension from MIME type (camera captures often lack a proper filename)
      const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
      };
      const ext = mimeToExt[file.type] || file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("photos")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (error) {
        console.error("Photo upload error:", error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("photos")
        .getPublicUrl(path);

      return urlData.publicUrl;
    },
    [supabase, user]
  );

  const deleteObservation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await directDeleteRow(
          "green_observations",
          "id",
          id,
          "useGreenObservations.delete",
        );
        setObservations((prev) => prev.filter((o) => o.id !== id));
        return true;
      } catch (err) {
        console.error("Delete observation error:", err);
        return false;
      }
    },
    []
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
    deleteObservation,
    uploadPhoto,
  };
}
