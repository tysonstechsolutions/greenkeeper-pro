import {
  LayoutDashboard,
  CalendarDays,
  Map,
  MoreHorizontal,
  Wallet,
  FileText,
  BarChart3,
  ClipboardCheck,
  Landmark,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "@/lib/providers/view-provider";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Bottom-nav (and "top-level" header detection) is driven by the chosen
 * VIEW, not by roles. Both views read/write the same data — these only
 * decide what sits in the nav vs. under More.
 */
export const NAV_ITEMS: Record<AppView, NavItem[]> = {
  super: [
    { href: "/today", label: "Today", icon: Sunrise },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/course-map", label: "Map", icon: Map },
    { href: "/money", label: "Money", icon: Wallet },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ],
  gm: [
    { href: "/gm", label: "Dashboard", icon: LayoutDashboard },
    { href: "/budget", label: "Budget", icon: Wallet },
    { href: "/purchase-requests", label: "PRs", icon: FileText },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ],
  bdh: [
    { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck },
    { href: "/budget", label: "Budget", icon: Wallet },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/revenue", label: "Revenue", icon: Landmark },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ],
};

/** True when `pathname` is a section root for the given view (no back button). */
export function isViewTopLevel(view: AppView, pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return NAV_ITEMS[view].some((i) => i.href === p);
}
