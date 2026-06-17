"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useView } from "@/lib/providers/view-provider";

/**
 * Root ("/") page — client-side redirect to the current view's home
 * (/dashboard for Superintendent, /gm for General Manager).
 *
 * Kept as a client component so no NEXT_REDIRECT instruction is baked into
 * out/index.html (that HTML serves as Capacitor's SPA fallback; a baked
 * redirect would hijack any unmatched path). When no view is chosen yet the
 * AppShell renders the first-launch picker, so we just wait.
 */
export default function Home() {
  const router = useRouter();
  const { ready, chosen, view, homeFor } = useView();

  useEffect(() => {
    if (!ready || !chosen) return;
    router.replace(homeFor(view));
  }, [ready, chosen, view, homeFor, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    </div>
  );
}
