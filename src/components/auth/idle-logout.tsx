"use client";

// Logs this device out after a stretch of no use (Settings → Auto log-out),
// with a one-minute "Still there?" warning first. Never logs out while
// changes made offline are still waiting to sync — those would be lost.

import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { SIGNED_OUT_PATH, unsyncedChangeCount } from "@/lib/auth/sign-out";
import {
  idleState,
  readIdleMinutes,
  readLastActivity,
  secondsLeft,
  writeLastActivity,
} from "@/lib/auth/idle";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;
/** Write the shared timestamp at most this often. */
const ACTIVITY_WRITE_MS = 15_000;
const CHECK_MS = 5_000;

export function IdleLogout() {
  const { user, signOut } = useAuth();
  const [warning, setWarning] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const loggingOut = useRef(false);
  // signOut is a new function every render; keep the watcher from restarting.
  const signOutRef = useRef(signOut);
  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  const markActive = useCallback(() => {
    const now = Date.now();
    if (now - lastWrite.current < ACTIVITY_WRITE_MS) return;
    lastWrite.current = now;
    writeLastActivity(now);
  }, []);

  const stillHere = useCallback(() => {
    lastWrite.current = 0;
    markActive();
    setWarning(null);
  }, [markActive]);

  useEffect(() => {
    if (!user) return;
    // Logging out clears the timestamp, so none means a fresh sign-in. One
    // left over means the app was reopened: the time away still counts.
    if (readLastActivity() == null) {
      lastWrite.current = Date.now();
      writeLastActivity(lastWrite.current);
    }

    const check = async () => {
      if (loggingOut.current) return;
      const minutes = readIdleMinutes();
      const last = readLastActivity() ?? Date.now();
      const now = Date.now();
      const state = idleState(last, now, minutes);
      if (state === "active") {
        setWarning(null);
        return;
      }
      if (state === "warning") {
        setWarning(secondsLeft(last, now, minutes));
        return;
      }
      // Expired. Offline changes would be lost: stay signed in until they sync.
      if ((await unsyncedChangeCount()) > 0) {
        setWarning(null);
        return;
      }
      loggingOut.current = true;
      try {
        await signOutRef.current();
      } finally {
        window.location.replace(`${SIGNED_OUT_PATH}?reason=idle`);
      }
    };

    const onActivity = () => {
      if (!loggingOut.current) markActive();
    };
    // Capture phase: the page scrolls inside <main>, and scroll doesn't bubble.
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true, capture: true });
    // Coming back to the app (phone unlocked, tab switched) checks right away.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), CHECK_MS);
    void check();
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [user, markActive]);

  if (warning == null) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="w-full max-w-sm rounded-xl bg-background p-5 shadow-xl">
        <p id="idle-title" className="flex items-center gap-2 text-lg font-semibold">
          <LogOut className="h-5 w-5" /> Still there?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This device logs out in {warning} second{warning === 1 ? "" : "s"} so the next person doesn&apos;t use your account.
        </p>
        <button
          onClick={stillHere}
          autoFocus
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          I&apos;m still here
        </button>
      </div>
    </div>
  );
}
