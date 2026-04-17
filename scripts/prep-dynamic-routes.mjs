#!/usr/bin/env node
/**
 * One-time migration script — splits every dynamic route page.tsx into a
 * thin server wrapper (which can export generateStaticParams) plus a
 * client-content file that holds the original JSX.
 *
 * Required for `output: "export"` because client components cannot export
 * generateStaticParams.
 *
 * Idempotent: if a route is already split, it's skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "src", "app");

/**
 * Route config:
 *   paramName — the dynamic segment, e.g. "id" for [id], "hole" for [hole]
 *   staticParams — explicit list for routes with known finite values,
 *                  otherwise `null` means use placeholder "_".
 */
const ROUTES = [
  { dir: "assets/[id]", paramName: "id", staticParams: null },
  { dir: "chemicals/[id]", paramName: "id", staticParams: null },
  {
    dir: "course-map/[hole]",
    paramName: "hole",
    staticParams: Array.from({ length: 18 }, (_, i) => String(i + 1)),
  },
  {
    dir: "course-map/green/[hole]",
    paramName: "hole",
    staticParams: Array.from({ length: 18 }, (_, i) => String(i + 1)),
  },
  { dir: "equipment/[id]", paramName: "id", staticParams: null },
  { dir: "equipment/[id]/service-history", paramName: "id", staticParams: null },
  { dir: "invite/[token]", paramName: "token", staticParams: null },
  { dir: "knowledge/[id]", paramName: "id", staticParams: null },
  { dir: "plan/[id]", paramName: "id", staticParams: null },
  { dir: "polls/results/[id]", paramName: "id", staticParams: null },
  { dir: "settings/staff/[id]", paramName: "id", staticParams: null },
  { dir: "tasks/[id]", paramName: "id", staticParams: null },
  { dir: "tasks/[id]/edit", paramName: "id", staticParams: null },
  { dir: "tournaments/[id]", paramName: "id", staticParams: null },
];

function splitRoute({ dir, paramName, staticParams }) {
  const fullDir = path.join(APP_DIR, dir);
  const pagePath = path.join(fullDir, "page.tsx");
  const clientPath = path.join(fullDir, "page-client.tsx");

  if (!fs.existsSync(pagePath)) {
    console.log(`[skip] ${dir} — page.tsx missing`);
    return;
  }

  const original = fs.readFileSync(pagePath, "utf8");

  // Skip if already split (client file exists AND page.tsx is the tiny wrapper)
  if (fs.existsSync(clientPath) && original.includes("generateStaticParams")) {
    console.log(`[skip] ${dir} — already split`);
    return;
  }

  if (!original.startsWith('"use client"')) {
    console.log(`[skip] ${dir} — not a "use client" page, needs manual review`);
    return;
  }

  // Rename the default export to RouteContent so it reads cleanly from the wrapper.
  const content = original.replace(
    /export default function (\w+)\(/,
    "export default function RouteContent("
  );

  fs.writeFileSync(clientPath, content, "utf8");

  const paramsList = staticParams
    ? staticParams.map((v) => `{ ${paramName}: ${JSON.stringify(v)} }`).join(", ")
    : `{ ${paramName}: "_" }`;

  const wrapper = `import RouteContent from "./page-client";

/**
 * Server wrapper for static export. generateStaticParams can only be
 * exported from a server component, so the real UI lives in page-client.tsx.
 *${staticParams
   ? ` Pre-renders the ${staticParams.length} known values of [${paramName}].`
   : ` Pre-renders a single placeholder; the real ${paramName} is read at
 * runtime from useParams() inside page-client.tsx. Capacitor's webview
 * rewrites any unmatched /${dir.split("/")[0]}/<real-${paramName}>/ path to
 * the placeholder HTML so the client code then handles the routing.`}
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [${paramsList}];
}

export default function Page() {
  return <RouteContent />;
}
`;

  fs.writeFileSync(pagePath, wrapper, "utf8");
  console.log(`[ok]   ${dir}`);
}

for (const route of ROUTES) splitRoute(route);
console.log("\nDone.");
