/**
 * Background sync plugin factory tests.
 *
 * Serwist's `BackgroundSyncPlugin` needs a service worker global (`self`,
 * `IDBKeyRange`, `self.registration`) to instantiate. Happy-dom provides
 * `self` and `indexedDB`; we stub `registration` so the plugin's constructor
 * can attach its sync listener without blowing up.
 */
import { describe, expect, it, beforeAll } from "vitest";

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
