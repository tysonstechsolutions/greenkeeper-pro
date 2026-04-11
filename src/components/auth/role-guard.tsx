"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Loader2 } from "lucide-react";

type UserRole = "super" | "asst_super" | "director" | "foreman" | "mechanic" | "crew" | "seasonal" | "pro";

// Role hierarchy for permission checking
const roleHierarchy: Record<UserRole, number> = {
  super: 100,
  asst_super: 80,
  director: 85, // Director of Golf - above asst_super but below super
  pro: 75, // Pro shop manager - above foreman but below asst_super
  foreman: 60,
  mechanic: 50,
  crew: 30,
  seasonal: 10,
};

// Management roles that can access admin features
export const MANAGEMENT_ROLES: UserRole[] = ["super", "asst_super", "director", "foreman", "pro"];
export const ADMIN_ROLES: UserRole[] = ["super", "asst_super", "director"];
export const SUPER_ONLY: UserRole[] = ["super"];
// Pro-related roles - superintendent, assistant superintendent, director, and pro
export const PRO_ROLES: UserRole[] = ["super", "asst_super", "director", "pro"];
// Staff roles - all internal staff
export const STAFF_ROLES: UserRole[] = ["super", "asst_super", "director", "foreman", "mechanic", "crew", "seasonal", "pro"];

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallback?: ReactNode;
  redirectTo?: string;
}

export function RoleGuard({
  children,
  allowedRoles,
  fallback,
  redirectTo = "/dashboard",
}: RoleGuardProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const userRole = profile?.role as UserRole | undefined;
  const hasAccess = userRole && allowedRoles.includes(userRole);

  useEffect(() => {
    if (!loading && !hasAccess && redirectTo) {
      router.replace(redirectTo);
    }
  }, [loading, hasAccess, redirectTo, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return fallback ?? null;
  }

  return <>{children}</>;
}

interface RoleHiddenProps {
  children: ReactNode;
  hiddenFromRoles: UserRole[];
}

export function RoleHidden({ children, hiddenFromRoles }: RoleHiddenProps) {
  const { profile, loading } = useAuth();

  // Show content while loading to prevent flash of disappearing content
  // Content will be hidden once role is determined if needed
  if (loading) return <>{children}</>;

  const userRole = profile?.role as UserRole | undefined;
  if (userRole && hiddenFromRoles.includes(userRole)) {
    return null;
  }

  return <>{children}</>;
}

interface RoleVisibleProps {
  children: ReactNode;
  visibleToRoles: UserRole[];
}

export function RoleVisible({ children, visibleToRoles }: RoleVisibleProps) {
  const { profile, loading } = useAuth();

  // Show content while loading to prevent flash of disappearing content
  // Content will be hidden once role is determined if user doesn't have access
  if (loading) return <>{children}</>;

  const userRole = profile?.role as UserRole | undefined;
  if (!userRole || !visibleToRoles.includes(userRole)) {
    return null;
  }

  return <>{children}</>;
}

// Hook for checking role permissions
export function useRoleAccess() {
  const { profile } = useAuth();
  const userRole = profile?.role as UserRole | undefined;

  const hasRole = (roles: UserRole[]) => {
    return userRole ? roles.includes(userRole) : false;
  };

  const hasMinimumRole = (minimumRole: UserRole) => {
    if (!userRole) return false;
    return roleHierarchy[userRole] >= roleHierarchy[minimumRole];
  };

  const isManagement = () => hasRole(MANAGEMENT_ROLES);
  const isAdmin = () => hasRole(ADMIN_ROLES);
  const isSuperintendent = () => hasRole(SUPER_ONLY);
  const isPro = () => userRole === "pro";
  const isStaff = () => hasRole(STAFF_ROLES);

  return {
    userRole,
    hasRole,
    hasMinimumRole,
    isManagement,
    isAdmin,
    isSuperintendent,
    isPro,
    isStaff,
  };
}
