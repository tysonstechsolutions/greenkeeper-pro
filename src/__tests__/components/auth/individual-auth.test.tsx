import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth/auth-gate";
import { RoleGuard } from "@/components/auth/role-guard";
import { AuthContext, type UseAuthReturn } from "@/lib/hooks/useAuth";
import type { Profile } from "@/types/database";

const navigation = vi.hoisted(() => ({
  pathname: "/operations/duties",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

function authState(overrides: Partial<UseAuthReturn> = {}): UseAuthReturn {
  return {
    user: null,
    session: null,
    profile: null,
    loading: false,
    error: null,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
    isSuper: false,
    isAsstSuper: false,
    isForeman: false,
    isMechanic: false,
    isCrew: false,
    isSeasonal: false,
    isPro: false,
    isDirector: false,
    isGM: false,
    isStaff: false,
    isManager: false,
    canCreateInvites: false,
    canManageEquipment: false,
    canManageChemicals: false,
    canApproveTimesheets: false,
    ...overrides,
  };
}

function actor(role: Profile["role"]): UseAuthReturn {
  const user = { id: `${role}-id` } as User;
  const profile = { id: user.id, role, is_active: true } as Profile;
  return authState({
    user,
    session: { user } as Session,
    profile,
    isStaff: true,
    isGM: role === "gm",
    isCrew: role === "crew",
  });
}

describe("individual application authorization", () => {
  beforeEach(() => {
    navigation.pathname = "/operations/duties";
    navigation.replace.mockReset();
  });

  it("does not render a protected route without an individual session", async () => {
    render(
      <AuthContext.Provider value={authState()}>
        <AuthGate><div>Protected duties</div></AuthGate>
      </AuthContext.Provider>,
    );
    expect(screen.queryByText("Protected duties")).not.toBeInTheDocument();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(
      "/pin-login?returnTo=%2Foperations%2Fduties",
    ));
  });

  it("renders operational work for the signed-in employee", () => {
    render(
      <AuthContext.Provider value={actor("crew")}>
        <AuthGate><div>My assigned work</div></AuthGate>
      </AuthContext.Provider>,
    );
    expect(screen.getByText("My assigned work")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("keeps the PIN login route public before a session exists", () => {
    navigation.pathname = "/pin-login";
    render(
      <AuthContext.Provider value={authState()}>
        <AuthGate><div>Individual PIN login</div></AuthGate>
      </AuthContext.Provider>,
    );
    expect(screen.getByText("Individual PIN login")).toBeInTheDocument();
  });

  it("does not grant manager UI to a crew profile or a missing profile", () => {
    const { rerender } = render(
      <AuthContext.Provider value={actor("crew")}>
        <RoleGuard allowedRoles={["gm"]} fallback={<div>Not authorized</div>}>
          <div>Manager controls</div>
        </RoleGuard>
      </AuthContext.Provider>,
    );
    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(screen.queryByText("Manager controls")).not.toBeInTheDocument();

    rerender(
      <AuthContext.Provider value={authState({ user: { id: "orphan" } as User })}>
        <RoleGuard allowedRoles={["gm"]} fallback={<div>Not authorized</div>}>
          <div>Manager controls</div>
        </RoleGuard>
      </AuthContext.Provider>,
    );
    expect(screen.queryByText("Manager controls")).not.toBeInTheDocument();
  });

  it("allows the authenticated GM profile to use manager controls", () => {
    render(
      <AuthContext.Provider value={actor("gm")}>
        <RoleGuard allowedRoles={["gm"]}><div>Manager controls</div></RoleGuard>
      </AuthContext.Provider>,
    );
    expect(screen.getByText("Manager controls")).toBeInTheDocument();
  });

  it("does not mount the retired shared device lock around application auth", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const authHook = readFileSync(join(process.cwd(), "src/lib/hooks/useAuth.ts"), "utf8");
    expect(layout).not.toContain("<LockGate>");
    expect(authHook).not.toContain("NEXT_PUBLIC_APP_PASSWORD");
    expect(authHook).not.toContain("signInWithPassword");
  });
});
