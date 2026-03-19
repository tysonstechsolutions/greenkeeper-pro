"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/types/database";

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Role helpers
  isSuper: boolean;
  isAsstSuper: boolean;
  isForeman: boolean;
  isMechanic: boolean;
  isCrew: boolean;
  isSeasonal: boolean;
  // Permission helpers
  isManager: boolean; // super or asst_super
  canCreateInvites: boolean;
  canManageEquipment: boolean;
  canManageChemicals: boolean;
  canApproveTimesheets: boolean;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
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
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id);
    if (profileData) {
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          const profileData = await fetchProfile(initialSession.user.id);
          setProfile(profileData);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        setError("Failed to initialize authentication");
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === "SIGNED_IN" && newSession?.user) {
          // Small delay to allow trigger to create profile
          await new Promise(resolve => setTimeout(resolve, 100));
          const profileData = await fetchProfile(newSession.user.id);
          setProfile(profileData);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return { error: signInError.message };
    }

    return { error: null };
  };

  const signOut = async () => {
    setError(null);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // Role checks
  const role = profile?.role as UserRole | undefined;
  const isSuper = role === "super";
  const isAsstSuper = role === "asst_super";
  const isForeman = role === "foreman";
  const isMechanic = role === "mechanic";
  const isCrew = role === "crew";
  const isSeasonal = role === "seasonal";

  // Permission helpers
  const isManager = isSuper || isAsstSuper;
  const canCreateInvites = isManager;
  const canManageEquipment = isManager || isMechanic;
  const canManageChemicals = isManager;
  const canApproveTimesheets = isManager || isForeman;

  return {
    user,
    session,
    profile,
    loading,
    error,
    signIn,
    signOut,
    refreshProfile,
    isSuper,
    isAsstSuper,
    isForeman,
    isMechanic,
    isCrew,
    isSeasonal,
    isManager,
    canCreateInvites,
    canManageEquipment,
    canManageChemicals,
    canApproveTimesheets,
  };
}
