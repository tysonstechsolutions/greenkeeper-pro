import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ role: "gm" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, profile: { id: "u1", role: auth.role, full_name: "Test", email: "t@x" }, loading: false }),
}));
vi.mock("@/lib/hooks/usePwaInstall", () => ({ usePwaInstall: () => ({ isInstalled: true }) }));
vi.mock("@/components/auth/auto-logout-setting", () => ({ AutoLogoutSetting: () => null }));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return {
    ...actual,
    RoleVisible: ({ visibleToRoles, children }: { visibleToRoles: string[]; children: React.ReactNode }) =>
      visibleToRoles.includes(auth.role) ? <>{children}</> : null,
  };
});

import SettingsPage from "@/app/settings/page";

describe("Settings: Sign-in PINs", () => {
  it.each([
    ["gm", true],
    ["super", true],
    ["asst_super", true],
    ["director", false],
    ["fb_manager", false],
  ])("%s sees the link: %s", (role, shown) => {
    auth.role = role;
    render(<SettingsPage />);
    const link = screen.queryByRole("link", { name: /Sign-in PINs/ });
    expect(!!link).toBe(shown);
    if (link) expect(link.getAttribute("href")).toBe("/settings/pins");
  });
});
