"use client";

import { useEffect } from "react";

/**
 * Scrolls focused inputs into view when the virtual keyboard opens on mobile.
 * Uses the VisualViewport API to detect keyboard appearance and scrolls
 * the active input above the keyboard.
 */
export function useKeyboardScroll() {
  useEffect(() => {
    // Only run on mobile-ish screens
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    // Use VisualViewport API if available (modern iOS Safari & Android Chrome)
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback: scroll on focus with a delay
      const handleFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT"
        ) {
          // Delay to let keyboard animate open
          setTimeout(() => {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 300);
        }
      };
      document.addEventListener("focusin", handleFocus);
      return () => document.removeEventListener("focusin", handleFocus);
    }

    let lastHeight = vv.height;

    const handleResize = () => {
      const currentHeight = vv.height;
      const heightDiff = lastHeight - currentHeight;

      // Keyboard opened (viewport shrank significantly)
      if (heightDiff > 100) {
        const activeEl = document.activeElement as HTMLElement | null;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "SELECT")
        ) {
          // Small delay for keyboard to fully settle
          setTimeout(() => {
            activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        }
      }

      lastHeight = currentHeight;
    };

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);
}
