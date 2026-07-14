import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidenceScript = join(root, "scripts/phase1a-production-evidence.mjs");
const applyScript = join(root, "scripts/apply-phase1a-production.ps1");
const runbook = join(root, "docs/ops/phase1a-controlled-production-runbook.md");

describe("Phase 1A production readiness tooling", () => {
  it("self-tests its read-only production target guards without contacting a database", () => {
    const output = execFileSync(process.execPath, [evidenceScript, "--self-test"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toContain("self-test passed");
  });

  it("requires typed confirmation and a one-migration dry run before application", () => {
    const script = readFileSync(applyScript, "utf8");
    expect(script).toContain("APPLY_PHASE1A_TO_PRODUCTION");
    expect(script).toContain("supabase db push --linked --dry-run");
    expect(script).toContain("20260407");
    expect(script).not.toMatch(/supabase db push --linked --include-all/);
    expect(script).toContain("20260713230000_daily_operations_phase1a_corrective.sql");
  });

  it("documents evidence, backup confirmation, stop conditions, and no-staging risk", () => {
    const document = readFileSync(runbook, "utf8");
    expect(document).toContain("There is no staging environment");
    expect(document).toContain("backup");
    expect(document).toContain("phase1a-production-evidence.mjs before");
    expect(document).toContain("APPLY_PHASE1A_TO_PRODUCTION");
    expect(document).toContain("never create test fixtures in production");
  });
});
