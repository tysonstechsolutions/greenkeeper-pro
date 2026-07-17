"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { directSelectRow } from "@/lib/supabase/rest";
import { supabaseAuthStorageKey } from "@/lib/supabase/persist-session";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Hard ceiling on supabase.auth.getSession(). That call has been the source
// of every "stuck on Loading..." wedge we've chased — its internal lock can
// hang indefinitely after navigation or a stalled token refresh. If it
// hasn't returned in this long, we give up and proceed with whatever we
// could read from localStorage (or none at all). 4s is well above a healthy
// localStorage round-trip but well below the user's patience threshold.
const GET_SESSION_TIMEOUT_MS = 4_000;

interface CachedSessionLike {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: User;
  provider_token?: string | null;
  provider_refresh_token?: string | null;
}

/**
 * Read the persisted Supabase session synchronously from localStorage.
 * Bypasses supabase.auth.getSession() entirely so we never block on an
 * internal auth lock. Returns null when missing or unparseable; the caller
 * decides whether to also try the slower async path.
 *
 * Supabase persists the session as plain JSON under
 * `sb-<project-ref>-auth-token` (the default localStorage adapter). We
 * derive the project ref from the URL and read directly.
 */
function readCachedSession(): CachedSessionLike | null {
  if (typeof window === "undefined") return null;
  try {
    const key = supabaseAuthStorageKey(SUPABASE_URL);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CachedSessionLike;
  } catch {
    return null;
  }
}

/**
 * True when the cached session's access token is at or past its expiry
 * (with a 30-second safety buffer to cover clock skew and the time it
 * takes us to actually use the token). When false, the token is still
 * usable for PostgREST calls; when true, we should let supabase try to
 * refresh.
 */
function isCachedSessionExpired(s: CachedSessionLike): boolean {
  if (typeof s.expires_at !== "number") return false;
  // expires_at is unix seconds.
  return Date.now() / 1000 >= s.expires_at - 30;
}

/**
 * Race a promise against a hard timeout. Resolves with `null` instead of
 * throwing on timeout, so the caller can treat "auth client is wedged" the
 * same as "no session" — both mean: proceed without a session, let the
 * onAuthStateChange listener pick up future events.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T | null>([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

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
    // Direct REST instead of supabase.from("profiles") — supabase-js's
    // auth wrapper can wedge after navigation/login, leaving the entire
    // app stuck on "Loading..." indefinitely. Since this hook gates the
    // header avatar AND any page that checks `loading`/`profile`, a
    // wedge here breaks the whole UI. Going straight to PostgREST
    // sidesteps the auth-mutex contention.
    try {
      const data = await directSelectRow<Profile>(
        "profiles",
        "id",
        userId,
        "*",
        "useAuth.fetchProfile",
      );
      if (!data) {
        // Profile row missing — common briefly for brand-new accounts;
        // the safety-net retry below picks it up after the DB trigger.
        return null;
      }
      return data;
    } catch (err) {
      console.error("Exception fetching profile:", err);
      setError("Failed to load profile");
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id);
    if (profileData && mountedRef.current) {
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  // Primary initialization: read the persisted session from localStorage
  // synchronously, then register onAuthStateChange for subsequent events.
  // We deliberately AVOID supabase.auth.getSession() on the primary path —
  // it has wedged the entire app on "Loading..." too many times, and the
  // session JSON it would return is the same JSON we can read directly.
  // Falls through to a timeout-bounded getSession() only when the cache
  // is missing or expired, so a wedge can't stall the UI past 4 seconds.
  useEffect(() => {
    mountedRef.current = true;
    profileFetchedRef.current = false;

    let subscription: { unsubscribe: () => void } | null = null;

    const initialize = async () => {
      try {
        // Step 1: Try the synchronous localStorage path FIRST. supabase.auth.
        // getSession() has a long history of wedging — its internal lock
        // can hang after navigation or a stalled refresh, leaving every
        // page that calls useAuth() stuck on "Loading..." indefinitely.
        // Reading the persisted session JSON directly is sync, can't hang,
        // and gives us everything we need to render the app.
        const cached = readCachedSession();
        let initialSession: Session | null = null;

        if (cached?.user && cached.access_token && !isCachedSessionExpired(cached)) {
          // The cached session is valid — use it immediately. Cast through
          // unknown because the persisted shape is a subset of Session
          // (provider_token etc. may be absent), but every field PostgREST
          // and our hooks care about (access_token + user) is present.
          initialSession = cached as unknown as Session;
        } else {
          // No cached session, or it's expired. Try the async getSession()
          // call as a fallback — but with a hard timeout so a wedged auth
          // lock can't keep the whole app on the loading spinner forever.
          // If it times out we treat it the same as "no session" and let
          // the auth-state listener catch up if/when it resolves.
          const result = await withTimeout(
            supabase.auth.getSession(),
            GET_SESSION_TIMEOUT_MS,
          );
          if (result === null) {
            console.warn(
              `[useAuth] supabase.auth.getSession() timed out after ${GET_SESSION_TIMEOUT_MS}ms — proceeding without session`,
            );
          } else {
            initialSession =
              (result as { data?: { session?: Session | null } } | null)?.data
                ?.session ?? null;
          }
        }

        // An absent session remains absent. AuthGate sends operational routes
        // to PIN login, where a PIN establishes that employee's own session.
        if (!mountedRef.current) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);

          // Fetch profile immediately. Uses direct REST so it can't wedge
          // even if the supabase-js auth wrapper is in a bad state.
          const profileData = await fetchProfile(initialSession.user.id);
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

  // Role and permission checks use only the authenticated user's profile.
  // A missing profile never receives synthetic or elevated permissions.
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
