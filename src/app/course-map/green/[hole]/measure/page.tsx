import RouteContent from "./page-client";

/**
 * Server wrapper for static export. generateStaticParams can only be
 * exported from a server component, so the real UI lives in page-client.tsx.
 * Pre-renders the 18 known values of [hole] so every measure page
 * ships inside the APK.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: 18 }, (_, i) => ({ hole: String(i + 1) }));
}

export default function Page() {
  return <RouteContent />;
}
