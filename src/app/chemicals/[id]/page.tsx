import RouteContent from "./page-client";

/**
 * Server wrapper for static export. generateStaticParams can only be
 * exported from a server component, so the real UI lives in page-client.tsx.
 * Pre-renders a single placeholder; the real id is read at
 * runtime from useParams() inside page-client.tsx. Capacitor's webview
 * rewrites any unmatched /chemicals/<real-id>/ path to
 * the placeholder HTML so the client code then handles the routing.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <RouteContent />;
}
