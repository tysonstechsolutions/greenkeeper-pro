import {
  CalendarDays,
  Map,
  MoreHorizontal,
  Wallet,
  Sunrise,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Bottom-nav items. The app is single-view now — Tyson wears every hat
 * (superintendent, GM, F&B manager), so one nav shows everything and the
 * old Superintendent/GM/Business-Division-Head switching is gone. GM tools
 * live inside the Money workspace; PR Audit is under Money too.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: Sunrise },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/course-map", label: "Map", icon: Map },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/more", label: "More", icon: MoreHorizontal },
];
