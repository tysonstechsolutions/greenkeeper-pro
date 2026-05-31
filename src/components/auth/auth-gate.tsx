"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";

/**
 * Client-side replacement for the old Next.js middleware.ts.
 *
 * Responsibilities:
 *  1. If an unauthenticated user lands on a protected route → push to /pin-login.
 *  2. If an authenticated user lands on a login route → push to /dashboard.
 *  3. While the auth state is still loading, render `children` — individual
 *     pages already show their own loading UI.
 *
 * This runs in every environment including the Capacitor native shell, where
 * there is no Next.js server to do SSR redirects.
 */

// Keep in sync with PUBLIC_ROUTES in src/components/layout/app-shell.tsx and
// src/lib/providers/auth-provider.tsx. /install and /offline must be public —
// the install prompt redirects here from the PWA banner, and /offline is the
// fallback served by the service worker when the network is down.
const PUBLIC_PREFIXES = [
  "/login",
  "/pin-login",
  "/invite",
  "/auth/callback",
  "/auth/confirm",
  "/join",
  "/install",
  "/offline",
  "/.well-known",
  "/manifest.json",
  "/sw.js",
  "/icons",
  "/twa",
];

const LOGIN_ROUTES = new Set(["/login", "/pin-login"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!pathname) return;

    // Logged-out user hitting a protected route
    if (!user && !isPublic(pathname)) {
      router.replace("/pin-login");
      return;
    }

    // Logged-in user hitting a login page
    if (user && LOGIN_ROUTES.has(pathname)) {
      router.replace("/dashboard");
    }
  }, [user, loading, pathname, router]);

  return <>{children}</>;
}
