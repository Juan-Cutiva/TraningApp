/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, NetworkOnly, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker for the Cuti Traning PWA.
 *
 * Strategy:
 * - Precache the Next.js build output (HTML, JS chunks, CSS) — injected
 *   at build time by @serwist/next into `self.__SW_MANIFEST`.
 * - Runtime cache static assets (fonts, images) with CacheFirst.
 * - Never cache API routes: auth, base-routines, admin/users. These need
 *   fresh data and caching auth responses could leak across devices.
 * - `skipWaiting + clientsClaim` so updates activate on the next page load
 *   without a manual "update available" banner (simple UX for now).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API routes — always hit the network. Returning stale auth or
    // base-routines data is worse than a visible "no connection" error.
    {
      matcher: /\/api\//,
      handler: new NetworkOnly(),
    },
    // Google Fonts — very long TTL is safe, they're immutable by URL.
    {
      matcher: /^https:\/\/fonts\.gstatic\.com\/.*$/,
      handler: new CacheFirst({
        cacheName: "google-fonts-webfonts",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          }),
        ],
      }),
    },
    // Everything else — fall back to the @serwist defaults (NetworkFirst
    // for navigations, CacheFirst for static assets, etc.)
    ...defaultCache,
  ],
});

serwist.addEventListeners();
