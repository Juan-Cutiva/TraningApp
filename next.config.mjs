import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  // Service worker entry — compiled and written to public/sw.js by serwist.
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Skip PWA registration during `next dev` so hot reload works normally.
  // In production build the sw.js is generated and served from /sw.js.
  disable: process.env.NODE_ENV === "development",
  // Pick up runtime changes automatically — the SW activates immediately
  // on next navigation via skipWaiting in app/sw.ts.
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Next 16 uses Turbopack in `next dev`. @serwist/next injects a webpack
  // config (for production `next build`, which still uses webpack). This
  // empty turbopack object tells Next "yes, I know about Turbopack" so the
  // dev server doesn't error out over the unused webpack config.
  // In dev, serwist is disabled (see withSerwistInit below) so no SW work
  // happens anyway; in production, next build uses webpack where the
  // serwist config is consumed normally.
  turbopack: {},
};

export default withSerwist(nextConfig);

