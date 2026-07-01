"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "./useAuth";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { translateSafe } from "@/lib/utils/translate";
import type {
  CourseObservation,
  ImprovementPlanItem,
  ImprovementPlan,
  ObservationCategory,
  ObservationSentiment,
} from "@/types/database";

interface UseObservationsReturn {
  observations: CourseObservation[];
  planItems: ImprovementPlanItem[];
  currentPlan: ImprovementPlan | null;
  loading: boolean;
  planLoading: boolean;
  error: string | null;
  fetchObservations: () => Promise<void>;
  fetchPlan: () => Promise<void>;
  addObservation: (obs: Omit<CourseObservation, "id" | "created_by" | "created_at" | "updated_at" | "is_addressed" | "linked_plan_item_id">) => Promise<CourseObservation | null>;
  updateObservation: (id: string, updates: Partial<CourseObservation>) => Promise<boolean>;
  deleteObservation: (id: string) => Promise<boolean>;
  updatePlanItem: (id: string, updates: Partial<ImprovementPlanItem>) => Promise<boolean>;
  stats: {
    total: number;
    positive: number;
    negative: number;
    ideas: number;
    addressed: number;
    unaddressed: number;
    byCategory: Record<string, number>;
  };
}

export function useObservations(): UseObservationsReturn {
  const [observations, setObservations] = useState<CourseObservation[]>([]);
  const [planItems, setPlanItems] = useState<ImprovementPlanItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState<ImprovementPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchObservations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Direct REST so the fetch can't wedge on a stalled supabase-js
      // auth wrapper after navigation.
      const data = await directSelectList<CourseObservation>(
        "course_observations",
        {
          columns: "*",
          orderBy: [{ column: "created_at", ascending: false }],
          label: "useObservations.fetchObservations",
        },
      );
      setObservations(data);
    } catch (err) {
      console.error("Error fetching observations:", err);
      setError("Failed to load observations");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchPlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);

    try {
      const [planList, items] = await Promise.all([
        directSelectList<ImprovementPlan>("improvement_plans", {
          columns: "*",
          filters: [`is_current=eq.true`],
          orderBy: [{ column: "created_at", ascending: false }],
          limit: 1,
          label: "useObservations.fetchPlan",
        }),
        directSelectList<ImprovementPlanItem>("improvement_plan_items", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          label: "useObservations.fetchPlanItems",
        }),
      ]);

      if (planList[0]) setCurrentPlan(planList[0]);
      setPlanItems(items);
    } catch (err) {
      console.error("Error fetching plan:", err);
    } finally {
      setPlanLoading(false);
    }
  }, [user]);

  const addObservation = useCallback(
    async (
      obs: Omit<CourseObservation, "id" | "created_by" | "created_at" | "updated_at" | "is_addressed" | "linked_plan_item_id">
    ): Promise<CourseObservation | null> => {
      if (!user) return null;

      try {
        // Insert immediately — don't block on translation.
        const newObs = await directInsertRow<CourseObservation>(
          "course_observations",
          {
            ...obs,
            created_by: user.id,
            is_addressed: false,
            linked_plan_item_id: null,
          },
          "useObservations.addObservation",
        );

        setObservations((prev) => [newObs, ...prev]);

        // Fire-and-forget: translate and patch in background.
        Promise.all([
          obs.title && obs.title.trim()
            ? translateSafe({ text: obs.title, from: "en", to: "es" })
            : Promise.resolve(null),
          obs.description && obs.description.trim()
            ? translateSafe({ text: obs.description, from: "en", to: "es" })
            : Promise.resolve(null),
        ]).then(async ([titleEs, descriptionEs]) => {
          if (!titleEs && !descriptionEs) return;
          const patch: Record<string, string> = {};
          if (titleEs) patch.title_es = titleEs;
          if (descriptionEs) patch.description_es = descriptionEs;
          await directPatchRow(
            "course_observations",
            "id",
            newObs.id,
            patch,
            "useObservations.translatePatch",
          );
        }).catch((err) => console.error("Background translation failed:", err));

        return newObs;
      } catch (err) {
        console.error("Error adding observation:", err);
        setError("Failed to save observation");
        return null;
      }
    },
    [user]
  );

  const updateObservation = useCallback(
    async (id: string, updates: Partial<CourseObservation>): Promise<boolean> => {
      try {
        await directPatchRow(
          "course_observations",
          "id",
          id,
          { ...updates, updated_at: new Date().toISOString() },
          "useObservations.updateObservation",
        );
        setObservations((prev) =>
          prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
        );
        return true;
      } catch (err) {
        console.error("Error updating observation:", err);
        return false;
      }
    },
    []
  );

  const deleteObservation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await directDeleteRow(
          "course_observations",
          "id",
          id,
          "useObservations.deleteObservation",
        );
        setObservations((prev) => prev.filter((o) => o.id !== id));
        return true;
      } catch (err) {
        console.error("Error deleting observation:", err);
        return false;
      }
    },
    []
  );

  const updatePlanItem = useCallback(
    async (id: string, updates: Partial<ImprovementPlanItem>): Promise<boolean> => {
      try {
        await directPatchRow(
          "improvement_plan_items",
          "id",
          id,
          { ...updates, updated_at: new Date().toISOString() },
          "useObservations.updatePlanItem",
        );
        setPlanItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
        return true;
      } catch (err) {
        console.error("Error updating plan item:", err);
        return false;
      }
    },
    []
  );

  // Compute stats
  const stats = {
    total: observations.length,
    positive: observations.filter((o) => o.sentiment === "positive").length,
    negative: observations.filter((o) => o.sentiment === "negative").length,
    ideas: observations.filter((o) => o.sentiment === "idea").length,
    addressed: observations.filter((o) => o.is_addressed).length,
    unaddressed: observations.filter((o) => !o.is_addressed).length,
    byCategory: observations.reduce((acc, o) => {
      acc[o.category] = (acc[o.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  // Auto-fetch on mount
  useEffect(() => {
    if (user) {
      fetchObservations();
      fetchPlan();
    }
  }, [user, fetchObservations, fetchPlan]);

  return {
    observations,
    planItems,
    currentPlan,
    loading,
    planLoading,
    error,
    fetchObservations,
    fetchPlan,
    addObservation,
    updateObservation,
    deleteObservation,
    updatePlanItem,
    stats,
  };
}

// Category display config
export const observationCategoryConfig: Record<
  ObservationCategory,
  { label: string; color: string; bg: string }
> = {
  turf: { label: "Turf", color: "text-green-600", bg: "bg-green-500/10" },
  irrigation: { label: "Irrigation", color: "text-blue-600", bg: "bg-blue-500/10" },
  equipment: { label: "Equipment", color: "text-gray-600", bg: "bg-gray-500/10" },
  staffing: { label: "Staffing", color: "text-purple-600", bg: "bg-purple-500/10" },
  processes: { label: "Processes", color: "text-orange-600", bg: "bg-orange-500/10" },
  aesthetics: { label: "Aesthetics", color: "text-pink-600", bg: "bg-pink-500/10" },
  safety: { label: "Safety", color: "text-red-600", bg: "bg-red-500/10" },
  infrastructure: { label: "Infrastructure", color: "text-amber-600", bg: "bg-amber-500/10" },
  drainage: { label: "Drainage", color: "text-cyan-600", bg: "bg-cyan-500/10" },
  pest_disease: { label: "Pest/Disease", color: "text-lime-600", bg: "bg-lime-500/10" },
  member_experience: { label: "Member Experience", color: "text-indigo-600", bg: "bg-indigo-500/10" },
  other: { label: "Other", color: "text-slate-600", bg: "bg-slate-500/10" },
};

export const sentimentConfig: Record<
  ObservationSentiment,
  { label: string; emoji: string; color: string; bg: string }
> = {
  positive: { label: "Like", emoji: "+", color: "text-green-600", bg: "bg-green-500/10" },
  negative: { label: "Needs Work", emoji: "-", color: "text-red-600", bg: "bg-red-500/10" },
  neutral: { label: "Note", emoji: "~", color: "text-gray-600", bg: "bg-gray-500/10" },
  idea: { label: "Idea", emoji: "!", color: "text-amber-600", bg: "bg-amber-500/10" },
};

export const phaseConfig: Record<string, { label: string; color: string; bg: string }> = {
  immediate: { label: "Immediate", color: "text-red-600", bg: "bg-red-500/10" },
  week_1_2: { label: "Week 1-2", color: "text-orange-600", bg: "bg-orange-500/10" },
  month_1: { label: "Month 1", color: "text-amber-600", bg: "bg-amber-500/10" },
  month_2_3: { label: "Month 2-3", color: "text-blue-600", bg: "bg-blue-500/10" },
  ongoing: { label: "Ongoing", color: "text-green-600", bg: "bg-green-500/10" },
};
