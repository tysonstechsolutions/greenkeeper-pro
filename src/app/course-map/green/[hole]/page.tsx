import RouteContent from "./page-client";

/**
 * Server wrapper for static export. generateStaticParams can only be
 * exported from a server component, so the real UI lives in page-client.tsx.
 * Pre-renders the 18 known values of [hole].
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ hole: "1" }, { hole: "2" }, { hole: "3" }, { hole: "4" }, { hole: "5" }, { hole: "6" }, { hole: "7" }, { hole: "8" }, { hole: "9" }, { hole: "10" }, { hole: "11" }, { hole: "12" }, { hole: "13" }, { hole: "14" }, { hole: "15" }, { hole: "16" }, { hole: "17" }, { hole: "18" }];
}

export default function Page() {
  return <RouteContent />;
}
