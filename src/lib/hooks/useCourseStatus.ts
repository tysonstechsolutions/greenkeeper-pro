"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";

export type CourseStatusType =
  | "open"
  | "frost_delay"
  | "cart_path_only"
  | "lift_clean_place"
  | "temporary_greens"
  | "closed";

export interface CourseStatus {
  status: CourseStatusType;
  message: string;
  estimated_open_time?: string; // For frost delay
  updated_at: string;
  updated_by: string;
  updated_by_name?: string;
}

export const courseStatusLabels: Record<CourseStatusType, string> = {
  open: "Open",
  frost_delay: "Frost Delay",
  cart_path_only: "Cart Path Only",
  lift_clean_place: "Lift, Clean & Place",
  temporary_greens: "Temporary Greens",
  closed: "Closed",
};

export const courseStatusColors: Record<CourseStatusType, { bg: string; text: string; border: string }> = {
  open: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400", border: "border-green-500/20" },
  frost_delay: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/20" },
  cart_path_only: { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-500/20" },
  lift_clean_place: { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/20" },
  temporary_greens: { bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-400", border: "border-purple-500/20" },
  closed: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/20" },
};

export function useCourseStatus() {
  const supabase = createClient();
  const { profile, isSuper, isAsstSuper } = useAuth();
  const [courseStatus, setCourseStatus] = useState<CourseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch current course status
  const fetchCourseStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "course_status")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching course status:", error);
    }

    if (data && (data as { value?: unknown }).value) {
      const statusData = (data as { value: unknown }).value as CourseStatus;
      setCourseStatus(statusData);
    } else {
      // Default status
      setCourseStatus({
        status: "open",
        message: "",
        updated_at: new Date().toISOString(),
        updated_by: "",
      });
    }
    setLoading(false);
  }, [supabase]);

  // Update course status (superintendent only)
  const updateCourseStatus = useCallback(
    async (
      status: CourseStatusType,
      message: string,
      estimatedOpenTime?: string
    ): Promise<boolean> => {
      if (!profile || (!isSuper && !isAsstSuper)) {
        console.error("Only superintendents can update course status");
        return false;
      }

      const newStatus: CourseStatus = {
        status,
        message,
        estimated_open_time: estimatedOpenTime,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
        updated_by_name: profile.full_name,
      };

      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          {
            key: "course_status",
            value: newStatus as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) {
        console.error("Error updating course status:", error);
        return false;
      }

      setCourseStatus(newStatus);
      return true;
    },
    [supabase, profile, isSuper, isAsstSuper]
  );

  // Subscribe to realtime updates
  useEffect(() => {
    fetchCourseStatus();

    const channel = supabase
      .channel("course_status_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: "key=eq.course_status",
        },
        (payload) => {
          if (payload.new && "value" in payload.new) {
            const newValue = payload.new.value as unknown as CourseStatus;
            setCourseStatus(newValue);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCourseStatus]);

  return {
    courseStatus,
    loading,
    fetchCourseStatus,
    updateCourseStatus,
    canUpdateStatus: isSuper || isAsstSuper,
  };
}
