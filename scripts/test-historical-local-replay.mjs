#!/usr/bin/env node

/**
 * Local-only regression coverage for the historical migration fixture.
 *
 * It intentionally creates no auth users, employee records, assignments, or
 * operational data. The UUID-only rows below prove that the local bootstrap
 * preserves compatible pre-existing inspection/checkout rows without relying
 * on invented people to satisfy an unknown historical FK contract.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureScript = join(repositoryRoot, "scripts", "prepare-phase1a-local-fixture.mjs");
const productionProjectRef = "mbgublyqnyghmvqfooao";
const supabase = process.env.SUPABASE_BIN || "supabase";
const dbProjectId = "greenkeeper-pro-phase1a-matrix";
const finalMigrationVersion = "20260716190000";
const finalMigrationName = "unified_operations_command_center";

function fail(message) {
  throw new Error(`Historical local replay test refused: ${message}`);
}

function assertLocalOnlyEnvironment() {
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/(SUPABASE|PROJECT_REF|DATABASE_URL)/i.test(name)) continue;
    if (value.includes(productionProjectRef)) fail(`${name} references production`);
    if (!/^(https?|postgres(?:ql)?):\/\//i.test(value)) continue;
    const host = new URL(value).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
      fail(`${name} is not a localhost connection`);
    }
  }
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? "";
    throw new Error(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`);
  }
}

function createFixture(mode) {
  const outDir = mkdtempSync(join(os.tmpdir(), "greenkeeper-historical-replay-"));
  run(process.execPath, [fixtureScript, "create", "--mode", mode, "--out-dir", outDir], repositoryRoot);
  return outDir;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function localDbHealth() {
  try {
    return run(
      "docker",
      ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", `supabase_db_${dbProjectId}`],
      repositoryRoot,
    ).trim();
  } catch {
    return "";
  }
}

async function waitForLocalDatabase() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (localDbHealth() === "healthy") return;
    await sleep(1000);
  }
  fail(`local Docker database supabase_db_${dbProjectId} did not become healthy`);
}

async function waitForPostgresReady() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (localDbHealth() === "healthy") {
      try {
        query("SELECT 1");
        return;
      } catch {
        // The healthcheck can turn green before Postgres accepts exec sessions
        // after a reset. Keep polling instead of treating that race as a
        // migration failure.
      }
    }
    await sleep(1000);
  }
  fail("local Postgres did not accept a query after the replay completed");
}

async function waitForFinalMigration() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const applied = query(`
        SELECT EXISTS (
          SELECT 1
          FROM supabase_migrations.schema_migrations
          WHERE version = '${finalMigrationVersion}'
        );
      `);
      if (applied === "t") return true;
    } catch {
      // The database may still be restarting after the CLI reports completion.
    }
    await sleep(1000);
  }
  return false;
}

async function startLocalStack(fixture) {
  if (localDbHealth() === "healthy") return;
  try {
    run(supabase, ["start", "--ignore-health-check"], join(fixture, "supabase"));
  } catch (error) {
    if (!error.message.includes("already running")) throw error;
  }
  await waitForLocalDatabase();
}

async function resetFixture(fixture) {
  await waitForLocalDatabase();
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = run(supabase, ["db", "reset", "--local"], join(fixture, "supabase"));
      await waitForPostgresReady();
      await waitForFinalMigration();
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /error running container|wsarecv|connection to server|failed to create migration table|database system is starting up|failed to execute http request|context deadline|invalid response|status 502/i.test(message);
      if (!transient || attempt === 3) throw error;
      if (await waitForFinalMigration()) return "local reset completed after a transient Supabase restart error";
      await sleep(5000);
      await waitForLocalDatabase();
    }
  }
  throw lastError;
}

function databaseContainer() {
  const containers = run("docker", ["ps", "--format", "{{.Names}}"], repositoryRoot)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const container = containers.find((name) => name === `supabase_db_${dbProjectId}`);
  if (!container) fail(`local Docker database container supabase_db_${dbProjectId} is not running`);
  return container;
}

function query(sql) {
  return run(
    "docker",
    ["exec", databaseContainer(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
    repositoryRoot,
  ).trim();
}

function assertFinalPhase1aSchema() {
  const result = query(`
    SELECT
      to_regclass('public.duty_assignments') IS NOT NULL,
      to_regclass('public.equipment_inspections') IS NOT NULL,
      to_regclass('public.green_observations') IS NOT NULL,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'role_group'
      ),
      to_regprocedure('public.can_manage_staff_member(uuid)') IS NOT NULL,
      to_regclass('public.staff_personnel_private') IS NOT NULL,
      to_regclass('public.staff_directory') IS NOT NULL,
      to_regprocedure('public.update_staff_profile(uuid,jsonb,jsonb)') IS NOT NULL,
      NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name IN ('hire_date','certifications','emergency_contact','personnel_details')
      ),
      to_regclass('public.operational_work_states') IS NOT NULL,
      to_regclass('public.operational_work_dependencies') IS NOT NULL,
      to_regprocedure('public.delegate_operational_work(text,uuid,text,text,date,text,date,boolean,text)') IS NOT NULL;
  `);
  if (result !== "t|t|t|t|t|t|t|t|t|t|t|t") {
    fail(`full replay did not reach the latest repository schema (received ${result})`);
  }
}

const checkoutDefinition = `
CREATE TABLE public.equipment_checkouts (
  id uuid PRIMARY KEY,
  equipment_id uuid NOT NULL,
  checked_out_by uuid NOT NULL,
  checked_out_at timestamptz,
  expected_return timestamptz,
  returned_at timestamptz,
  condition_out text,
  condition_in text,
  notes_out text,
  notes_in text,
  created_at timestamptz
);
`;

const inspectionDefinition = `
CREATE TABLE public.equipment_inspections (
  id uuid PRIMARY KEY,
  equipment_id uuid NOT NULL,
  inspection_type text NOT NULL,
  inspected_by uuid NOT NULL,
  checkout_id uuid,
  checklist_items jsonb NOT NULL,
  overall_status text NOT NULL,
  notes text,
  photos text[] NOT NULL,
  engine_hours numeric,
  fuel_level text,
  oil_level text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
`;

const greenDefinition = `
CREATE TYPE public.green_issue_type AS ENUM (
  'fungus_disease', 'dry_spot', 'wet_area', 'bare_spot', 'weed_pressure',
  'pest_damage', 'mechanical_damage', 'irrigation_issue', 'algae',
  'frost_damage', 'ball_marks', 'scalping', 'compaction', 'thatch_buildup',
  'aeration_needed', 'topdressing_needed', 'moss', 'shade_stress',
  'traffic_wear', 'chemical_burn', 'poor_drainage', 'uneven_surface', 'other'
);
CREATE TYPE public.green_observation_status AS ENUM ('open', 'in_progress', 'resolved', 'monitoring');
CREATE TABLE public.green_observations (
  id uuid PRIMARY KEY,
  hole_number integer NOT NULL,
  pin_x real NOT NULL,
  pin_y real NOT NULL,
  issue_type public.green_issue_type NOT NULL,
  priority text NOT NULL,
  status public.green_observation_status NOT NULL,
  title text NOT NULL,
  description text,
  fix_instructions text,
  photo_url text,
  reported_by uuid NOT NULL,
  task_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
`;

const greenRow = `
INSERT INTO public.green_observations (
  id, hole_number, pin_x, pin_y, issue_type, priority, status, title,
  reported_by, created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000003', 7, 0.25, 0.75,
  'dry_spot', 'normal', 'open', 'Preserved green observation',
  '30000000-0000-0000-0000-000000000001',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
`;

const checkoutRow = `
INSERT INTO public.equipment_checkouts (
  id, equipment_id, checked_out_by, checked_out_at, condition_out, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '2026-01-01T00:00:00Z', 'good', '2026-01-01T00:00:00Z'
);
`;

const inspectionRow = `
INSERT INTO public.equipment_inspections (
  id, equipment_id, inspection_type, inspected_by, checkout_id, checklist_items,
  overall_status, photos, created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  'pre', '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', '[]'::jsonb, 'pass', '{}',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
`;

function writePreBootstrapFixture(fixture, sql) {
  writeFileSync(
    join(fixture, "supabase", "migrations", "20000101000007_historical_compatibility_case.sql"),
    `-- Temporary local-only compatibility fixture.\n${sql}`,
    "utf8",
  );
}

async function runCompatibilityScenario(name, sql, assertion) {
  const fixture = createFixture("all");
  await startLocalStack(fixture);
  writePreBootstrapFixture(fixture, sql);
  await resetFixture(fixture);
  assertFinalPhase1aSchema();
  assertion();
  console.log(`PASS ${name}`);
}

async function runPartialSchemaScenario() {
  const fixture = createFixture("foundational-compat");
  await startLocalStack(fixture);
  writePreBootstrapFixture(
    fixture,
    "CREATE TABLE public.equipment_inspections (id uuid PRIMARY KEY, equipment_id uuid NOT NULL);",
  );
  try {
    await resetFixture(fixture);
  } catch (error) {
    if (error.message.includes("Historical local bootstrap refused incompatible existing schema")) {
      console.log("PASS partial incompatible inspection schema is refused before repair");
      return;
    }
    throw error;
  }
  fail("partial incompatible inspection schema unexpectedly replayed");
}

async function runEmptyReplay(label) {
  const fixture = createFixture("all");
  await startLocalStack(fixture);
  await resetFixture(fixture);
  assertFinalPhase1aSchema();
  console.log(`PASS empty full replay #${label} through ${finalMigrationVersion}_${finalMigrationName}.sql`);
}

function requestedScenario() {
  const index = process.argv.indexOf("--scenario");
  if (index === -1) return "all";
  const value = process.argv[index + 1];
  const supported = new Set(["all", "empty-1", "empty-2", "both", "green-and-inspection", "checkout", "inspection", "partial"]);
  if (!supported.has(value)) {
    fail("--scenario must be all, empty-1, empty-2, both, green-and-inspection, checkout, inspection, or partial");
  }
  return value;
}

async function main() {
  assertLocalOnlyEnvironment();
  const scenario = requestedScenario();

  if (scenario === "all" || scenario === "empty-1") {
    await runEmptyReplay(1);
  }

  if (scenario === "all" || scenario === "empty-2") {
    await runEmptyReplay(2);
  }

  if (scenario === "all" || scenario === "both") {
    await runCompatibilityScenario(
      "pre-existing compatible checkout and inspection rows are retained",
      `${checkoutDefinition}${inspectionDefinition}${checkoutRow}${inspectionRow}`,
      () => {
        const result = query(`
          SELECT
            (SELECT count(*) FROM public.equipment_checkouts WHERE id = '10000000-0000-0000-0000-000000000001'),
            (SELECT count(*) FROM public.equipment_inspections WHERE id = '10000000-0000-0000-0000-000000000002');
        `);
        if (result !== "1|1") fail(`existing rows were not preserved (received ${result})`);
      },
    );
  }

  if (scenario === "all" || scenario === "green-and-inspection") {
    const fixture = createFixture("production-shaped");
    await startLocalStack(fixture);
    writePreBootstrapFixture(fixture, `${greenDefinition}${greenRow}${inspectionDefinition}${inspectionRow}`);
    await resetFixture(fixture);
    assertFinalPhase1aSchema();
    const result = query(`
      SELECT
        (SELECT count(*) FROM public.green_observations WHERE id = '10000000-0000-0000-0000-000000000003'),
        to_regclass('public.equipment_inspections') IS NOT NULL,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'green_observations' AND column_name = 'area_path'
        );
    `);
    if (result !== "1|t|t") fail(`production-shaped green/inspection compatibility failed (received ${result})`);
    console.log("PASS production-shaped green observations and inspections retain data");
  }

  if (scenario === "all" || scenario === "checkout") {
    await runCompatibilityScenario(
      "checkout-only schema is completed without touching its existing row",
      `${checkoutDefinition}${checkoutRow}`,
      () => {
        const result = query(`
          SELECT
            (SELECT count(*) FROM public.equipment_checkouts WHERE id = '10000000-0000-0000-0000-000000000001'),
            to_regclass('public.equipment_inspections') IS NOT NULL;
        `);
        if (result !== "1|t") fail(`checkout-only compatibility failed (received ${result})`);
      },
    );
  }

  if (scenario === "all" || scenario === "inspection") {
    await runCompatibilityScenario(
      "inspection-only schema is completed without touching its existing row",
      `${inspectionDefinition}${inspectionRow}`,
      () => {
        const result = query(`
          SELECT
            (SELECT count(*) FROM public.equipment_inspections WHERE id = '10000000-0000-0000-0000-000000000002'),
            to_regclass('public.equipment_checkouts') IS NOT NULL;
        `);
        if (result !== "1|t") fail(`inspection-only compatibility failed (received ${result})`);
      },
    );
  }

  if (scenario === "all" || scenario === "partial") {
    await runPartialSchemaScenario();
  }

  // The refusal scenario intentionally leaves its disposable stack at the
  // incompatible pre-bootstrap schema. Restore a fully migrated local stack
  // after the complete matrix so the documented follow-on security and lint
  // commands exercise the final schema rather than that refusal fixture.
  if (scenario === "all") {
    await runEmptyReplay("final");
  }
}

await main();
