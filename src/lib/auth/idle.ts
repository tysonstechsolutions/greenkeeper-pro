/**
 * Log out after a stretch of no use, so a shared phone or tablet doesn't
 * stay signed in as whoever used it last. A warning shows for the last
 * minute ("Still there?"). Each device picks its own time in Settings
 * (a personal phone can turn it off).
 *
 * Pure helpers; components/auth/idle-logout.tsx does the watching.
 */

export const IDLE_MINUTES_KEY = "gk.idleLogoutMinutes";
export const LAST_ACTIVITY_KEY = "gk.lastActivity";

/** Choices offered in Settings. 0 = never. */
export const IDLE_CHOICES = [0, 15, 30, 60, 120] as const;
export const DEFAULT_IDLE_MINUTES = 30;
/** How long the "Still there?" warning shows before logging out. */
export const IDLE_WARNING_MS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;

function safeStore(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** This device's idle time in minutes (0 = off). */
export function readIdleMinutes(store: Store | null = safeStore()): number {
  try {
    const raw = store?.getItem(IDLE_MINUTES_KEY);
    if (raw == null) return DEFAULT_IDLE_MINUTES;
    const n = Number(raw);
    return (IDLE_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_IDLE_MINUTES;
  } catch {
    return DEFAULT_IDLE_MINUTES;
  }
}

export function writeIdleMinutes(minutes: number, store: Store | null = safeStore()): void {
  try {
    store?.setItem(IDLE_MINUTES_KEY, String(minutes));
  } catch {
    /* storage blocked: the default applies */
  }
}

/** Last time anyone used the app on this device (shared across tabs). */
export function readLastActivity(store: Store | null = safeStore()): number | null {
  try {
    const n = Number(store?.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(at: number, store: Store | null = safeStore()): void {
  try {
    store?.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    /* ignore */
  }
}

export type IdleState = "active" | "warning" | "expired";

/** Where the countdown stands. A timeout of 0 means never. */
export function idleState(lastActivity: number, now: number, timeoutMinutes: number): IdleState {
  if (timeoutMinutes <= 0) return "active";
  const idle = now - lastActivity;
  const limit = timeoutMinutes * 60_000;
  if (idle >= limit) return "expired";
  if (idle >= limit - IDLE_WARNING_MS) return "warning";
  return "active";
}

/** Seconds left before logging out (for the warning). */
export function secondsLeft(lastActivity: number, now: number, timeoutMinutes: number): number {
  return Math.max(0, Math.ceil((lastActivity + timeoutMinutes * 60_000 - now) / 1000));
}

export function idleChoiceLabel(minutes: number): string {
  if (minutes === 0) return "Never";
  if (minutes < 60) return `After ${minutes} minutes`;
  return minutes === 60 ? "After 1 hour" : `After ${minutes / 60} hours`;
}
