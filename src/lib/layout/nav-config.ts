import {
  ListChecks,
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
 *
 * My Duties (his own work by day/week/month/quarter/year) is home. The
 * Operations Command Center — every task and crew duty, plus the printed
 * crew sheets — sits right next to it. Calendar moved into the Course &
 * Range and Restaurant hubs (and stays in search); its dated events also
 * show on My Duties.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/my-duties", label: "My Duties", icon: ListChecks },
  { href: "/operations", label: "Operations", icon: Sunrise },
  { href: "/course-map", label: "Map", icon: Map },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/more", label: "More", icon: MoreHorizontal },
];
