#!/usr/bin/env node

/**
 * Builds an unlinked, local-only migration fixture under a caller-selected
 * temporary directory. It preserves source migration SQL except for the small,
 * recorded local-only compatibility transforms below, and gives historical
 * short/duplicate filenames deterministic 14-digit fixture versions so the
 * local CLI can replay their logical order. Repository files, cloud links, and
 * hosted migration ledgers are never changed.
 *
 * Usage:
 *   node scripts/prepare-phase1a-local-fixture.mjs create --mode pre-corrective --out-dir C:\\tmp\\phase1a-matrix
 *   node scripts/prepare-phase1a-local-fixture.mjs append-corrective --out-dir C:\\tmp\\phase1a-matrix
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSupabase = join(repositoryRoot, "supabase");
const sourceMigrations = join(sourceSupabase, "migrations");
const sourceConfig = join(sourceSupabase, "config.toml");
const localBootstrap = join(
  sourceSupabase,
  "local-bootstrap",
  "20260406000001_historical_foundations.sql",
);
const productionProjectRef = "mbgublyqnyghmvqfooao";
const correctiveMigration = "20260713230000_daily_operations_phase1a_corrective.sql";
const focusedPreCorrectiveSources = new Set([
  "001_initial_schema.sql",
  "002_invites_table.sql",
  "003_activity_log.sql",
  "004_user_preferences.sql",
  "005_missing_tables.sql",
  "006_add_director_role.sql",
  "20260415_add_vendors.sql",
  "20260609190000_schedule_recurrence.sql",
  "20260625_add_personnel_details.sql",
  "20260626_pro_shop_scheduler.sql",
  "20260626_pro_shop_flex.sql",
  "20260701_pro_shop_duties.sql",
  "20260702_operating_rhythm.sql",
  "20260713190000_daily_operations_phase1a.sql",
  "20260713210000_daily_operations_phase1a_existing_series.sql",
]);
const foundationalSources = new Set([
  "001_initial_schema.sql",
  "002_invites_table.sql",
  "003_activity_log.sql",
  "004_user_preferences.sql",
  "005_missing_tables.sql",
  "006_add_director_role.sql",
]);
const updatedAtCompatibilityMigration = "20260406000000_phase1a_fixture_updated_at_compat.sql";
const localBootstrapMigration = "20260406000001_historical_foundations.sql";
const updatedAtCompatibilitySql = `-- Temporary Phase 1A fixture compatibility only. The historical 20260407
-- observation migrations install this trigger before the source chain defines it.
-- This file is never written to the repository migration directory.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
`;

function fail(message) {
  throw new Error(`Phase 1A local fixture refused: ${message}`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--")) fail(`unexpected argument ${flag}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) fail(`${flag} requires a value`);
    options[flag.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function assertLocalOnlyEnvironment() {
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/(SUPABASE|PROJECT_REF|DATABASE_URL)/i.test(name)) continue;
    if (value.includes(productionProjectRef)) {
      fail(`${name} references the production project`);
    }
    if (!/^(https?|postgres(?:ql)?):\/\//i.test(value)) continue;
    let host;
    try {
      host = new URL(value).hostname;
    } catch {
      fail(`${name} is not a valid local connection URL`);
    }
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
      fail(`${name} is not a localhost connection`);
    }
  }
}

function assertTemporaryDirectory(outDir) {
  const target = resolve(outDir);
  const approvedRoots = [resolve(os.tmpdir()), resolve("C:\\tmp")];
  if (!approvedRoots.some((root) => target !== root && target.startsWith(`${root}${sep}`))) {
    fail("out-dir must be a child of the operating system temporary directory");
  }
  if (target.includes(productionProjectRef)) fail("out-dir must not contain the production project ref");
  return target;
}

function sourceSortKey(name) {
  if (name === "20260407_green_observations.sql") return [20260407, 1, name];
  if (name === "20260407_green_area_path.sql") return [20260407, 2, name];
  if (name === "20260407_hole_observations.sql") return [20260407, 3, name];
  if (name === "20260626_pro_shop_scheduler.sql") return [20260626, 1, name];
  if (name === "20260626_pro_shop_flex.sql") return [20260626, 2, name];
  if (name === "20260608_pr_audit.sql") return [20260608, 1, name];
  if (name === "20260608_pr_audit_codes.sql") return [20260608, 2, name];
  if (name === "20260608_pr_audit_lifecycle.sql") return [20260608, 3, name];
  if (name === "20260608_pr_audit_monthly_budget.sql") return [20260608, 4, name];
  if (name === "20260701_my_day_recurrence.sql") return [20260701, 1, name];
  if (name === "20260701_daily_goal_anchor.sql") return [20260701, 2, name];
  const match = /^(\d{14}|\d{8}|\d{3})/.exec(name);
  if (!match) return [99999999, 0, name];
  const value = match[1].length === 3 ? 20000101 : Number(match[1].slice(0, 8));
  return [value, 10, name];
}

function fixtureName(sourceName, counts) {
  if (/^\d{14}_/.test(sourceName)) return sourceName;
  const [date] = sourceSortKey(sourceName);
  const current = (counts.get(date) ?? 0) + 1;
  counts.set(date, current);
  const version = `${date}${String(current).padStart(6, "0")}`;
  const suffix = sourceName.replace(/^\d+[a-z]?_/, "");
  return `${version}_${suffix}`;
}

function sourceFiles() {
  return readdirSync(sourceMigrations)
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => {
      const [leftDate, leftOrder, leftName] = sourceSortKey(left);
      const [rightDate, rightOrder, rightName] = sourceSortKey(right);
      return leftDate - rightDate || leftOrder - rightOrder || leftName.localeCompare(rightName);
    });
}

function writeConfig(targetSupabase) {
  const config = readFileSync(sourceConfig, "utf8")
    .replace(/^project_id\s*=.*$/m, 'project_id = "greenkeeper-pro-phase1a-matrix"');
  if (config.includes(productionProjectRef)) fail("source local configuration references production");
  writeFileSync(join(targetSupabase, "config.toml"), config, "utf8");
}

function sourceSqlForFixture(sourceName) {
  const source = readFileSync(join(sourceMigrations, sourceName), "utf8");
  if (sourceName === "20260419_seed_sops_knowledge_articles.sql") {
    return {
      source: "-- Local fixture omission: this content-only seed references a production profile UUID.\n-- Empty local auth fixtures must not fabricate employees.\n",
      transforms: ["omitted historical SOP content seed that references an unavailable production identity"],
    };
  }
  if (sourceName !== "20260419_add_pin_codes.sql") return { source, transforms: [] };

  const pinSeed = /-- ={60,}\r?\n-- Seed PINs for existing crew members\r?\n-- ={60,}\r?\nINSERT INTO pin_codes[\s\S]*?ON CONFLICT \(user_id\) DO NOTHING;\r?\n?/;
  if (!pinSeed.test(source)) {
    fail("could not locate the historical pin seed block for local omission");
  }
  return {
    source: source.replace(
      pinSeed,
      "-- Local fixture omission: this historical seed references four production user UUIDs.\n-- Empty local auth fixtures must not fabricate employees or PINs.\n",
    ),
    transforms: ["omitted historical PIN seed that references unavailable production identities"],
  };
}

function copySourceMigration(sourceName, target) {
  const { source, transforms } = sourceSqlForFixture(sourceName);
  if (transforms.length === 0) {
    copyFileSync(join(sourceMigrations, sourceName), target);
  } else {
    writeFileSync(target, source, "utf8");
  }
  return transforms;
}

function createFixture(outDir, mode) {
  if (!existsSync(sourceConfig)) fail("repository local Supabase config is missing");
  if (!existsSync(localBootstrap)) fail("repository local historical bootstrap is missing");
  if (!["pre-corrective", "all", "focused-pre-corrective", "foundational-compat", "production-shaped"].includes(mode)) {
    fail("mode must be pre-corrective, all, focused-pre-corrective, foundational-compat, or production-shaped");
  }
  const targetSupabase = join(outDir, "supabase");
  const targetMigrations = join(targetSupabase, "migrations");
  if (existsSync(targetMigrations) && readdirSync(targetMigrations).length > 0) {
    fail("out-dir already contains a fixture; use a new temporary directory");
  }
  mkdirSync(targetMigrations, { recursive: true });
  writeConfig(targetSupabase);

  const counts = new Map();
  const manifest = [];
  if (mode !== "focused-pre-corrective") {
    manifest.push({
      sourceName: null,
      targetName: updatedAtCompatibilityMigration,
      included: true,
      reason: "temporary compatibility for pre-existing historical trigger ordering defect",
    });
    writeFileSync(join(targetMigrations, updatedAtCompatibilityMigration), updatedAtCompatibilitySql, "utf8");
    manifest.push({
      sourceName: "supabase/local-bootstrap/20260406000001_historical_foundations.sql",
      targetName: localBootstrapMigration,
      included: true,
      reason: "temporary local reconstruction of missing historical foundational tables",
    });
    copyFileSync(localBootstrap, join(targetMigrations, localBootstrapMigration));
  }
  const fixtureSources = mode === "focused-pre-corrective"
    ? sourceFiles().filter((sourceName) => focusedPreCorrectiveSources.has(sourceName))
    : mode === "foundational-compat"
      ? sourceFiles().filter((sourceName) => foundationalSources.has(sourceName))
      : sourceFiles();
  for (const sourceName of fixtureSources) {
    const targetName = fixtureName(sourceName, counts);
    const preexistingGreen = mode === "production-shaped" && sourceName === "20260407_green_observations.sql";
    const included = !preexistingGreen && (mode === "all" || mode === "production-shaped" || mode === "foundational-compat" || sourceName !== correctiveMigration);
    const transforms = included
      ? copySourceMigration(sourceName, join(targetMigrations, targetName))
      : [];
    manifest.push({
      sourceName,
      targetName,
      included,
      ...(preexistingGreen ? { reason: "local compatibility fixture pre-creates the production-shaped green_observations table" } : {}),
      ...(transforms.length > 0 ? { transforms } : {}),
    });
  }
  writeFileSync(join(outDir, "phase1a-fixture-manifest.json"), `${JSON.stringify({ mode, manifest }, null, 2)}\n`, "utf8");
  return { targetMigrations, manifest };
}

function appendCorrective(outDir) {
  const manifestPath = join(outDir, "phase1a-fixture-manifest.json");
  if (!existsSync(manifestPath)) fail("fixture manifest is missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let entry = manifest.manifest.find((item) => item.sourceName === correctiveMigration);
  if (!entry) {
    entry = { sourceName: correctiveMigration, targetName: correctiveMigration, included: false };
    manifest.manifest.push(entry);
  }
  const target = join(outDir, "supabase", "migrations", entry.targetName);
  if (existsSync(target)) fail("corrective migration is already present in fixture");
  copyFileSync(join(sourceMigrations, correctiveMigration), target);
  entry.included = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return entry.targetName;
}

function main() {
  assertLocalOnlyEnvironment();
  if (process.argv.slice(2).includes("--help")) {
    console.log("Usage: node scripts/prepare-phase1a-local-fixture.mjs <create|append-corrective> --out-dir <temporary-directory> [--mode pre-corrective|all|focused-pre-corrective|foundational-compat|production-shaped]");
    return;
  }
  const { command, options } = parseArgs(process.argv.slice(2));
  const outDir = assertTemporaryDirectory(options["out-dir"]);
  if (command === "create") {
    const result = createFixture(outDir, options.mode);
    console.log(JSON.stringify({ outDir, migrations: result.manifest.filter((entry) => entry.included).length }, null, 2));
    return;
  }
  if (command === "append-corrective") {
    const targetName = appendCorrective(outDir);
    console.log(JSON.stringify({ outDir, appended: targetName }, null, 2));
    return;
  }
  fail("use create or append-corrective");
}

main();
