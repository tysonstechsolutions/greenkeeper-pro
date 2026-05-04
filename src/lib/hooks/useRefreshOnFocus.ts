"use client";

import { useEffect } from "react";

/**
 * Calls `refetch` whenever the tab regains focus or the document becomes
 * visible. Pages that fetch data on mount go stale when the user navigates
 * to a child route (e.g. /new, /view) and back — listing this hook re-fetches
 * on return without forcing a full reload.
 *
 *   const { items, refetch } = useThings();
 *   useRefreshOnFocus(refetch);
 *
 * Pass `enabled=false` while the page hasn't loaded its prerequisites yet
 * (e.g. waiting on auth) to avoid firing fetches against an unauthenticated
 * client.
 */
export function useRefreshOnFocus(
  refetch: () => void | Promise<unknown>,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch, enabled]);
}
