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
};

export default withSerwist(nextConfig);

