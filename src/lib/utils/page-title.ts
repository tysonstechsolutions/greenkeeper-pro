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
  "/equipment": "Equipment",
  "/equipment-checkout": "Equipment Checkout",
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

// Next.js with `trailingSlash: true` may surface pathnames like "/dashboard/"
// or root "/". Normalize to a canonical "/<segment>" form before lookup.
function canonical(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const stripped = pathname.replace(/\/+$/, "");
  return stripped || "/";
}

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
