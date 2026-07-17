import { afterEach, describe, expect, it, vi } from "vitest";
import { persistSessionDirect, supabaseAuthStorageKey } from "@/lib/supabase/persist-session";

function token(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("persistSessionDirect", () => {
  it("matches Supabase's hostname-prefix storage-key rule", () => {
    expect(supabaseAuthStorageKey("https://projectref.supabase.co")).toBe("sb-projectref-auth-token");
    expect(supabaseAuthStorageKey("http://127.0.0.1:54321")).toBe("sb-127-auth-token");
  });

  it("uses the hosted project reference for the Supabase auth storage key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projectref.supabase.co");
    persistSessionDirect({
      access_token: token({ sub: "user-1", exp: 2_000_000_000 }),
      refresh_token: "refresh",
    });
    expect(localStorage.getItem("sb-projectref-auth-token")).toContain('"id":"user-1"');
  });

  it("uses the same hostname-prefix rule for a disposable localhost stack", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    persistSessionDirect({
      access_token: token({ sub: "local-user", exp: 2_000_000_000 }),
      refresh_token: "refresh",
    });
    expect(localStorage.getItem("sb-127-auth-token")).toContain('"id":"local-user"');
  });
});
