const TOP_LEVEL_ROUTES = new Set([
  "/",
  "/dashboard",
  "/tasks",
  "/schedule",
  "/more",
  "/login",
  "/pin-login",
]);

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Tasks",
  "/schedule": "Schedule",
  "/more": "More",
  "/assistant": "AI Assistant",
  "/assets": "Assets",
  "/budget": "Budget",
  "/capital-projects": "Capital Projects",
  "/clubhouse": "Clubhouse",
  "/course-map": "Course Map",
  "/environmental": "Environmental",
  "/financial-watch": "Financial Watch",
  // /equipment is now an internal/legacy URL — operational data lives on
  // /assets/view. Title still reads "Assets" so the header is consistent
  // even if a deep link lands the user there.
  "/equipment": "Assets",
  "/gm": "Overview",
  "/grounds": "Course & Grounds",
  "/install": "Install App",
  "/invite": "Invite",
  "/irrigation": "Irrigation",
  "/knowledge": "Knowledge Base",
  "/library": "Library",
  "/notifications": "Notifications",
  "/order-list": "Order List",
  "/onboarding": "Onboarding & SOPs",
  "/ai-library": "AI Library",
  "/documents": "Documents",
  "/paperwork": "Paperwork",
  "/parking-lot": "Parking & Paths",
  "/photos": "Photos",
  "/procurement": "Procurement",
  "/report-issue": "Report Issue",
  "/reports": "Reports",
  "/revenue": "Revenue",
  "/settings": "Settings",
  "/staff": "Staff",
  "/staff/profile": "Employee Profile",
  "/tournaments": "Tournaments",
  "/vendors": "Vendors",
  "/voice-log": "Voice Log",
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
