// src/lib/hooks/useRecentActivity.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";
import type { ActivityLog, Profile, InsertTables } from "@/types/database";

export interface ActivityWithUser extends ActivityLog {
  user?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

interface UseRecentActivityReturn {
  activities: ActivityWithUser[];
  loading: boolean;
  error: string | null;
  fetchActivities: (limit?: number) => Promise<void>;
  logActivity: (
    actionType: ActivityLog["action_type"],
    entityType: ActivityLog["entity_type"],
    description: string,
    entityId?: string,
    metadata?: Record<string, unknown>
  ) => Promise<boolean>;
}

export function useRecentActivity(): UseRecentActivityReturn {
  const [activities, setActivities] = useState<ActivityWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchActivities = useCallback(
    async (limit: number = 10) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select(`
            *,
            user:profiles!activity_log_user_id_fkey(id, full_name, avatar_url)
          `)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (fetchError) {
          // PGRST205 = table missing in schema cache (migration not applied
          // yet on this DB). Fail soft: render an empty feed instead of a
          // blocking error so the dashboard stays usable.
          if ((fetchError as { code?: string }).code === "PGRST205") {
            setActivities([]);
            return;
          }
          console.error("Error fetching activities:", fetchError);
          setError(fetchError.message);
          return;
        }

        setActivities((data as ActivityWithUser[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching activities:", err);
        setError("Failed to load activities");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const logActivity = useCallback(
    async (
      actionType: ActivityLog["action_type"],
      entityType: ActivityLog["entity_type"],
      description: string,
      entityId?: string,
      metadata?: Record<string, unknown>
    ): Promise<boolean> => {
      try {
        // Cached user-id read avoids the supabase.auth.getUser() wedge.
        const userId = getCachedUserId();

        if (!userId) {
          console.warn("Cannot log activity: no authenticated user");
          return false;
        }

        const activityData: InsertTables<"activity_log"> = {
          user_id: userId,
          action_type: actionType,
          entity_type: entityType,
          entity_id: entityId || null,
          description,
          metadata: metadata || {},
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase as any)
          .from("activity_log")
          .insert(activityData);

        if (insertError) {
          console.error("Error logging activity:", insertError);
          return false;
        }

        // Refresh activities list
        await fetchActivities();
        return true;
      } catch (err) {
        console.error("Unexpected error logging activity:", err);
        return false;
      }
    },
    [supabase, fetchActivities]
  );

  // Initial fetch
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return {
    activities,
    loading,
    error,
    fetchActivities,
    logActivity,
  };
}
