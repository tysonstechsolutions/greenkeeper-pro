"use client";

import { useEffect } from "react";

/**
 * Locks body scroll while a modal/sheet/lightbox is open so scrolling inside
 * the overlay doesn't chain to the page underneath. Restores the previous
 * `overflow` value when the component unmounts (or `active` flips back to
 * false), so nested modals stack correctly — each restores the value it saw.
 *
 * Pass `active=false` (or omit and rely on conditional mounting) to disable
 * the effect; the hook does nothing in that case.
 */
export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
