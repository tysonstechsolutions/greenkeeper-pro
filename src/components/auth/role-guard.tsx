"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";

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

/** UI affordance only; RLS and RPC authorization remain authoritative. */
export function RoleGuard({ children, allowedRoles, fallback = null, redirectTo }: RoleGuardProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const allowed = !!profile && allowedRoles.includes(profile.role as UserRole);

  useEffect(() => {
    if (!loading && !allowed && redirectTo) router.replace(redirectTo);
  }, [allowed, loading, redirectTo, router]);

  if (loading) return null;
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function RoleHidden({ children, hiddenFromRoles }: { children: ReactNode; hiddenFromRoles: UserRole[] }) {
  const { profile } = useAuth();
  return profile && hiddenFromRoles.includes(profile.role as UserRole) ? null : <>{children}</>;
}

export function RoleVisible({ children, visibleToRoles }: { children: ReactNode; visibleToRoles: UserRole[] }) {
  const { profile } = useAuth();
  return profile && visibleToRoles.includes(profile.role as UserRole) ? <>{children}</> : null;
}

export function useRoleAccess(): {
  userRole: UserRole | undefined;
  hasRole: (roles: UserRole[]) => boolean;
  hasMinimumRole: (minimumRole: UserRole) => boolean;
  isManagement: () => boolean;
  isAdmin: () => boolean;
  isSuperintendent: () => boolean;
  isPro: () => boolean;
  isStaff: () => boolean;
} {
  const { profile } = useAuth();
  const userRole = profile?.role as UserRole | undefined;
  const rank: Record<UserRole, number> = {
    seasonal: 0,
    crew: 1,
    mechanic: 2,
    foreman: 3,
    pro: 3,
    asst_super: 4,
    super: 5,
    director: 5,
    gm: 5,
  };
  const hasRole = (roles: UserRole[]) => !!userRole && roles.includes(userRole);
  return {
    userRole,
    hasRole,
    hasMinimumRole: (minimumRole) => !!userRole && rank[userRole] >= rank[minimumRole],
    isManagement: () => hasRole(MANAGEMENT_ROLES),
    isAdmin: () => hasRole(ADMIN_ROLES),
    isSuperintendent: () => hasRole(["super", "asst_super", "director", "gm"]),
    isPro: () => hasRole(["pro"]),
    isStaff: () => hasRole(STAFF_ROLES),
  };
}
