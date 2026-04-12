/**
 * Background sync plugin factory for offline Supabase mutations.
 *
 * When a crew member logs an observation out of cell range, the Supabase
 * POST/PATCH/PUT/DELETE request would normally fail immediately. Wrapping
 * the `NetworkOnly` handler with Serwist's `BackgroundSyncPlugin` causes
 * failed requests to be stored in IndexedDB and replayed automatically
 * when the browser fires a `sync` event (or, in browsers without
 * Background Sync API support, on next service worker startup).
 *
 * ## Retention window
 *
 * We cap queued requests at 24 hours. Anything older than that is almost
 * certainly unsafe to replay (see auth-token caveat below) and will be
 * dropped from the queue.
 *
 * ## Supabase auth token limitation (KNOWN ISSUE, documented)
 *
 * Supabase access tokens expire ~1 hour after issue. If a mutation is
 * queued while the user is offline for longer than that, Serwist's default
 * replay path will send the stale `Authorization` header and the request
 * will 401. A fully correct fix requires refreshing the token inside the
 * service worker before the replay, which means a cross-thread IDB dance
 * with `@supabase/ssr`'s storage — non-trivial and not warranted on this
 * first pass.
 *
 * Pragmatic fallback: the service worker catches replay failures in a
 * custom `onSync` handler and messages the client with
 * `{ type: "offline-auth-expired", urls: [...] }`. The main thread can
 * then re-queue the failed mutations after refreshing the Supabase
 * session. The 24h retention cap limits how much stale data can
 * accumulate.
 *
 * For the first cut we also post `{ type: "queue-replayed", count: N }`
 * on successful replay so the UI can show a toast.
 *
 * @see https://serwist.pages.dev/docs/serwist/core/background-sync-queue
 */
import { BackgroundSyncPlugin, type BackgroundSyncQueue } from "serwist";

export const SUPABASE_MUTATION_QUEUE_NAME = "supabase-mutation-queue";

/** 24 hours, expressed in minutes, as required by Serwist. */
export const SUPABASE_MUTATION_MAX_RETENTION_MINUTES = 24 * 60;

/** Message posted to clients after the queue is successfully drained. */
export interface QueueReplayedMessage {
  type: "queue-replayed";
  count: number;
}

/** Message posted to clients when replay hits auth-expired 401s. */
export interface OfflineAuthExpiredMessage {
  type: "offline-auth-expired";
  urls: string[];
}

async function broadcast(message: QueueReplayedMessage | OfflineAuthExpiredMessage): Promise<void> {
  // `self.clients` only exists inside a real ServiceWorkerGlobalScope.
  const scope = self as unknown as {
    clients?: { matchAll: (opts?: { includeUncontrolled?: boolean }) => Promise<Array<{ postMessage: (m: unknown) => void }>> };
  };
  if (!scope.clients?.matchAll) return;
  const clients = await scope.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

/**
 * Custom replay handler. Walks the queue, re-fetching each stored request.
 * On 401 we collect the URL for client-side re-auth handling and drop the
 * request. On other failures we unshift the request back to the front of
 * the queue and throw so the browser retries the sync later.
 */
async function replayWithAuthEscalation({ queue }: { queue: BackgroundSyncQueue }): Promise<void> {
  let replayed = 0;
  const authExpiredUrls: string[] = [];
  let entry = await queue.shiftRequest();
  while (entry) {
    const { request } = entry;
    try {
      const clone = request.clone();
      const response = await fetch(clone);
      if (response.status === 401) {
        authExpiredUrls.push(request.url);
      } else {
        replayed += 1;
      }
    } catch (error) {
      // Network still down — put it back and abort so the browser retries.
      await queue.unshiftRequest(entry);
      throw error;
    }
    entry = await queue.shiftRequest();
  }

  if (replayed > 0) {
    await broadcast({ type: "queue-replayed", count: replayed });
  }
  if (authExpiredUrls.length > 0) {
    await broadcast({ type: "offline-auth-expired", urls: authExpiredUrls });
  }
}

/**
 * Create the Serwist `BackgroundSyncPlugin` used by the Supabase mutation
 * route in `src/app/sw.ts`. Exported as a factory so the service worker
 * and the unit tests can each construct a fresh instance without bumping
 * into Serwist's duplicate-queue-name guard.
 */
export function createSupabaseMutationQueue(): BackgroundSyncPlugin {
  return new BackgroundSyncPlugin(SUPABASE_MUTATION_QUEUE_NAME, {
    maxRetentionTime: SUPABASE_MUTATION_MAX_RETENTION_MINUTES,
    onSync: replayWithAuthEscalation,
  });
}
