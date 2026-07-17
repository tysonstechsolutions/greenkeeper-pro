#!/usr/bin/env node

/**
 * Execute the unified Operations workflow and RLS matrix only against the
 * disposable local Supabase database created by the historical replay test.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sql = readFileSync(join(root, "supabase", "tests", "unified_operations_security.sql"), "utf8");
const container = process.env.UNIFIED_OPERATIONS_DB_CONTAINER
  ?? "supabase_db_greenkeeper-pro-phase1a-matrix";
const productionProjectRef = "mbgublyqnyghmvqfooao";

if (!/^supabase_db_[a-zA-Z0-9_.-]+$/.test(container) || container.includes(productionProjectRef)) {
  throw new Error(`Refusing unified Operations integration test against non-local container: ${container}`);
}
for (const [name, value] of Object.entries(process.env)) {
  if (value?.includes(productionProjectRef) && /(SUPABASE|PROJECT_REF|DATABASE_URL)/i.test(name)) {
    throw new Error(`Refusing unified Operations integration test: ${name} references production.`);
  }
}

try {
  const output = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { cwd: root, input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  process.stdout.write(output);
} catch (error) {
  const stdout = error.stdout?.toString() ?? "";
  const stderr = error.stderr?.toString() ?? "";
  throw new Error(`Disposable unified Operations integration test failed\n${stdout}\n${stderr}`);
}
