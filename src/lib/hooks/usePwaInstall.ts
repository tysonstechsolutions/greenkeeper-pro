"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Captures the browser's `beforeinstallprompt` event app-wide so the
 * /install page (and a Settings entry) can offer a one-tap native install on
 * Android / desktop Chrome / Edge — without the old auto-popup.
 *
 * The event fires once per page load and only if the PWA is installable and
 * not already installed. Because it can fire before the user navigates to the
 * install screen, the listener is attached on the first `subscribe()` (which
 * happens when <PwaInstallCapture /> mounts in the app shell, early in the
 * page lifecycle) and the captured event is held in module scope so any later
 * consumer can still read it.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let version = 0;
let initialized = false;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  installed = isStandalone();

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    // Prevent Chrome's default mini-infobar; we surface our own entry point.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

function subscribe(cb: () => void): () => void {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// useSyncExternalStore compares snapshots with Object.is, so we return a
// monotonically increasing integer and read the live module vars in the hook.
function getSnapshot(): number {
  return version;
}

function getServerSnapshot(): number {
  return 0;
}

export type PwaInstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface UsePwaInstall {
  /** True when a native install prompt is available (Android / desktop). */
  canInstall: boolean;
  /** True when running as an installed standalone app. */
  isInstalled: boolean;
  /** Triggers the native install dialog. Resolves with the user's choice. */
  promptInstall: () => Promise<PwaInstallOutcome>;
}

export function usePwaInstall(): UsePwaInstall {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = useCallback(async (): Promise<PwaInstallOutcome> => {
    if (!deferredPrompt) return "unavailable";
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // The event can only be used once.
      deferredPrompt = null;
      emit();
      return outcome;
    } catch (err) {
      console.error("[pwa-install] prompt failed:", err);
      return "unavailable";
    }
  }, []);

  return {
    canInstall: !!deferredPrompt,
    isInstalled: installed,
    promptInstall,
  };
}

/**
 * Renders nothing — its only job is to mount the hook early (in the app
 * shell) so the `beforeinstallprompt` listener is attached before the browser
 * fires the event.
 */
export function PwaInstallCapture(): null {
  usePwaInstall();
  return null;
}
