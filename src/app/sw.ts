/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";
import { createSupabaseMutationQueue } from "@/lib/sw/background-sync";

// This declares the value of `injectionPoint` to TypeScript.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // HTML documents (page navigations) — Network First so newly
    // deployed versions show up on the next load without a hard refresh.
    // Previous behavior fell through to the default cache which could
    // keep serving stale HTML referencing deleted JS chunks, producing
    // the "have to refresh the page for it to load correctly" bug.
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages-v1",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
          }),
        ],
      }),
    },
    // Fonts — long-lived, Cache First is fine (filenames are hashed or
    // stable Google Fonts URLs).
    {
      matcher: ({ request }) => request.destination === "font",
      handler: new CacheFirst({
        cacheName: "fonts-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          }),
        ],
      }),
    },
    // JS / CSS — Next.js emits content-hashed filenames (e.g.
    // `/_next/static/chunks/abc123.js`), so a new deploy references new
    // files and the old cache entries just go unused until they expire.
    // But if the OLD shell is served from cache and references filenames
    // that no longer exist, you get a broken page. StaleWhileRevalidate
    // returns the cached copy instantly while fetching a fresh one in
    // the background — best of both worlds for hashed static assets.
    {
      matcher: ({ request }) =>
        request.destination === "style" || request.destination === "script",
      handler: new StaleWhileRevalidate({
        cacheName: "app-shell-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          }),
        ],
      }),
    },
    // Images - Cache First with 7-day expiration
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "images-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          }),
        ],
      }),
    },
    // API responses - Network First with cache fallback
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache-v1",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
          }),
        ],
      }),
    },
    // Supabase MUTATION requests (POST, PATCH, PUT, DELETE) - Network Only
    // wrapped in a BackgroundSyncPlugin queue. Failed mutations (offline,
    // timeout, etc.) are persisted to IndexedDB by Serwist and replayed
    // when the browser fires a `sync` event. Retention cap is 24h to limit
    // auth-token staleness — see src/lib/sw/background-sync.ts for the
    // known auth-refresh limitation and the client-side escalation path.
    // CRITICAL: Never cache mutation responses — we only queue the request.
    {
      matcher: ({ url, request }) =>
        url.hostname.includes("supabase") &&
        request.method !== "GET" &&
        request.method !== "HEAD",
      handler: new NetworkOnly({
        plugins: [createSupabaseMutationQueue()],
      }),
    },
    // Supabase READ requests (GET) - Network First with cache fallback
    {
      matcher: ({ url, request }) =>
        url.hostname.includes("supabase") &&
        (request.method === "GET" || request.method === "HEAD"),
      handler: new NetworkFirst({
        cacheName: "supabase-cache-v1",
        networkTimeoutSeconds: 15,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60, // 1 hour
          }),
        ],
      }),
    },
    // Default cache strategies
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// ---------------------------------------------------------------------------
// Web Push notifications (VAPID)
// ---------------------------------------------------------------------------
// The `push` listener renders a native OS notification when the server fires
// a push via web-push. The `notificationclick` listener focuses an existing
// open tab that already has the target URL, or opens a new window otherwise.
//
// Payload shape from /api/push/send → sendPushToUsers:
//   { title: string, body: string, url?: string, icon?: string, badge?: string }
// ---------------------------------------------------------------------------

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  try {
    const data = event.data.json() as {
      title: string;
      body: string;
      url?: string;
      icon?: string;
      badge?: string;
    };
    const options: NotificationOptions = {
      body: data.body,
      icon: data.icon ?? "/icons/icon-192x192.png",
      badge: data.badge ?? "/icons/icon-96x96.png",
      data: { url: data.url ?? "/" },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (e) {
    console.error("Push payload parse failed", e);
  }
});

// TODO(#6): Narrow push subscription key conversions to Uint8Array generic
// when web-push types settle (currently cast through unknown in push.ts).
// TODO(#7): Regenerate src/types/database.ts to drop the `as any` casts in
// useNotifications.ts after push_subscriptions/notifications schema stabilizes.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url =
    (event.notification.data && (event.notification.data as { url?: string }).url) ??
    "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Compare pathnames exactly — substring matches (endsWith) were
      // ambiguous for deep paths and could focus an unrelated client.
      const targetPath = url.startsWith("/")
        ? url.split("?")[0]
        : new URL(url, self.location.origin).pathname;
      for (const c of clients) {
        try {
          const cp = new URL(c.url).pathname;
          if (cp === targetPath && "focus" in c) {
            await (c as WindowClient).focus();
            return;
          }
        } catch {
          // skip invalid URL
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});
