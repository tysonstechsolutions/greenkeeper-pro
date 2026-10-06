// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EDGE_FUNCTIONS,
  EDGE_FUNCTION_LABELS,
  TRACKED_MIGRATIONS,
  checkConfig,
  checkEdgeFunctions,
  functionStateFromStatus,
} from "@/lib/system/health";

const functionsDir = path.resolve(process.cwd(), "supabase/functions");

describe("system health", () => {
  it("checks every edge function in the repo, each with a label", () => {
    const onDisk = fs
      .readdirSync(functionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_shared")
      .map((d) => d.name)
      .sort();
    expect([...EDGE_FUNCTIONS].sort()).toEqual(onDisk);
    for (const name of EDGE_FUNCTIONS) expect(EDGE_FUNCTION_LABELS[name]).toBeTruthy();
  });

  it("every function rejects or harmlessly answers the GET probe before doing work", () => {
    for (const name of EDGE_FUNCTIONS) {
      const src = fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
      const safe = /method !== "POST"/.test(src) || /return jsonError\("Method not allowed", 405\)/.test(src) || /authorize\(req\)/.test(src);
      expect(safe, `${name} must not do work on a plain GET`).toBe(true);
    }
  });

  it("reads 404 as not deployed and anything else as deployed", () => {
    expect(functionStateFromStatus(404)).toBe("missing");
    expect(functionStateFromStatus(405)).toBe("ok");
    expect(functionStateFromStatus(401)).toBe("ok");
    expect(functionStateFromStatus(null)).toBe("unknown");
  });

  it("probes each function with a GET and says how to fix a missing one", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      return new Response("{}", { status: url.endsWith("/translate") ? 404 : 405 });
    });
    const res = await checkEdgeFunctions("https://x.supabase.co", "anon", "tok", fetchImpl as unknown as typeof fetch);
    expect(res).toHaveLength(EDGE_FUNCTIONS.length);
    const translate = res.find((r) => r.name === "translate")!;
    expect(translate.state).toBe("missing");
    expect(translate.detail).toContain("supabase functions deploy translate");
    expect(res.filter((r) => r.state === "ok")).toHaveLength(EDGE_FUNCTIONS.length - 1);
  });

  it("tracks migrations that exist in the repo", () => {
    for (const m of TRACKED_MIGRATIONS) {
      expect(fs.existsSync(path.resolve(process.cwd(), `supabase/migrations/${m.name}.sql`))).toBe(true);
      const sql = fs.readFileSync(path.resolve(process.cwd(), `supabase/migrations/${m.name}.sql`), "utf8");
      expect(sql).toContain(`'${m.name}'`); // records itself in app_migrations
    }
  });

  it("flags missing build settings", () => {
    const res = checkConfig({ NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" });
    expect(res.find((c) => c.label === "Supabase connection")?.state).toBe("ok");
    expect(res.find((c) => c.label === "Weather")?.state).toBe("missing");
  });
});
