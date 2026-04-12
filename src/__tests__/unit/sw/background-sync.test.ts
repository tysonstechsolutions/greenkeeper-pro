/**
 * Background sync plugin factory tests.
 *
 * Serwist's `BackgroundSyncPlugin` needs a service worker global (`self`,
 * `IDBKeyRange`, `self.registration`) to instantiate. Happy-dom provides
 * `self` and `indexedDB`; we stub `registration` so the plugin's constructor
 * can attach its sync listener without blowing up.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";

beforeAll(() => {
  // Happy-dom doesn't expose a ServiceWorkerRegistration. Stub one with a
  // `sync` manager so Serwist's `"sync" in self.registration` check is
  // truthy and the plugin attaches an event listener instead of running
  // the immediate fallback replay (which needs a full IndexedDB stack).
  const globalSelf = self as unknown as {
    registration?: { sync?: { register: (tag: string) => Promise<void> } };
  };
  if (!globalSelf.registration?.sync) {
    Object.defineProperty(self, "registration", {
      value: {
        sync: {
          register: async () => undefined,
          getTags: async () => [],
        },
      },
      configurable: true,
    });
  }
});

describe("createSupabaseMutationQueue", () => {
  it("returns a Serwist BackgroundSyncPlugin with the supabase queue name and 24h retention", async () => {
    const { createSupabaseMutationQueue, SUPABASE_MUTATION_QUEUE_NAME, SUPABASE_MUTATION_MAX_RETENTION_MINUTES } =
      await import("@/lib/sw/background-sync");
    const { BackgroundSyncPlugin } = await import("serwist");

    const plugin = createSupabaseMutationQueue();

    expect(plugin).toBeInstanceOf(BackgroundSyncPlugin);
    // The plugin implements the `fetchDidFail` SerwistPlugin hook.
    expect(typeof (plugin as unknown as { fetchDidFail: unknown }).fetchDidFail).toBe("function");

    // Internal queue exposes a public `name` getter; verify the queue name and
    // retention window match what we configured.
    const queue = (plugin as unknown as { _queue: { name: string; _maxRetentionTime: number } })._queue;
    expect(queue.name).toBe(SUPABASE_MUTATION_QUEUE_NAME);
    expect(queue.name).toBe("supabase-mutation-queue");
    expect(SUPABASE_MUTATION_MAX_RETENTION_MINUTES).toBe(24 * 60);
    expect(queue._maxRetentionTime).toBe(24 * 60);
  });
});

/**
 * Behavior tests for the custom `replayWithAuthEscalation` onSync handler.
 *
 * We bypass Serwist entirely by constructing a fake queue that fits the
 * narrow `ReplayableQueue` contract (shiftRequest / unshiftRequest). The
 * handler is tested directly against stubbed `fetch` responses so we can
 * assert classification of each status code and the corresponding
 * re-queue / broadcast behavior.
 */
describe("replayWithAuthEscalation", () => {
  type Entry = { request: Request };

  function makeQueue(initialEntries: Entry[]) {
    const entries = [...initialEntries];
    const unshifted: Entry[] = [];
    return {
      shiftRequest: vi.fn(async () => entries.shift()),
      unshiftRequest: vi.fn(async (entry: Entry) => {
        unshifted.push(entry);
        entries.unshift(entry);
      }),
      _unshifted: unshifted,
      _remaining: entries,
    };
  }

  function makeEntry(url = "https://example.com/rest/v1/observations"): Entry {
    return { request: new Request(url, { method: "POST", body: "{}" }) };
  }

  const postedMessages: unknown[] = [];

  beforeEach(() => {
    postedMessages.length = 0;
    // Stub self.clients.matchAll so `broadcast` can push messages into a
    // collector. Define as configurable so we can wipe between tests.
    Object.defineProperty(self, "clients", {
      value: {
        matchAll: async () => [
          {
            postMessage: (msg: unknown) => {
              postedMessages.push(msg);
            },
          },
        ],
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Leave `self.clients` in place — happy-dom doesn't mind the extra prop.
  });

  it("counts 2xx replays as success and broadcasts queue-replayed", async () => {
    const { replayWithAuthEscalation } = await import("@/lib/sw/background-sync");
    const queue = makeQueue([makeEntry(), makeEntry()]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    await expect(replayWithAuthEscalation({ queue })).resolves.toBeUndefined();

    expect(queue.unshiftRequest).not.toHaveBeenCalled();
    expect(postedMessages).toContainEqual({ type: "queue-replayed", count: 2 });
    expect(postedMessages).not.toContainEqual(
      expect.objectContaining({ type: "offline-auth-expired" }),
    );
  });

  it("re-queues 401 responses, broadcasts auth-expired, and throws", async () => {
    const { replayWithAuthEscalation } = await import("@/lib/sw/background-sync");
    const entry = makeEntry();
    const queue = makeQueue([entry]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(replayWithAuthEscalation({ queue })).rejects.toThrow(/auth-expired/);

    expect(queue.unshiftRequest).toHaveBeenCalledTimes(1);
    expect(queue.unshiftRequest).toHaveBeenCalledWith(entry);
    expect(postedMessages).toContainEqual(
      expect.objectContaining({ type: "offline-auth-expired" }),
    );
  });

  it("re-queues 5xx responses as transient failures and throws", async () => {
    const { replayWithAuthEscalation } = await import("@/lib/sw/background-sync");
    const entry = makeEntry();
    const queue = makeQueue([entry]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(replayWithAuthEscalation({ queue })).rejects.toThrow(/transient/);
    expect(queue.unshiftRequest).toHaveBeenCalledWith(entry);
    // No auth-expired or permanent-failure broadcast for transient.
    expect(postedMessages).not.toContainEqual(
      expect.objectContaining({ type: "offline-auth-expired" }),
    );
    expect(postedMessages).not.toContainEqual(
      expect.objectContaining({ type: "queue-permanent-failure" }),
    );
  });

  it("drops non-401 4xx as permanent failures and broadcasts queue-permanent-failure", async () => {
    const { replayWithAuthEscalation } = await import("@/lib/sw/background-sync");
    const queue = makeQueue([makeEntry()]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 409 })),
    );

    await expect(replayWithAuthEscalation({ queue })).resolves.toBeUndefined();

    expect(queue.unshiftRequest).not.toHaveBeenCalled();
    expect(postedMessages).toContainEqual({ type: "queue-permanent-failure", count: 1 });
  });

  it("re-queues on network errors and rethrows", async () => {
    const { replayWithAuthEscalation } = await import("@/lib/sw/background-sync");
    const entry = makeEntry();
    const queue = makeQueue([entry]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    await expect(replayWithAuthEscalation({ queue })).rejects.toThrow(/network down/);
    expect(queue.unshiftRequest).toHaveBeenCalledWith(entry);
  });
});
