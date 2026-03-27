"use client";

import React from "react";
import { AuthContext, useAuthInternal } from "@/lib/hooks/useAuth";

/**
 * AuthProvider wraps the app so all useAuth() calls share a single
 * auth state instance. This prevents 60+ duplicate getSession() and
 * fetchProfile() calls that were causing severe performance issues.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthInternal();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
