/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, NetworkFirst, NetworkOnly, ExpirationPlugin } from "serwist";
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
    // App shell (CSS, JS, fonts) - Cache First
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "font",
      handler: new CacheFirst({
        cacheName: "app-shell-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
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
