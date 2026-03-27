"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  isPro: boolean;
  isMember: boolean;
  isStaff: boolean; // Any internal staff (not member)
  // Permission helpers
  isManager: boolean; // super or asst_super or pro
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
  const initializedRef = useRef(false);

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
    // Use onAuthStateChange as the SOLE session source.
    // Supabase v2 fires INITIAL_SESSION immediately, so we don't need
    // a separate getSession() call. Calling both causes a navigator.locks
    // deadlock where getSession() waits for a lock held by onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // On initial session or sign in, fetch the profile
          if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
            if (event === "SIGNED_IN" && !initializedRef.current) {
              // Small delay on sign-in to allow the DB trigger to create the profile
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            const profileData = await fetchProfile(newSession.user.id);
            setProfile(profileData);
          }
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
        }

        // Mark loading complete after the first event (INITIAL_SESSION)
        if (!initializedRef.current) {
          initializedRef.current = true;
          setLoading(false);
        }
      }
    );

    // Safety timeout: if onAuthStateChange hasn't fired within 5s, stop loading
    const timeout = setTimeout(() => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
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
  const isPro = role === "pro";
  const isMember = role === "member";
  const isStaff = role !== "member" && role !== undefined;

  // Permission helpers
  const isManager = isSuper || isAsstSuper || isPro;
  const canCreateInvites = isSuper || isAsstSuper; // Pro cannot create invites
  const canManageEquipment = isSuper || isAsstSuper || isMechanic;
  const canManageChemicals = isSuper || isAsstSuper;
  const canApproveTimesheets = isSuper || isAsstSuper || isForeman;

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
    isPro,
    isMember,
    isStaff,
    isManager,
    canCreateInvites,
    canManageEquipment,
    canManageChemicals,
    canApproveTimesheets,
  };
}
