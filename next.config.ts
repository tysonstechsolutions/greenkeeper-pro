import type { NextConfig } from "next";

/**
 * Next.js config for the Capacitor native build.
 *
 * Output mode is "export" — the build produces a fully static /out directory
 * that Capacitor packages into the APK. There is NO Next.js server at
 * runtime, so:
 *   - no middleware (replaced by <AuthGate> client component)
 *   - no API routes (migrated to Supabase Edge Functions in Phase 2)
 *   - no Server Components with server-side data fetching
 *   - next/image must use unoptimized: true (no image optimization server)
 *
 * The old Serwist service worker + Sentry Next.js plugin are removed on this
 * branch because:
 *   - Capacitor bundles assets locally; no need for a service worker cache
 *   - Sentry Capacitor SDK will be added in Phase 3 for native crash reporting
 */
const nextConfig: NextConfig = {
  output: "export",

  // trailingSlash ensures direct-URL navigation inside the APK resolves to
  // the correct index.html (Capacitor serves from file:// or a local HTTP
  // server and expects /path/ → /path/index.html).
  trailingSlash: true,

  // Required with output: "export" — disables the Next.js image optimizer
  // (which is a Vercel runtime feature). We still use <img> or next/image
  // but the URLs pass through unchanged.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Silence Next.js 16 turbopack warning about legacy webpack config paths.
  turbopack: {},
};

export default nextConfig;
