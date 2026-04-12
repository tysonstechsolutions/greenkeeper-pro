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
 * We cap queued requests at 24 hours (`maxRetentionTime`). Anything older
 * than that is automatically dropped from the queue by Serwist. No data
 * is silently lost before that point: requests stay in IndexedDB until
 * they either succeed on replay or exceed this retention cap.
 *
 * ## Replay outcomes (custom `onSync` handler)
 *
 * The custom `replayWithAuthEscalation` handler walks the queue and
 * classifies each response:
 *
 * 1. `2xx` — counted as a successful replay. When the loop finishes we
 *    post `{ type: "queue-replayed", count }` so the UI can show a
 *    success banner.
 *
 * 2. `401` (Supabase JWT expired) — the request is **re-queued** via
 *    `queue.unshiftRequest(entry)` so no user data is lost, and the
 *    loop throws. Serwist/Background Sync will retry the whole batch on
 *    the next sync event. We also broadcast
 *    `{ type: "offline-auth-expired", urls }` so the client can show
 *    the "please sign in again" banner.
 *
 *    **Known gap:** until the main thread refreshes the Supabase session
 *    *and* the service worker picks up the new `Authorization` header,
 *    each retry will still 401. A future task will implement that
 *    cross-thread auth-refresh dance (it requires coordinating with
 *    `@supabase/ssr`'s IDB-backed storage). In the meantime the data is
 *    preserved in the queue until it either succeeds or hits the 24h
 *    retention cap, which is a strict improvement over silently
 *    dropping it.
 *
 * 3. `5xx`, `408`, `429` — transient server / rate-limit error. The
 *    request is re-queued and the loop throws so Background Sync retries
 *    the batch later. No client message is posted for these, because the
 *    user is likely to see success on the next retry.
 *
 * 4. Other `4xx` (400, 403, 404, 409, 422, ...) — permanent failure.
 *    Re-queuing would loop forever, so these requests are dropped from
 *    the queue and counted in `permanentFailures`. After the loop we
 *    broadcast `{ type: "queue-permanent-failure", count }` so the UI
 *    can surface an orange "N offline changes rejected by server"
 *    banner. The user needs to investigate (stale record, validation
 *    error, etc.) — the data cannot be automatically recovered.
 *
 * 5. Network error (thrown `fetch`) — same as pre-existing behavior:
 *    the request is re-queued and the loop throws so the browser
 *    retries on the next sync trigger.
 *
 * TODO: I-3 — Serwist ships a built-in `queue.replayRequests()` helper
 * that we could use instead of this hand-rolled loop. It's marked as a
 * follow-up because the current loop is intentional: we need per-entry
 * response classification (2xx vs 401 vs 5xx vs other 4xx) that the
 * built-in helper doesn't expose.
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

/** Message posted when the server permanently rejects a queued mutation. */
export interface QueuePermanentFailureMessage {
  type: "queue-permanent-failure";
  count: number;
}

type BroadcastMessage =
  | QueueReplayedMessage
  | OfflineAuthExpiredMessage
  | QueuePermanentFailureMessage;

async function broadcast(message: BroadcastMessage): Promise<void> {
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
 * Minimal subset of `BackgroundSyncQueue` that `replayWithAuthEscalation`
 * actually uses. Declared so tests can pass in a fake queue without
 * having to construct a real Serwist queue (which needs IDB).
 */
export interface ReplayableQueue {
  shiftRequest: BackgroundSyncQueue["shiftRequest"];
  unshiftRequest: BackgroundSyncQueue["unshiftRequest"];
}

/**
 * Custom replay handler. See the module-level doc comment for the full
 * response-classification table.
 *
 * TODO: I-5 — the `offline-auth-expired` banner in the client currently
 * auto-dismisses after 5 seconds. That's a usability bug (the user might
 * miss it) but is a design-system concern rather than a data-safety one,
 * so it's logged here as a follow-up.
 */
export async function replayWithAuthEscalation({ queue }: { queue: ReplayableQueue }): Promise<void> {
  let replayed = 0;
  let permanentFailures = 0;
  const authExpiredUrls: string[] = [];
  let threw = false;
  let thrownError: unknown = null;

  let entry = await queue.shiftRequest();
  while (entry) {
    const { request } = entry;
    try {
      const clone = request.clone();
      const response = await fetch(clone);

      if (response.ok) {
        // 2xx — success.
        replayed += 1;
      } else if (response.status === 401) {
        // Auth expired. Preserve the request so the user's edit isn't
        // lost, surface the failure to the UI, and abort the loop so
        // Background Sync retries later.
        authExpiredUrls.push(request.url);
        await queue.unshiftRequest(entry);
        threw = true;
        thrownError = new Error(`Replay auth-expired (401), re-queued`);
        break;
      } else if (
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429
      ) {
        // Transient server / rate-limit error — re-queue and abort.
        await queue.unshiftRequest(entry);
        threw = true;
        thrownError = new Error(`Replay transient failure (${response.status}), re-queued`);
        break;
      } else {
        // Other 4xx — permanent failure. Drop the entry (re-queuing
        // would loop forever) and surface to the user.
        permanentFailures += 1;
      }
    } catch (error) {
      // Network still down — put it back and abort so the browser
      // retries. Keep the pre-existing behavior intact.
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
  if (permanentFailures > 0) {
    await broadcast({ type: "queue-permanent-failure", count: permanentFailures });
  }

  if (threw) {
    throw thrownError;
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
