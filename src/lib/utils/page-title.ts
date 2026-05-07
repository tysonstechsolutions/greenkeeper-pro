const TOP_LEVEL_ROUTES = new Set([
  "/",
  "/dashboard",
  "/tasks",
  "/schedule",
  "/messages",
  "/more",
  "/login",
  "/pin-login",
]);

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Tasks",
  "/schedule": "Schedule",
  "/messages": "Messages",
  "/more": "More",
  "/assistant": "AI Assistant",
  "/assets": "Assets",
  "/budget": "Budget",
  "/capital-projects": "Capital Projects",
  "/checklists": "Checklists",
  "/chemicals": "Chemicals",
  "/clubhouse": "Clubhouse",
  "/compliance": "IL RUP Records",
  "/course-map": "Course Map",
  "/drone": "Drone Flights",
  "/environmental": "Environmental",
  // /equipment is now an internal/legacy URL — operational data lives on
  // /assets/view. Title still reads "Assets" so the header is consistent
  // even if a deep link lands the user there.
  "/equipment": "Assets",
  "/equipment-checkout": "Asset Checkout",
  "/feedback": "Feedback",
  "/inspections": "Inspections",
  "/install": "Install App",
  "/invite": "Invite",
  "/irrigation": "Irrigation",
  "/knowledge": "Knowledge Base",
  "/notifications": "Notifications",
  "/order-list": "Order List",
  "/parking-lot": "Parking & Paths",
  "/photos": "Photos",
  "/plan": "Annual Plan",
  "/polls": "Polls",
  "/report-issue": "Report Issue",
  "/reports": "Reports",
  "/revenue": "Revenue",
  "/settings": "Settings",
  "/spray-window": "Spray Window",
  "/staff": "Staff",
  "/tournaments": "Tournaments",
  "/vendors": "Vendors",
  "/voice-log": "Voice Log",
  "/water-usage": "Water Usage",
  "/weather": "Weather",
};

/**
 * Normalize pathnames that Next.js with `trailingSlash: true` can hand us
 * (e.g. "/dashboard/", "/tasks//", "/") to a canonical "/<segment>" form.
 * Exported so other route-matching code (AppShell.isPublicRoute,
 * ChatBubble's FAB list) can use the same rule.
 */
export function stripTrailingSlash(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const stripped = pathname.replace(/\/+$/, "");
  return stripped || "/";
}

// Kept as a local alias — existing call sites in this file use it.
const canonical = stripTrailingSlash;

export function isTopLevelRoute(pathname: string): boolean {
  return TOP_LEVEL_ROUTES.has(canonical(pathname));
}

export function getPageTitle(pathname: string): string {
  const p = canonical(pathname);
  if (TITLES[p]) return TITLES[p];
  const firstSeg = "/" + p.split("/").filter(Boolean)[0];
  if (TITLES[firstSeg]) return TITLES[firstSeg];
  const last = p.split("/").filter(Boolean).pop() ?? "";
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
