"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Email login has been retired. /login now only exists as a compatibility
 * shim that redirects to /pin-login, preserving any `returnTo` query param
 * passed in by the session-expired interceptor.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnTo = searchParams.get("returnTo");
    const target = returnTo
      ? `/pin-login?returnTo=${encodeURIComponent(returnTo)}`
      : "/pin-login";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Taking you to PIN login…</p>
      </div>
    </div>
  );
}
