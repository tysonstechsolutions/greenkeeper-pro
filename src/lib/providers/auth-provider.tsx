"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthContext, useAuthInternal } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Routes the user can be on while logged out. Redirects skip these.
// Keep in sync with `PUBLIC_ROUTES` / `PUBLIC_PREFIXES` in
// `src/components/layout/app-shell.tsx` and `src/components/auth/auth-gate.tsx`.
// /pin-login MUST be here — without it, a session-expired event firing while
// the user is on /pin-login would redirect them to /login → /pin-login,
// looping the unauthenticated user.
const PUBLIC_ROUTES = ["/login", "/pin-login", "/invite", "/install", "/offline", "/join"];

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * AuthProvider wraps the app so all useAuth() calls share a single
 * auth state instance. This prevents 60+ duplicate getSession() and
 * fetchProfile() calls that were causing severe performance issues.
 *
 * Also hosts a global session-expired interceptor: any hook that hits a
 * 401 / RLS-rejected request can dispatch `auth:session-expired` and the
 * provider will punt the user to the PIN login screen automatically.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthInternal();
  const router = useRouter();
  const pathname = usePathname();

  // Global 401 / session-expired interceptor.
  useEffect(() => {
    const supabase = createClient();
    let redirecting = false;

    const goToLogin = () => {
      if (redirecting) return;
      if (isPublicRoute(pathname)) return;
      redirecting = true;
      // Preserve where they were so we can bounce them back after re-login.
      const returnTo = pathname || "/";
      try {
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      } catch {
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
      }
    };

    const onSessionExpired = async () => {
      // Double-check with Supabase before bouncing: we don't want to punt
      // the user because of a single transient network error.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) goToLogin();
    };

    // Custom event dispatched from hooks when a request sees a missing session.
    window.addEventListener("auth:session-expired", onSessionExpired);

    // Supabase itself can also tell us the token refresh died.
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        goToLogin();
      } else if (event === "TOKEN_REFRESHED" && !session) {
        goToLogin();
      }
    });

    return () => {
      window.removeEventListener("auth:session-expired", onSessionExpired);
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
