"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root ("/") page — client-side redirect to My Duties, the app's home: the
 * GM's own work by day, week, month, quarter, and year. The full Operations
 * Command Center (all work, crew sheets) is one tap away from there.
 *
 * Kept as a client component so no NEXT_REDIRECT instruction is baked into
 * out/index.html (that HTML serves as Capacitor's SPA fallback; a baked
 * redirect would hijack any unmatched path).
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/my-duties");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    </div>
  );
}
