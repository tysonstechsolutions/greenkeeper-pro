"use client";

import { useState, useCallback, useEffect } from "react";
import {
  directSelectList,
  directPatchByFilter,
  directRpc,
} from "@/lib/supabase/rest";
import { useAuth } from "./useAuth";
import type { Profile, UserRole } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";

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

interface CrewScheduleRow {
  user_id: string;
  schedule_date: string;
  shift_start: string | null;
  shift_end: string | null;
  shift_type: string | null;
  crew_assignment: string | null;
  notes: string | null;
}

async function saveCrewAssignment(
  userId: string,
  scheduleDate: string,
  crewAssignment: string | null,
  reason: string,
): Promise<void> {
  const existing = await directSelectList<CrewScheduleRow>("schedules", {
    columns: "user_id,schedule_date,shift_start,shift_end,shift_type,crew_assignment,notes",
    filters: [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `schedule_date=eq.${scheduleDate}`,
    ],
    limit: 1,
    label: "useCrews.schedule.current",
  });
  const row = existing[0];
  await directRpc("upsert_staff_schedule", {
    p_user_id: userId,
    p_schedule_date: scheduleDate,
    p_values: {
      shift_start: row?.shift_start ?? null,
      shift_end: row?.shift_end ?? null,
      shift_type: row?.shift_type ?? null,
      crew_assignment: crewAssignment,
      notes: row?.notes ?? null,
    },
    p_reason: reason,
  }, "useCrews.schedule.saveCrew");
}

async function replaceCrewAssignments(
  oldName: string,
  newName: string | null,
  reason: string,
): Promise<void> {
  const rows = await directSelectList<CrewScheduleRow>("schedules", {
    columns: "user_id,schedule_date,shift_start,shift_end,shift_type,crew_assignment,notes",
    filters: [
      `crew_assignment=eq.${encodeURIComponent(oldName)}`,
      "is_active=eq.true",
    ],
    label: "useCrews.schedule.byCrew",
  });
  if (rows.length === 0) return;
  await directRpc("bulk_upsert_staff_schedules", {
    p_entries: rows.map((row) => ({ ...row, crew_assignment: newName })),
    p_reason: reason,
  }, "useCrews.schedule.replaceCrew");
}

