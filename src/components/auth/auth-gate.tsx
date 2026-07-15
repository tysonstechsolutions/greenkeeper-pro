"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { stripTrailingSlash } from "@/lib/utils/page-title";

const PUBLIC_ROUTES = new Set([
  "/login",
  "/pin-login",
  "/join",
  "/install",
  "/offline",
]);

function isPublicRoute(pathname: string): boolean {
  // next.config sets trailingSlash: true, so usePathname() can report
  // "/pin-login/" — normalize before matching or the PIN page itself gets
  // gated and the redirect loops forever on a fresh device.
  const normalized = stripTrailingSlash(pathname);
  return PUBLIC_ROUTES.has(normalized) || normalized.startsWith("/invite/");
}

/** Require an individual session for every operational route. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      const returnTo = pathname.startsWith("/") ? pathname : "/today";
      router.replace(`/pin-login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isPublic, loading, pathname, router, user]);

  if (!isPublic && (loading || !user)) {
    return (
      <div
        className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>{loading ? "Checking your sign-in…" : "Taking you to sign in…"}</span>
      </div>
    );
  }

  return <>{children}</>;
}
