"use client";

import { AuthContext, useAuthInternal } from "@/lib/hooks/useAuth";

/**
 * Shares one individual Supabase auth state across the application.
 * Missing or expired sessions are handled by AuthGate; this provider never
 * signs in a shared account or silently impersonates a manager.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthInternal();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
