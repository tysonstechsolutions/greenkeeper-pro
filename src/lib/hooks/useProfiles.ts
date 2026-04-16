"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types/database";

// Lighter profile type for lists/dropdowns
export interface ProfileSummary {
  id: string;
  full_name: string;
  display_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
}

interface UseProfilesReturn {
  profiles: ProfileSummary[];
  loading: boolean;
  error: string | null;
  fetchProfiles: (role?: UserRole | UserRole[]) => Promise<void>;
  getProfile: (id: string) => ProfileSummary | undefined;
  getProfileAsync: (id: string) => Promise<Profile | null>;
  getProfilesByRole: (role: UserRole) => ProfileSummary[];
  managers: ProfileSummary[];
  foremen: ProfileSummary[];
  crewMembers: ProfileSummary[];
  mechanics: ProfileSummary[];
  allStaff: ProfileSummary[];
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch active profiles, optionally filtered by role
  const fetchProfiles = useCallback(
    async (role?: UserRole | UserRole[]) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("profiles")
          .select("id, full_name, display_name, role, avatar_url, phone")
          .eq("is_active", true)
          .order("role", { ascending: true })
          .order("full_name", { ascending: true })
          .limit(50); // Reasonable limit for golf course staff

        if (role) {
          if (Array.isArray(role)) {
            query = query.in("role", role);
          } else {
            query = query.eq("role", role);
          }
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching profiles:", fetchError);
          setError(fetchError.message);
          return;
        }

        setProfiles((data as ProfileSummary[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching profiles:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Get a profile by ID from local state (synchronous)
  const getProfile = useCallback(
    (id: string): ProfileSummary | undefined => {
      return profiles.find((p) => p.id === id);
    },
    [profiles]
  );

  // Get a full profile by ID from database (async)
  const getProfileAsync = useCallback(
    async (id: string): Promise<Profile | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          console.error("Error fetching profile:", fetchError);
          return null;
        }

        return data as Profile;
      } catch (err) {
        console.error("Unexpected error fetching profile:", err);
        return null;
      }
    },
    [supabase]
  );

  // Get profiles by role from local state
  const getProfilesByRole = useCallback(
    (role: UserRole): ProfileSummary[] => {
      return profiles.filter((p) => p.role === role);
    },
    [profiles]
  );

  // Memoized filtered lists for common access patterns
  const managers = useMemo(
    () => profiles.filter((p) => p.role === "super" || p.role === "asst_super"),
    [profiles]
  );

  const foremen = useMemo(
    () => profiles.filter((p) => p.role === "foreman"),
    [profiles]
  );

  const crewMembers = useMemo(
    () => profiles.filter((p) => p.role === "crew" || p.role === "seasonal"),
    [profiles]
  );

  const mechanics = useMemo(
    () => profiles.filter((p) => p.role === "mechanic"),
    [profiles]
  );

  // All non-super staff who can be assigned tasks
  const allStaff = useMemo(
    () => profiles.filter((p) => p.role !== "super"),
    [profiles]
  );

  // Initial fetch
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return {
    profiles,
    loading,
    error,
    fetchProfiles,
    getProfile,
    getProfileAsync,
    getProfilesByRole,
    managers,
    foremen,
    crewMembers,
    mechanics,
    allStaff,
  };
}

// Role display labels
export const roleLabels: Record<UserRole, string> = {
  super: "Superintendent",
  asst_super: "Asst. Superintendent",
  pro: "Golf Professional",
  foreman: "Foreman",
  mechanic: "Mechanic",
  crew: "Crew Member",
  seasonal: "Seasonal",
  director: "Director",
  gm: "General Manager",
};

// Role badge colors for UI
export const roleColors: Record<UserRole, { bg: string; text: string }> = {
  super: { bg: "bg-primary/10", text: "text-primary" },
  gm: { bg: "bg-emerald-500/10", text: "text-emerald-700" },
  director: { bg: "bg-indigo-500/10", text: "text-indigo-600" },
  asst_super: { bg: "bg-blue-500/10", text: "text-blue-600" },
  pro: { bg: "bg-teal-500/10", text: "text-teal-600" },
  foreman: { bg: "bg-amber-500/10", text: "text-amber-600" },
  mechanic: { bg: "bg-purple-500/10", text: "text-purple-600" },
  crew: { bg: "bg-green-500/10", text: "text-green-600" },
  seasonal: { bg: "bg-gray-500/10", text: "text-gray-600" },
};

// Get display name (prefer display_name, fallback to full_name)
export function getDisplayName(profile: { display_name?: string | null; full_name?: string | null }): string {
  return profile.display_name || profile.full_name || "Unknown";
}

// Get initials from name
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
