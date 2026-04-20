"use client";

import { useEffect } from "react";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Makes dynamic-route navigation work in the static export + Capacitor
 * Android WebView.
 *
 * Problem: every dynamic route (/tasks/[id], /equipment/[id], etc.) is
 * pre-rendered to a single "_" placeholder because Next.js static export
 * with dynamicParams: false allows nothing else. A real click to
 * /tasks/abc123/ has no matching index.html in the APK, and Capacitor's
 * LocalServer falls back to serving /index.html (the dashboard). Users
 * tap an overdue task and land on the dashboard.
 *
 * Previous attempts tried to intercept the WebView request in Java and
 * rewrite the asset path. That proved fragile — multiple subtle
 * interaction points between Capacitor's client, Android's asset
 * resolution, and Next's router.
 *
 * This version is client-side only and doesn't touch the WebView asset
 * layer. Flow:
 *   1. User clicks an <a> pointing at an unknown dynamic path.
 *   2. We stash { desiredUrl } in sessionStorage and redirect
 *      window.location to the KNOWN-GOOD placeholder (/tasks/_/).
 *   3. The placeholder HTML loads. A sibling component
 *      (RouteReplay in layout.tsx) reads sessionStorage BEFORE React
 *      hydrates and calls history.replaceState to restore the real
 *      URL the user expected.
 *   4. useParams() reads from window.location, returning the real id.
 *
 * Advantage: we only ever ask the WebView for files we know exist.
 * The URL bar still reflects the real route. No Java code required.
 */

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

function classifyPath(pathname: string): { prefix: string; id: string } | null {
  const withSlash = pathname.endsWith("/") ? pathname : pathname + "/";
  for (const prefix of DYNAMIC_PREFIXES) {
    if (!withSlash.startsWith(prefix)) continue;
    const rest = withSlash.slice(prefix.length);
    if (!rest) return null;
    const segment = rest.split("/", 1)[0];
    if (!segment) return null;
    if (RESERVED_SEGMENTS.has(segment)) return null;
    return { prefix, id: segment };
  }
  return null;
}

export function DynamicLinkInterceptor() {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const classification = classifyPath(url.pathname);
      recordBreadcrumb(
        "click",
        `Link click → ${url.pathname}`,
        classification ? "dynamic route — replay via placeholder" : undefined,
      );
      if (!classification) return;

      // The KNOWN-GOOD placeholder path this dynamic route was
      // pre-rendered to: e.g. /tasks/_/ for /tasks/[id].
      const placeholder = classification.prefix + "_/";
      const desiredPath = url.pathname.endsWith("/")
        ? url.pathname
        : url.pathname + "/";
      const desiredUrl = desiredPath + url.search + url.hash;

      try {
        sessionStorage.setItem(
          REPLAY_KEY,
          JSON.stringify({
            desiredUrl,
            placeholder,
            stashedAt: Date.now(),
          }),
        );
      } catch {
        // If storage is unavailable we still navigate; page will render
        // the placeholder without a pretty URL rewrite.
      }

      e.preventDefault();
      e.stopPropagation();
      window.location.href = placeholder;
    }

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}

/**
 * Runs once per page load, BEFORE the rest of the app has a chance to
 * read window.location. If the previous page stashed a desired URL in
 * sessionStorage and we're on the matching placeholder, rewrite the URL
 * bar so useParams() / usePathname() / nav breadcrumbs see the real
 * route. Also records a breadcrumb so the debug log shows both the
 * click AND the replay resolution.
 */
export function RouteReplay() {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REPLAY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        desiredUrl?: string;
        placeholder?: string;
        stashedAt?: number;
      };
      sessionStorage.removeItem(REPLAY_KEY);
      if (!parsed?.desiredUrl || !parsed.placeholder) return;

      // Sanity: only replay if we actually loaded the matching
      // placeholder path and the stash is fresh (30s). Protects
      // against leftovers from an interrupted nav.
      const fresh =
        typeof parsed.stashedAt === "number" &&
        Date.now() - parsed.stashedAt < 30_000;
      const currentPath = window.location.pathname;
      const normalizedCurrent = currentPath.endsWith("/")
        ? currentPath
        : currentPath + "/";
      if (!fresh || normalizedCurrent !== parsed.placeholder) return;

      window.history.replaceState(
        window.history.state,
        "",
        parsed.desiredUrl,
      );
      recordBreadcrumb(
        "nav",
        `replay → ${parsed.desiredUrl}`,
        `from placeholder ${parsed.placeholder}`,
      );
    } catch {
      // Best-effort — if anything throws, the user just sees the
      // placeholder URL in the bar. App still works.
    }
  }, []);
  return null;
}
