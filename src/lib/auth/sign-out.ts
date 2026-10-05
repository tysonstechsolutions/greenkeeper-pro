/**
 * Log out of this device so the next person signs in as themselves.
 *
 * supabase.auth.signOut() can stall on its internal auth lock (see the notes
 * in useAuth and rest.ts), and the app also reads the saved session straight
 * from localStorage. So logging out: asks Supabase to sign out (time-boxed),
 * deletes the saved session itself, clears this person's cached data and
 * unsynced offline changes, and then the caller reloads to the PIN screen so
 * nothing from the old account stays in memory. The device unlock PIN
 * (LockGate) is a separate, shared gate and is left alone.
 */
import { clearCache } from "@/lib/offline/cache";
import { clearQueue, getQueueCount } from "@/lib/utils/offline-queue";

const SIGN_OUT_TIMEOUT_MS = 3_000;

/** Where the app goes after logging out (trailingSlash export path). */
export const SIGNED_OUT_PATH = "/pin-login/";

/** Saved Supabase sessions look like `sb-<project-ref>-auth-token`. */
export function isSupabaseSessionKey(key: string): boolean {
  return /^sb-.+-auth-token(?:-code-verifier)?$/.test(key);
}

/** How many changes made offline haven't reached the server yet. */
export async function unsyncedChangeCount(): Promise<number> {
  try {
    return await getQueueCount();
  } catch {
    return 0;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Remove every trace of the signed-in account from this device. Never throws:
 * each step is best effort so a stalled network call can't keep someone
 * logged in as the wrong person.
 */
export async function clearSignedInAccount(
  signOut: () => Promise<unknown>,
  storage: Pick<Storage, "length" | "key" | "removeItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): Promise<void> {
  await withTimeout(signOut().catch(() => undefined), SIGN_OUT_TIMEOUT_MS);

  if (storage) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && isSupabaseSessionKey(k)) keys.push(k);
      }
      for (const k of keys) storage.removeItem(k);
    } catch {
      /* storage unavailable — the reload still drops in-memory state */
    }
  }

  await Promise.all([
    withTimeout(clearCache().catch(() => undefined), SIGN_OUT_TIMEOUT_MS),
    withTimeout(clearQueue().catch(() => undefined), SIGN_OUT_TIMEOUT_MS),
  ]);
}
