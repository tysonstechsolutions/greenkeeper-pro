"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Root ("/") page.
 *
 * Historically this was `export default function Home() { redirect("/dashboard"); }`.
 * In static export mode Next.js bakes that redirect into out/index.html as a
 * NEXT_REDIRECT instruction — and that HTML doubles as Capacitor's SPA
 * fallback for ANY unmatched asset path in the APK. The baked redirect
 * then fired before any of our JS could run, sending users to /dashboard
 * regardless of what URL they actually wanted (this was the root cause of
 * every "clicking X sends me to dashboard" report — /tasks/abc/,
 * /assets (no trailing slash), hard-reload on a deep URL, etc.).
 *
 * As a client component this file no longer bakes a redirect into the HTML.
 * The useEffect below inspects the real browser URL and dispatches:
 *   - Actual visit to "/":  client-side replace to /dashboard
 *   - Unknown dynamic path (e.g. /tasks/abc, served as SPA fallback):
 *     stash a route-replay and navigate to the known-good /tasks/_/
 *     placeholder. RouteReplay then rewrites the URL back.
 *   - Static path missing a trailing slash (e.g. /assets): add the slash
 *     and navigate normally so the correct route renders.
 *   - Anything else: fall back to /dashboard.
 */

// KEEP IN SYNC with dynamic-link-interceptor.tsx (and MainActivity.java).
const DYNAMIC_PREFIXES = [
  "/course-map/green/",
  "/course-map/",
  "/polls/results/",
  "/settings/staff/",
  "/tasks/",
  "/equipment/",
  "/assets/",
  "/chemicals/",
  "/plan/",
  "/tournaments/",
];

const RESERVED_SEGMENTS = new Set([
  "_",
  "new",
  "edit",
  "scan",
  "manage",
  "calendar",
  "morning",
  "time-off",
  "crews",
  "pin-sheet",
  "pins",
]);

const REPLAY_KEY = "vmgc:route-replay";

interface DynamicMatch {
  prefix: string;
  id: string;
}

function classify(pathname: string): DynamicMatch | null {
  const p = pathname.endsWith("/") ? pathname : pathname + "/";
  for (const prefix of DYNAMIC_PREFIXES) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) return null;
    const segment = rest.split("/", 1)[0];
    if (!segment || RESERVED_SEGMENTS.has(segment)) return null;
    return { prefix, id: segment };
  }
  return null;
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    recordBreadcrumb("lifecycle", `Root page resolving from ${path || "/"}`);

    // Actual root visit — go to dashboard.
    if (path === "/" || path === "") {
      router.replace("/dashboard");
      return;
    }

    // Dynamic route served as SPA fallback. Stash the intended URL and
    // navigate to the known-good placeholder; RouteReplay will restore
    // the URL bar after load.
    const match = classify(path);
    if (match) {
      const desiredUrl =
        (path.endsWith("/") ? path : path + "/") + search + hash;
      try {
        sessionStorage.setItem(
          REPLAY_KEY,
          JSON.stringify({
            desiredUrl,
            placeholder: match.prefix + "_/",
            stashedAt: Date.now(),
          }),
        );
      } catch {
        /* storage unavailable; continue without replay */
      }
      window.location.replace(match.prefix + "_/");
      return;
    }

    // Static path served as SPA fallback (likely missing trailing slash
    // or an unknown route). Add the slash and navigate — if the real
    // page exists, Next's router will load it; if not, dashboard is a
    // reasonable fallback.
    const normalized = path.endsWith("/") ? path : path + "/";
    if (normalized !== path) {
      router.replace(normalized + search + hash);
      return;
    }

    // Last resort.
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    </div>
  );
}
