"use client";

import { type ReactNode } from "react";

/**
 * Roles are DISABLED for now — the app runs on a single shared account and is
 * fully open (what you see is driven by the chosen view, not by who you are).
 * These guards are kept as pass-throughs so the 15+ existing call sites keep
 * working without edits; flip the bodies back if per-person roles return.
 */
export type UserRole =
  | "super"
  | "asst_super"
  | "director"
  | "foreman"
  | "mechanic"
  | "crew"
  | "seasonal"
  | "pro"
  | "gm";

// Kept so existing imports resolve. Not used for gating while roles are off.
export const MANAGEMENT_ROLES: UserRole[] = ["super", "asst_super", "director", "foreman", "pro", "gm"];
export const ADMIN_ROLES: UserRole[] = ["super", "asst_super", "director", "gm"];
export const SUPER_ONLY: UserRole[] = ["super"];
export const PRO_ROLES: UserRole[] = ["super", "asst_super", "director", "pro", "gm"];
export const STAFF_ROLES: UserRole[] = ["super", "asst_super", "director", "foreman", "mechanic", "crew", "seasonal", "pro", "gm"];
export const GM_ROLES: UserRole[] = ["gm", "super", "director"];

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallback?: ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ children }: RoleGuardProps) {
  return <>{children}</>;
}

interface RoleHiddenProps {
  children: ReactNode;
  hiddenFromRoles: UserRole[];
}

export function RoleHidden({ children }: RoleHiddenProps) {
  return <>{children}</>;
}

interface RoleVisibleProps {
  children: ReactNode;
  visibleToRoles: UserRole[];
}

export function RoleVisible({ children }: RoleVisibleProps) {
  return <>{children}</>;
}

// Hook for checking role permissions — all permissive while roles are off.
export function useRoleAccess() {
  return {
    userRole: undefined as UserRole | undefined,
    hasRole: (_roles: UserRole[]) => true,
    hasMinimumRole: (_minimumRole: UserRole) => true,
    isManagement: () => true,
    isAdmin: () => true,
    isSuperintendent: () => true,
    isPro: () => false,
    isStaff: () => true,
  };
}
