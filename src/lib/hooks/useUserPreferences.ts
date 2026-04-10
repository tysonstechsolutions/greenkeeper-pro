// src/lib/hooks/useUserPreferences.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type { UserPreferences, NotificationPreferences, CoursePreferences, UpdateTables } from "@/types/database";

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    push_enabled: true,
    task_assigned: true,
    task_completed: true,
    schedule_changes: true,
    weather_alerts: true,
    equipment_issues: true,
    messages: true,
  },
  course: {},
};

interface UseUserPreferencesReturn {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<boolean>;
  updateCoursePreferences: (prefs: Partial<CoursePreferences>) => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
}

export function useUserPreferences(): UseUserPreferencesReturn {
  const { user, profile } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Load preferences from profile
  const loadPreferences = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("user_preferences")
        .eq("id", user.id)
        .single();

      if (fetchError) {
        console.error("Error loading preferences:", fetchError);
        setError(fetchError.message);
        return;
      }

      if (data?.user_preferences) {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...data.user_preferences,
        });
      }
    } catch (err) {
      console.error("Unexpected error loading preferences:", err);
      setError("Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update notification preferences
  const updateNotificationPreferences = useCallback(
    async (prefs: Partial<NotificationPreferences>): Promise<boolean> => {
      if (!user) {
        setError("Must be logged in");
        return false;
      }

      const newPreferences: UserPreferences = {
        ...preferences,
        notifications: {
          ...preferences.notifications,
          ...prefs,
        },
      };

      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ user_preferences: newPreferences })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating preferences:", updateError);
          setError(updateError.message);
          return false;
        }

        setPreferences(newPreferences);
        return true;
      } catch (err) {
        console.error("Unexpected error updating preferences:", err);
        setError("Failed to save preferences");
        return false;
      }
    },
    [user, preferences]
  );

  // Update course preferences
  const updateCoursePreferences = useCallback(
    async (prefs: Partial<CoursePreferences>): Promise<boolean> => {
      if (!user) {
        setError("Must be logged in");
        return false;
      }

      const newPreferences: UserPreferences = {
        ...preferences,
        course: {
          ...preferences.course,
          ...prefs,
        },
      };

      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ user_preferences: newPreferences })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating preferences:", updateError);
          setError(updateError.message);
          return false;
        }

        setPreferences(newPreferences);
        return true;
      } catch (err) {
        console.error("Unexpected error updating preferences:", err);
        setError("Failed to save preferences");
        return false;
      }
    },
    [user, preferences]
  );

  return {
    preferences,
    loading,
    error,
    updateNotificationPreferences,
    updateCoursePreferences,
    refreshPreferences: loadPreferences,
  };
}
