"use client";

import { useEffect } from "react";
import { AuthContext, useAuthInternal } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * AuthProvider wraps the app so all useAuth() calls share a single auth
 * state instance.
 *
 * Access model is fully open: there is no login screen. useAuth auto-signs-in
 * with the shared "open app" account on boot. If the session ever dies (token
 * refresh failure, an explicit sign-out, a 401 from a hook), we silently
 * re-authenticate with the same shared account instead of bouncing to a
 * login page.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthInternal();

  useEffect(() => {
    const supabase = createClient();
    let reauthing = false;

    const reauth = async () => {
      if (reauthing) return;
      reauthing = true;
      try {
        const email = process.env.NEXT_PUBLIC_APP_EMAIL;
        const password = process.env.NEXT_PUBLIC_APP_PASSWORD;
        if (email && password) {
          await supabase.auth.signInWithPassword({ email, password });
        }
      } catch (e) {
        console.error("[auth] auto re-auth failed:", e);
      } finally {
        reauthing = false;
      }
    };

    // A hook hit a 401 / missing session — re-establish the shared session.
    const onSessionExpired = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) reauth();
    };
    window.addEventListener("auth:session-expired", onSessionExpired);

    // Supabase itself can tell us the token refresh died.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        if (event === "SIGNED_OUT") reauth();
        else if (event === "TOKEN_REFRESHED" && !session) reauth();
      },
    );

    return () => {
      window.removeEventListener("auth:session-expired", onSessionExpired);
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  );
}
