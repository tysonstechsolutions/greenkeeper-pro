/**
 * Background sync manager.
 * Iterates the offline write queue, replays each operation against Supabase,
 * and cleans up on success or marks failed on error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPendingWrites, removeWrite, markWriteFailed } from "./cache";

interface SyncResult {
  synced: number;
  failed: number;
}

/**
 * Iterates all pending writes and attempts to execute each one against
 * Supabase. Successfully synced writes are removed from the queue; failed
 * ones are marked with incremented retry count.
 */
export async function syncPendingWrites(
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const pending = await getPendingWrites();
  let synced = 0;
  let failed = 0;

  for (const write of pending) {
    try {
      const { error } = await executeWrite(supabase, write);
      if (error) {
        await markWriteFailed(write.id);
        failed += 1;
      } else {
        await removeWrite(write.id);
        synced += 1;
      }
    } catch {
      await markWriteFailed(write.id);
      failed += 1;
    }
  }

  return { synced, failed };
}

/** Dispatches a single queued write to the correct Supabase operation. */
async function executeWrite(
  supabase: SupabaseClient,
  write: { table: string; operation: string; payload: unknown },
): Promise<{ error: unknown }> {
  const payload = write.payload as Record<string, unknown>;

  switch (write.operation) {
    case "insert":
      return supabase.from(write.table).insert(payload);
    case "update": {
      const { id, ...rest } = payload;
      return supabase.from(write.table).update(rest).eq("id", id as string);
    }
    case "delete": {
      const deleteId = payload.id;
      return supabase.from(write.table).delete().eq("id", deleteId as string);
    }
    default:
      return { error: `Unknown operation: ${write.operation}` };
  }
}

/**
 * Registers listeners that trigger a sync attempt when the browser comes
 * back online and on initial page load (if already online).
 *
 * Call once at app startup. Accepts a getter for the Supabase client so the
 * caller can defer client creation.
 */
export function registerSyncListeners(
  getSupabase: () => SupabaseClient | null,
): () => void {
  const trySync = async () => {
    const client = getSupabase();
    if (!client) return;
    await syncPendingWrites(client);
  };

  // Sync on connectivity restored
  window.addEventListener("online", trySync);

  // Sync on page load if already online
  if (typeof navigator !== "undefined" && navigator.onLine) {
    // Use setTimeout to avoid blocking initial render
    setTimeout(trySync, 2000);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener("online", trySync);
  };
}
