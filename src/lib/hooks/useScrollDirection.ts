"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook that tracks scroll direction to auto-hide/show UI elements.
 * Returns "up" when scrolling up (show header), "down" when scrolling down (hide header).
 * Includes a threshold to avoid jittery toggling on small scrolls.
 */
export function useScrollDirection(threshold = 10) {
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const updateDirection = useCallback(() => {
    const scrollY = window.scrollY;
    const diff = scrollY - lastScrollY.current;

    // Only update if scroll amount exceeds threshold
    if (Math.abs(diff) < threshold) {
      ticking.current = false;
      return;
    }

    // Always show header at top of page
    if (scrollY < 10) {
      setScrollDirection("up");
    } else {
      setScrollDirection(diff > 0 ? "down" : "up");
    }

    lastScrollY.current = scrollY;
    ticking.current = false;
  }, [threshold]);

  useEffect(() => {
    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateDirection);
        ticking.current = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [updateDirection]);

  return scrollDirection;
}
