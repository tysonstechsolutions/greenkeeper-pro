"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Loader2 } from "lucide-react";

type UserRole = "super" | "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal";

// Role hierarchy for permission checking
const roleHierarchy: Record<UserRole, number> = {
  super: 100,
  asst_super: 80,
  foreman: 60,
  mechanic: 50,
  crew: 30,
  seasonal: 10,
};

// Management roles that can access admin features
export const MANAGEMENT_ROLES: UserRole[] = ["super", "asst_super", "foreman"];
export const ADMIN_ROLES: UserRole[] = ["super", "asst_super"];
export const SUPER_ONLY: UserRole[] = ["super"];

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

  if (loading) return null;

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

  if (loading) return null;

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

  return {
    userRole,
    hasRole,
    hasMinimumRole,
    isManagement,
    isAdmin,
    isSuperintendent,
  };
}
