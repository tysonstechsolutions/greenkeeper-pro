"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type { Profile, UserRole, Database } from "@/types/database";

// Crew is stored by unique crew_assignment values across profiles
export interface Crew {
  name: string;
  foreman_id: string | null;
  foreman?: Pick<Profile, "id" | "full_name" | "display_name" | "avatar_url"> | null;
  members: Array<Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url">>;
  member_count: number;
}

interface UseCrewsReturn {
  crews: Crew[];
  loading: boolean;
  error: string | null;
  fetchCrews: () => Promise<Crew[]>;
  createCrew: (name: string, foremanId?: string) => Promise<boolean>;
  deleteCrew: (name: string) => Promise<boolean>;
  renameCrew: (oldName: string, newName: string) => Promise<boolean>;
  setCrewForeman: (crewName: string, foremanId: string | null) => Promise<boolean>;
  addMemberToCrew: (userId: string, crewName: string) => Promise<boolean>;
  removeMemberFromCrew: (userId: string) => Promise<boolean>;
  getCrewNames: () => string[];
}

export function useCrews(): UseCrewsReturn {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isSuper } = useAuth();

  const supabase = createClient();

  // Fetch all crews by aggregating crew_assignment values
  const fetchCrews = useCallback(async (): Promise<Crew[]> => {
    setLoading(true);
    setError(null);

    try {
      // Get all profiles with crew assignments
      const { data: profiles, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, role, avatar_url, is_active")
        .eq("is_active", true)
        .order("full_name");

      if (fetchError) {
        console.error("Error fetching profiles for crews:", fetchError);
        setError(fetchError.message);
        return [];
      }

      // Get crew assignments from a separate crews metadata approach
      // We'll store crew metadata in a simple JSON structure
      // For now, derive crews from schedules.crew_assignment which has crew info

      // Actually, let's check for unique crew_assignment values in schedules
      const { data: scheduleData, error: scheduleError } = await supabase
        .from("schedules")
        .select("crew_assignment")
        .not("crew_assignment", "is", null);

      // Build crew list from unique crew assignments and any task crew assignments
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("assigned_crew")
        .not("assigned_crew", "is", null);

      // Combine unique crew names from schedules and tasks
      const crewNamesSet = new Set<string>();

      if (scheduleData) {
        scheduleData.forEach((s) => {
          if (s.crew_assignment) crewNamesSet.add(s.crew_assignment);
        });
      }

      if (taskData) {
        taskData.forEach((t) => {
          if (t.assigned_crew) crewNamesSet.add(t.assigned_crew);
        });
      }

      // For each profile, check if they have a primary crew assignment
      // We'll use a convention: profiles with role 'foreman' lead crews
      // Other crew members are assigned via the crew_assignment on schedules

      // Build crews from the data we have
      const crewMap = new Map<string, Crew>();

      // Initialize all known crews
      for (const name of crewNamesSet) {
        crewMap.set(name, {
          name,
          foreman_id: null,
          foreman: null,
          members: [],
          member_count: 0,
        });
      }

      // Add some default crews if none exist
      if (crewMap.size === 0) {
        const defaultCrews = ["Morning Crew A", "Morning Crew B", "Afternoon Crew"];
        for (const name of defaultCrews) {
          crewMap.set(name, {
            name,
            foreman_id: null,
            foreman: null,
            members: [],
            member_count: 0,
          });
        }
      }

      // Get latest schedule entries to see current crew memberships
      const today = new Date().toISOString().split("T")[0];
      const { data: currentSchedules } = await supabase
        .from("schedules")
        .select("user_id, crew_assignment")
        .eq("schedule_date", today)
        .not("crew_assignment", "is", null);

      // Map current crew members
      const userCrewMap = new Map<string, string>();
      if (currentSchedules) {
        for (const schedule of currentSchedules) {
          userCrewMap.set(schedule.user_id, schedule.crew_assignment);
        }
      }

      // Assign profiles to crews based on today's schedule
      if (profiles) {
        for (const profile of profiles) {
          const crewName = userCrewMap.get(profile.id);
          if (crewName && crewMap.has(crewName)) {
            const crew = crewMap.get(crewName)!;
            crew.members.push({
              id: profile.id,
              full_name: profile.full_name,
              display_name: profile.display_name,
              role: profile.role,
              avatar_url: profile.avatar_url,
            });
            crew.member_count = crew.members.length;

            // If this is a foreman, set them as the crew leader
            if (profile.role === "foreman" && !crew.foreman_id) {
              crew.foreman_id = profile.id;
              crew.foreman = {
                id: profile.id,
                full_name: profile.full_name,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              };
            }
          }
        }
      }

      const crewList = Array.from(crewMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setCrews(crewList);
      return crewList;
    } catch (err) {
      console.error("Unexpected error fetching crews:", err);
      setError("An unexpected error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Create a new crew (just adds an entry to our system)
  const createCrew = useCallback(
    async (name: string, foremanId?: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can create crews");
        return false;
      }

      // Check if crew already exists
      if (crews.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        setError("A crew with this name already exists");
        return false;
      }

      // To persist the crew, we'll assign the foreman to it via a schedule entry
      if (foremanId) {
        const today = new Date().toISOString().split("T")[0];
        const { error: insertError } = await supabase
          .from("schedules")
          .upsert({
            user_id: foremanId,
            schedule_date: today,
            crew_assignment: name,
            created_by: user?.id,
          }, {
            onConflict: "user_id,schedule_date"
          });

        if (insertError) {
          console.error("Error creating crew:", insertError);
          setError(insertError.message);
          return false;
        }
      }

      // Add to local state
      const newCrew: Crew = {
        name,
        foreman_id: foremanId || null,
        foreman: null,
        members: [],
        member_count: 0,
      };

      setCrews((prev) => [...prev, newCrew].sort((a, b) => a.name.localeCompare(b.name)));
      return true;
    },
    [isSuper, crews, supabase, user]
  );

  // Delete a crew (remove all crew assignments with this name)
  const deleteCrew = useCallback(
    async (name: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can delete crews");
        return false;
      }

      try {
        // Clear crew assignments from schedules
        const { error: updateError } = await supabase
          .from("schedules")
          .update({ crew_assignment: null })
          .eq("crew_assignment", name);

        if (updateError) {
          console.error("Error deleting crew:", updateError);
          setError(updateError.message);
          return false;
        }

        // Clear from tasks too
        await supabase
          .from("tasks")
          .update({ assigned_crew: null })
          .eq("assigned_crew", name);

        // Update local state
        setCrews((prev) => prev.filter((c) => c.name !== name));
        return true;
      } catch (err) {
        console.error("Unexpected error deleting crew:", err);
        setError("Failed to delete crew");
        return false;
      }
    },
    [isSuper, supabase]
  );

  // Rename a crew
  const renameCrew = useCallback(
    async (oldName: string, newName: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can rename crews");
        return false;
      }

      if (crews.some((c) => c.name.toLowerCase() === newName.toLowerCase() && c.name !== oldName)) {
        setError("A crew with this name already exists");
        return false;
      }

      try {
        // Update schedules
        const { error: scheduleError } = await supabase
          .from("schedules")
          .update({ crew_assignment: newName })
          .eq("crew_assignment", oldName);

        if (scheduleError) {
          console.error("Error renaming crew in schedules:", scheduleError);
          setError(scheduleError.message);
          return false;
        }

        // Update tasks
        await supabase
          .from("tasks")
          .update({ assigned_crew: newName })
          .eq("assigned_crew", oldName);

        // Update local state
        setCrews((prev) =>
          prev
            .map((c) => (c.name === oldName ? { ...c, name: newName } : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error renaming crew:", err);
        setError("Failed to rename crew");
        return false;
      }
    },
    [isSuper, crews, supabase]
  );

  // Set crew foreman
  const setCrewForeman = useCallback(
    async (crewName: string, foremanId: string | null): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can assign foremen");
        return false;
      }

      // If setting a foreman, add them to the crew
      if (foremanId) {
        const today = new Date().toISOString().split("T")[0];
        const { error: updateError } = await supabase
          .from("schedules")
          .upsert({
            user_id: foremanId,
            schedule_date: today,
            crew_assignment: crewName,
            created_by: user?.id,
          }, {
            onConflict: "user_id,schedule_date"
          });

        if (updateError) {
          console.error("Error setting foreman:", updateError);
          setError(updateError.message);
          return false;
        }
      }

      // Refresh to get updated data
      await fetchCrews();
      return true;
    },
    [isSuper, supabase, user, fetchCrews]
  );

  // Add member to crew (via schedule assignment for today)
  const addMemberToCrew = useCallback(
    async (userId: string, crewName: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can manage crew members");
        return false;
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        const { error: upsertError } = await supabase
          .from("schedules")
          .upsert({
            user_id: userId,
            schedule_date: today,
            crew_assignment: crewName,
            created_by: user?.id,
          }, {
            onConflict: "user_id,schedule_date"
          });

        if (upsertError) {
          console.error("Error adding member to crew:", upsertError);
          setError(upsertError.message);
          return false;
        }

        await fetchCrews();
        return true;
      } catch (err) {
        console.error("Unexpected error adding member:", err);
        setError("Failed to add member to crew");
        return false;
      }
    },
    [isSuper, supabase, user, fetchCrews]
  );

  // Remove member from crew
  const removeMemberFromCrew = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can manage crew members");
        return false;
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        const { error: updateError } = await supabase
          .from("schedules")
          .update({ crew_assignment: null })
          .eq("user_id", userId)
          .eq("schedule_date", today);

        if (updateError) {
          console.error("Error removing member from crew:", updateError);
          setError(updateError.message);
          return false;
        }

        await fetchCrews();
        return true;
      } catch (err) {
        console.error("Unexpected error removing member:", err);
        setError("Failed to remove member from crew");
        return false;
      }
    },
    [isSuper, supabase, fetchCrews]
  );

  // Get list of crew names for dropdowns
  const getCrewNames = useCallback((): string[] => {
    return crews.map((c) => c.name);
  }, [crews]);

  // Initial fetch
  useEffect(() => {
    fetchCrews();
  }, [fetchCrews]);

  return {
    crews,
    loading,
    error,
    fetchCrews,
    createCrew,
    deleteCrew,
    renameCrew,
    setCrewForeman,
    addMemberToCrew,
    removeMemberFromCrew,
    getCrewNames,
  };
}
