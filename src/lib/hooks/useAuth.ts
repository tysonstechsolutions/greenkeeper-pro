"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/types/database";

export interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Role helpers
  isSuper: boolean;
  isAsstSuper: boolean;
  isForeman: boolean;
  isMechanic: boolean;
  isCrew: boolean;
  isSeasonal: boolean;
  isPro: boolean;
  isDirector: boolean;
  isGM: boolean;
  isStaff: boolean; // Any internal staff
  // Permission helpers
  isManager: boolean; // super or asst_super or pro or director or gm
  canCreateInvites: boolean;
  canManageEquipment: boolean;
  canManageChemicals: boolean;
  canApproveTimesheets: boolean;
}

const defaultAuthState: UseAuthReturn = {
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshProfile: async () => {},
  isSuper: false,
  isAsstSuper: false,
  isForeman: false,
  isMechanic: false,
  isCrew: false,
  isSeasonal: false,
  isPro: false,
  isDirector: false,
  isGM: false,
  isStaff: false,
  isManager: false,
  canCreateInvites: false,
  canManageEquipment: false,
  canManageChemicals: false,
  canApproveTimesheets: false,
};

// Shared context — all components using useAuth() get the same state
export const AuthContext = createContext<UseAuthReturn>(defaultAuthState);

/**
 * Hook that provides auth state from the AuthProvider context.
 * All 60+ components that call useAuth() now share a single auth instance.
 */
export function useAuth(): UseAuthReturn {
  return useContext(AuthContext);
}

/**
 * Internal hook with all the auth logic. Only used by AuthProvider (once).
 * This ensures a single getSession() and fetchProfile() call for the entire app.
 */
export function useAuthInternal(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profileFetchedRef = useRef(false);
  const mountedRef = useRef(true);

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (fetchError) {
        console.error("Error fetching profile:", fetchError);
        setError("Failed to load profile");
        return null;
      }

      return data as Profile;
    } catch (err) {
      console.error("Exception fetching profile:", err);
      return null;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id);
    if (profileData && mountedRef.current) {
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  // Primary initialization: use getSession() for the initial load,
  // then onAuthStateChange for subsequent events only.
  // This avoids the navigator.locks race condition where INITIAL_SESSION
  // can throw AbortError due to lock stealing.
  useEffect(() => {
    mountedRef.current = true;
    profileFetchedRef.current = false;

    let subscription: { unsubscribe: () => void } | null = null;

    const initialize = async () => {
      try {
        // Step 1: Get current session directly (no lock contention)
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (!mountedRef.current) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);

          // Fetch profile immediately
          const profileData = await fetchProfile(currentSession.user.id);
          if (mountedRef.current && profileData) {
            setProfile(profileData);
            profileFetchedRef.current = true;
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }

      // Step 2: Listen for future auth changes (sign in, sign out, token refresh)
      const { data } = supabase.auth.onAuthStateChange(
        async (event: string, newSession: Session | null) => {
          if (!mountedRef.current) return;

          // Skip INITIAL_SESSION since we already handled it above
          if (event === "INITIAL_SESSION") return;

          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (event === "SIGNED_IN" && newSession?.user) {
            // Small delay to let DB trigger create profile for new users
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!mountedRef.current) return;
            const profileData = await fetchProfile(newSession.user.id);
            if (mountedRef.current && profileData) {
              setProfile(profileData);
              profileFetchedRef.current = true;
            }
          } else if (event === "SIGNED_OUT") {
            setProfile(null);
            profileFetchedRef.current = false;
          } else if (event === "TOKEN_REFRESHED" && newSession?.user && !profileFetchedRef.current) {
            // If we missed the profile on initial load, try again on token refresh
            const profileData = await fetchProfile(newSession.user.id);
            if (mountedRef.current && profileData) {
              setProfile(profileData);
              profileFetchedRef.current = true;
            }
          }
        }
      );
      subscription = data.subscription;
    };

    initialize();

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  // Safety net: if we have a user but no profile after loading, retry once
  useEffect(() => {
    if (!loading && user && !profile && !profileFetchedRef.current) {
      const retryTimeout = setTimeout(async () => {
        const profileData = await fetchProfile(user.id);
        if (mountedRef.current && profileData) {
          setProfile(profileData);
          profileFetchedRef.current = true;
        }
      }, 500);
      return () => clearTimeout(retryTimeout);
    }
  }, [loading, user, profile, fetchProfile]);

  const signOut = async () => {
    setError(null);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    profileFetchedRef.current = false;
  };

  // Role checks
  const role = profile?.role as UserRole | undefined;
  const isSuper = role === "super";
  const isAsstSuper = role === "asst_super";
  const isForeman = role === "foreman";
  const isMechanic = role === "mechanic";
  const isCrew = role === "crew";
  const isSeasonal = role === "seasonal";
  const isPro = role === "pro";
  const isDirector = role === "director";
  const isGM = role === "gm";
  const isStaff = role !== undefined;

  // Permission helpers — director and gm can see everything (read-all oversight)
  const isManager = isSuper || isAsstSuper || isPro || isDirector || isGM;
  const canCreateInvites = isSuper || isAsstSuper || isDirector || isGM;
  const canManageEquipment = isSuper || isAsstSuper || isForeman || isMechanic || isDirector || isGM;
  const canManageChemicals = isSuper || isAsstSuper || isDirector || isGM;
  const canApproveTimesheets = isSuper || isAsstSuper || isForeman || isDirector || isGM;

  return {
    user,
    session,
    profile,
    loading,
    error,
    signOut,
    refreshProfile,
    isSuper,
    isAsstSuper,
    isForeman,
    isMechanic,
    isCrew,
    isSeasonal,
    isPro,
    isDirector,
    isGM,
    isStaff,
    isManager,
    canCreateInvites,
    canManageEquipment,
    canManageChemicals,
    canApproveTimesheets,
  };
}
