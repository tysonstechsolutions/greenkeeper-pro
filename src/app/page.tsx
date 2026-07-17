"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root ("/") page — client-side redirect to Operations, the app's single home.
 *
 * Kept as a client component so no NEXT_REDIRECT instruction is baked into
 * out/index.html (that HTML serves as Capacitor's SPA fallback; a baked
 * redirect would hijack any unmatched path).
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/operations");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    </div>
  );
}
