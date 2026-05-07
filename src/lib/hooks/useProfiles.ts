"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { directSelectRow } from "@/lib/supabase/rest";
import { resolveAccessToken } from "@/lib/api/client";
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

  // Fetch active profiles, optionally filtered by role.
  //
  // Uses raw REST instead of supabase.from() — supabase-js's auth
  // wrapper has been observed to wedge after a save/navigation,
  // leaving consumers like the AST-inspection form stuck at
  // "Loading staff..." with no breadcrumb. Going straight to PostgREST
  // with the localStorage-cached JWT sidesteps that path.
  const fetchProfiles = useCallback(
    async (role?: UserRole | UserRole[]) => {
      setLoading(true);
      setError(null);

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
        const token = await resolveAccessToken(supabase, supabaseUrl, anonKey);

        const params = new URLSearchParams({
          select: "id,full_name,display_name,role,avatar_url,phone",
          is_active: "eq.true",
          order: "role.asc,full_name.asc",
          limit: "50",
        });
        if (role) {
          const list = Array.isArray(role) ? role : [role];
          // PostgREST `in()` filter syntax: in.(value1,value2)
          params.set("role", `in.(${list.join(",")})`);
        }

        const url = `${supabaseUrl}/rest/v1/profiles?${params.toString()}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        let res: Response;
        try {
          res = await fetch(url, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
            },
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const message = `Profiles query failed: ${res.status} ${res.statusText}`;
          console.error(message);
          setError(message);
          return;
        }

        const data = (await res.json()) as ProfileSummary[];
        setProfiles(data || []);
      } catch (err) {
        console.error("Unexpected error fetching profiles:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
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

  // Get a full profile by ID from database (async). Direct REST so the
  // lookup can't wedge on a stalled supabase-js auth wrapper.
  const getProfileAsync = useCallback(
    async (id: string): Promise<Profile | null> => {
      try {
        return await directSelectRow<Profile>(
          "profiles",
          "id",
          id,
          "*",
          "useProfiles.getProfileAsync",
        );
      } catch (err) {
        console.error("Unexpected error fetching profile:", err);
        return null;
      }
    },
    []
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
