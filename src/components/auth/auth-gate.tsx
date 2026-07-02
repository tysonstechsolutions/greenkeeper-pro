"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Access is fully open: the app auto-signs-in with a shared account in
 * useAuth (no PIN, no roles), so there is no auth gate anymore.
 *
 * We only bounce the now-defunct login routes back into the app so stale
 * links / bookmarks / the old service-worker shell don't dead-end on an
 * empty PIN screen.
 */
const DEFUNCT_LOGIN_ROUTES = new Set(["/login", "/pin-login"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname && DEFUNCT_LOGIN_ROUTES.has(pathname)) {
      router.replace("/today");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