export function useCrews(): UseCrewsReturn {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isSuper } = useAuth();

  // Fetch all crews by aggregating crew_assignment values
  const fetchCrews = useCallback(async (): Promise<Crew[]> => {
    setLoading(true);
    setError(null);

    try {
      // Direct REST so the page can't wedge on a stalled supabase-js
      // auth wrapper after navigation. All three queries run in parallel.
      type ProfileType = { id: string; full_name: string | null; display_name: string | null; role: string; avatar_url: string | null; is_active: boolean };
      let profiles: ProfileType[] = [];
      let scheduleData: { crew_assignment: string | null }[] = [];
      let taskData: { assigned_crew: string | null }[] = [];
      try {
        [profiles, scheduleData, taskData] = await Promise.all([
          directSelectList<ProfileType>("profiles", {
            columns: "id, full_name, display_name, role, avatar_url, is_active",
            filters: [`is_active=eq.true`],
            orderBy: [{ column: "full_name", ascending: true }],
            label: "useCrews.fetchCrews.profiles",
          }),
          directSelectList<{ crew_assignment: string | null }>("schedules", {
            columns: "crew_assignment",
            filters: [`crew_assignment=not.is.null`, `is_active=eq.true`],
            label: "useCrews.fetchCrews.schedules",
          }),
          directSelectList<{ assigned_crew: string | null }>("tasks", {
            columns: "assigned_crew",
            filters: [`assigned_crew=not.is.null`],
            label: "useCrews.fetchCrews.tasks",
          }),
        ]);
      } catch (fetchErr) {
        console.error("Error fetching profiles for crews:", fetchErr);
        setError(fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        return [];
      }

      // Combine unique crew names from schedules and tasks
      const crewNamesSet = new Set<string>();

      if (scheduleData) {
        (scheduleData as { crew_assignment: string | null }[]).forEach((s: { crew_assignment: string | null }) => {
          if (s.crew_assignment) crewNamesSet.add(s.crew_assignment);
        });
      }

      if (taskData) {
        (taskData as { assigned_crew: string | null }[]).forEach((t: { assigned_crew: string | null }) => {
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
      const today = todayLocal();
      let currentSchedules: { user_id: string; crew_assignment: string | null }[] = [];
      try {
        currentSchedules = await directSelectList<{ user_id: string; crew_assignment: string | null }>(
          "schedules",
          {
            columns: "user_id, crew_assignment",
            filters: [
              `schedule_date=eq.${today}`,
              `crew_assignment=not.is.null`,
              "is_active=eq.true",
            ],
            label: "useCrews.fetchCrews.currentSchedules",
          },
        );
      } catch (err) {
        console.error("Error fetching current schedules:", err);
      }

      // Map current crew members
      const userCrewMap = new Map<string, string>();
      for (const schedule of currentSchedules) {
        if (schedule.crew_assignment) {
          userCrewMap.set(schedule.user_id, schedule.crew_assignment);
        }
      }

      // Assign profiles to crews based on today's schedule
      if (profiles) {
        for (const profile of profiles) {
          const crewName = userCrewMap.get(profile.id);
          if (crewName && crewMap.has(crewName)) {
            const crew = crewMap.get(crewName)!;
            // Cast to match Pick<Profile, ...> shape - the Profile type uses string not string | null
            crew.members.push({
              id: profile.id,
              full_name: profile.full_name ?? "",
              display_name: profile.display_name,
              role: profile.role as UserRole,
              avatar_url: profile.avatar_url,
            });
            crew.member_count = crew.members.length;

            // If this is a foreman, set them as the crew leader
            if (profile.role === "foreman" && !crew.foreman_id) {
              crew.foreman_id = profile.id;
              crew.foreman = {
                id: profile.id,
                full_name: profile.full_name ?? "",
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
  }, []);

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
        const today = todayLocal();
        try {
          await saveCrewAssignment(foremanId, today, name, "Crew created and foreman assigned");
        } catch (err) {
          console.error("Error creating crew:", err);
          setError(err instanceof Error ? err.message : "Failed to create crew");
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
    [isSuper, crews]
  );

  // Delete a crew (remove all crew assignments with this name)
  const deleteCrew = useCallback(
    async (name: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can delete crews");
        return false;
      }

      try {
        // Clear crew assignments from schedules + tasks via direct REST.
        await replaceCrewAssignments(name, null, "Crew removed from active schedule entries");
        await directPatchByFilter(
          "tasks",
          [`assigned_crew=eq.${encodeURIComponent(name)}`],
          { assigned_crew: null },
          "useCrews.deleteCrew.tasks",
        );

        // Update local state
        setCrews((prev) => prev.filter((c) => c.name !== name));
        return true;
      } catch (err) {
        console.error("Unexpected error deleting crew:", err);
        setError(err instanceof Error ? err.message : "Failed to delete crew");
        return false;
      }
    },
    [isSuper]
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
        // Update schedules + tasks via direct REST.
        await replaceCrewAssignments(oldName, newName, "Crew renamed on active schedule entries");
        await directPatchByFilter(
          "tasks",
          [`assigned_crew=eq.${encodeURIComponent(oldName)}`],
          { assigned_crew: newName },
          "useCrews.renameCrew.tasks",
        );

        // Update local state
        setCrews((prev) =>
          prev
            .map((c) => (c.name === oldName ? { ...c, name: newName } : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error renaming crew:", err);
        setError(err instanceof Error ? err.message : "Failed to rename crew");
        return false;
      }
    },
    [isSuper, crews]
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
        const today = todayLocal();
        try {
          await saveCrewAssignment(foremanId, today, crewName, "Crew foreman assigned");
        } catch (err) {
          console.error("Error setting foreman:", err);
          setError(err instanceof Error ? err.message : "Failed to set foreman");
          return false;
        }
      }

      // Refresh to get updated data
      await fetchCrews();
      return true;
    },
    [isSuper, fetchCrews]
  );

  // Add member to crew (via schedule assignment for today)
  const addMemberToCrew = useCallback(
    async (userId: string, crewName: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can manage crew members");
        return false;
      }

      try {
        const today = todayLocal();
        await saveCrewAssignment(userId, today, crewName, "Employee assigned to crew");

        await fetchCrews();
        return true;
      } catch (err) {
        console.error("Unexpected error adding member:", err);
        setError("Failed to add member to crew");
        return false;
      }
    },
    [isSuper, fetchCrews]
  );

  // Remove member from crew
  const removeMemberFromCrew = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!isSuper) {
        setError("Only superintendents can manage crew members");
        return false;
      }

      try {
        const today = todayLocal();
        await saveCrewAssignment(userId, today, null, "Employee removed from crew");

        await fetchCrews();
        return true;
      } catch (err) {
        console.error("Unexpected error removing member:", err);
        setError(err instanceof Error ? err.message : "Failed to remove member from crew");
        return false;
      }
    },
    [isSuper, fetchCrews]
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
