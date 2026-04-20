"use client";

import { useEffect } from "react";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Bridges the Next.js App Router's `dynamicParams: false` + static export
 * limitation with our runtime navigation needs.
 *
 * Problem: every dynamic route in the app (/tasks/[id], /equipment/[id],
 * /assets/[id], etc.) is exported with `dynamicParams = false` and a single
 * placeholder param ("_"). Next's client-side router refuses to navigate
 * to any other id via `<Link>` because, from its view, the route was only
 * rendered for "_" — clicks silently fail and the user appears stuck on
 * the previous page. MainActivity.java already takes care of the WebView
 * asset fallback (serving /tasks/_/index.html when /tasks/<real-id>/index.html
 * is missing). This component takes care of the OTHER half: when a user
 * clicks an anchor that points to a non-pre-rendered dynamic route, we
 * intercept and force a real full-page navigation (window.location.href)
 * so the WebView actually asks for the URL and our Java fallback kicks in.
 *
 * The interceptor uses the document-level CAPTURE phase so it runs before
 * Next's own Link click handler and can preventDefault + stopPropagation
 * cleanly.
 */

// Dynamic-route prefixes. Keep in sync with MainActivity.java's
// DYNAMIC_PREFIXES (most specific first).
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

function isUnknownDynamicPath(pathname: string): boolean {
  for (const prefix of DYNAMIC_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    if (!rest) return false; // list page
    const segment = rest.split("/", 1)[0];
    if (!segment) return false;
    if (RESERVED_SEGMENTS.has(segment)) return false;
    return true;
  }
  return false;
}

export function DynamicLinkInterceptor() {
  useEffect(() => {
    function handler(e: MouseEvent) {
      // Only left-clicks without modifier keys (those are user-initiated
      // "open in new tab" gestures that we shouldn't intercept).
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
      // Only same-origin navigations.
      if (url.origin !== window.location.origin) return;

      const path = url.pathname.endsWith("/")
        ? url.pathname
        : url.pathname + "/";

      // Record the click regardless — makes "I tapped it and nothing
      // happened" debuggable because the breadcrumb log shows the click
      // AND the (missing) navigation that should have followed.
      recordBreadcrumb(
        "click",
        `Link click → ${url.pathname}`,
        isUnknownDynamicPath(path)
          ? "dynamic route — forcing hard nav"
          : undefined,
      );

      if (!isUnknownDynamicPath(path)) return;

      // Force a real navigation so the WebView asset loader runs our
      // Java-side dynamic-path fallback. Preserve query + hash.
      e.preventDefault();
      e.stopPropagation();
      window.location.href = url.pathname + url.search + url.hash;
    }

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
