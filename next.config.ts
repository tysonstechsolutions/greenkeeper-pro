import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  images: {
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
  // Empty turbopack config to silence Next.js 16 warning about webpack config from @serwist/next
  turbopack: {},
};

// Apply Sentry
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps only in production
  dryRun: process.env.NODE_ENV !== "production",
};

const sentryOptions = {
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  // Transpiles SDK to be compatible with IE11
  transpileClientSDK: false,
  // Disable tunneling in development
  tunnelRoute: process.env.NODE_ENV === "production" ? "/monitoring" : undefined,
  // Disable Sentry in development
  disableLogger: process.env.NODE_ENV !== "production",
};

export default withSentryConfig(
  withSerwist(nextConfig),
  sentryWebpackPluginOptions,
  sentryOptions
);
