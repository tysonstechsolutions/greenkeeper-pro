"use client";

import { useEffect, useState } from "react";
import { PinLock } from "./pin-lock";

const UNLOCK_KEY = "gk_unlocked";

/**
 * Single shared-PIN gate in front of the whole app. While locked, children
 * (AuthProvider etc.) don't mount, so the app never auto-connects or loads
 * data until the PIN is entered. Unlock is remembered per device.
 *
 * This is a light gate to keep casual passers-by out of the otherwise-open
 * app — not strong auth.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ unlocked: boolean; ready: boolean }>({
    unlocked: false,
    ready: false,
  });

  useEffect(() => {
    let unlocked = false;
    try {
      unlocked = localStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      // localStorage unavailable — stay locked (will show the PIN screen)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time unlock-state hydration
    setState({ unlocked, ready: true });
  }, []);

  const unlock = () => {
    try {
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch {
      // ignore — unlock still applies for this session
    }
    setState((s) => ({ ...s, unlocked: true }));
  };

  // Avoid flashing the app before we know the lock state.
  if (!state.ready) return null;

  if (!state.unlocked) return <PinLock onUnlock={unlock} />;

  return <>{children}</>;
}
