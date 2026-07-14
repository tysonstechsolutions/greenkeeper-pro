#!/usr/bin/env node

/**
 * Read-only production evidence capture for the Phase 1A daily-operations
 * migration. It deliberately requires the direct production database URL in
 * PHASE1A_PRODUCTION_DB_URL and refuses every project ref other than the
 * approved production project. It never prints the connection string.
 *
 * Examples:
 *   node scripts/phase1a-production-evidence.mjs before --project-ref mbgublyqnyghmvqfooao
 *   node scripts/phase1a-production-evidence.mjs after --project-ref mbgublyqnyghmvqfooao
 *   node scripts/phase1a-production-evidence.mjs compare --before C:\tmp\before.json --after C:\tmp\after.json
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPECTED_PROJECT_REF = "mbgublyqnyghmvqfooao";
const EXPECTED_MIGRATION_VERSION = "20260713230000";
const EXPECTED_MIGRATION_FILE = "20260713230000_daily_operations_phase1a_corrective.sql";
const DEFAULT_OUTPUT_DIR = path.join(os.tmpdir(), "greenkeeper-pro-phase1a-evidence");

const AFFECTED_TABLES = [
  "profiles",
  "operation_duties",
  "duty_assignments",
  "duty_audit_events",
  "duty_recurrence_versions",
  "duty_temporary_coverages",
  "task_evidence_items",
  "task_series",
  "tasks",
  "pro_shop_duties",
  "pro_shop_staff",
];

const REQUIRED_TABLES = [
  "duty_audit_events",
  "duty_recurrence_versions",
  "duty_temporary_coverages",
  "task_evidence_items",
];

const REQUIRED_FUNCTIONS = [
  "can_manage_daily_operations",
  "can_manage_tasks",
  "is_active_foreman",
  "materialize_duty_occurrences",
  "save_operation_duty",
  "set_duty_assignment",
  "reassign_active_duties",
  "set_temporary_duty_coverage",
  "change_future_duty_recurrence",
  "move_duty_occurrence",
  "transition_task_status",
  "record_task_evidence",
];

const REQUIRED_TRIGGERS = ["trg_operation_duty_series", "trg_guard_task_mutation"];
const REQUIRED_INDEXES = [
  "idx_tasks_duty_owner_date",
  "idx_tasks_duty_contractor_date",
  "idx_duty_audit_events_duty",
  "idx_duty_recurrence_versions_lookup",
  "idx_duty_temporary_coverages_lookup",
  "idx_task_evidence_items_task",
];
const REQUIRED_CONSTRAINTS = [
  "duty_assignments_no_overlap",
  "duty_recurrence_versions_no_overlap",
  "duty_temporary_coverages_no_overlap",
];
const REQUIRED_TASK_POLICIES = [
  "tasks_select_authorized",
  "tasks_insert_supervisor",
  "tasks_update_authorized",
  "tasks_delete_manager",
];

function fail(message) {
  throw new Error(`Phase 1A production evidence stopped: ${message}`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) fail(`Unexpected argument "${item}".`);
    const key = item.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) fail(`"${item}" requires a value.`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function assertExpectedProjectRef(projectRef) {
  if (projectRef !== EXPECTED_PROJECT_REF) {
    fail(`Project ref must be ${EXPECTED_PROJECT_REF}; received ${projectRef || "nothing"}.`);
  }
}

function assertDirectDatabaseUrl(databaseUrl, projectRef) {
  if (!databaseUrl) {
    fail("PHASE1A_PRODUCTION_DB_URL is required and is never written to the report.");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("PHASE1A_PRODUCTION_DB_URL is not a valid database URL.");
  }
  const expectedHost = `db.${projectRef}.supabase.co`;
  if (parsed.hostname !== expectedHost) {
    fail(`The database host must be ${expectedHost}; pooler and unknown hosts are refused for target safety.`);
  }
}

function runCommand(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env, windowsHide: true });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    if (command === "psql") {
      fail(
        "Read-only database evidence query failed. Verify the approved direct database connection and retry; no database change was made.",
      );
    }

    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(`${command} failed${detail ? `: ${detail}` : "."}`);
  }
  return result.stdout;
}

function assertProjectIsAccessible(projectRef) {
  let raw;
  try {
    raw = execFileSync("supabase", ["projects", "list", "--output", "json"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail("Could not list Supabase projects. Authenticate the Supabase CLI before collecting evidence.");
  }

  let projects;
  try {
    projects = JSON.parse(raw);
  } catch {
    fail("Supabase projects list did not return JSON; update the Supabase CLI before collecting evidence.");
  }
  const entries = Array.isArray(projects) ? projects : projects.projects;
  if (
    !Array.isArray(entries) ||
    !entries.some((project) => (project.id ?? project.ref) === projectRef)
  ) {
    fail(`The authenticated Supabase account cannot confirm project ${projectRef}.`);
  }
}

function queryJson(databaseUrl, sql) {
  const transaction = [
    "BEGIN TRANSACTION READ ONLY;",
    "SET LOCAL statement_timeout = '30s';",
    sql,
    "COMMIT;",
  ].join("\n");
  const output = runCommand(
    "psql",
    ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1", "-c", transaction],
    { ...process.env, PGDATABASE: databaseUrl, PGCONNECT_TIMEOUT: "10" },
  ).trim();
  try {
    return JSON.parse(output);
  } catch {
    fail("A read-only evidence query returned an unexpected response.");
  }
}

function identifiers(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

function sqlArray(values) {
  return `ARRAY[${identifiers(values)}]`;
}

function relationExists(databaseUrl, tableName) {
  return queryJson(databaseUrl, `SELECT to_regclass('public.${tableName}') IS NOT NULL;`);
}

function countTable(databaseUrl, tableName) {
  if (!relationExists(databaseUrl, tableName)) return { exists: false, count: null };
  return { exists: true, count: queryJson(databaseUrl, `SELECT COUNT(*)::bigint FROM public.${tableName};`) };
}

function includesAll(haystack, needles) {
  const values = new Set(haystack.map((item) => item.name));
  return needles.filter((needle) => !values.has(needle));
}

function exactMigrationCount(ledger) {
  return ledger.filter((entry) => String(entry.version) === EXPECTED_MIGRATION_VERSION).length;
}

function taskPoliciesAreLeastPrivilege(policies) {
  const names = policies.map((policy) => policy.name).sort();
  const expected = [...REQUIRED_TASK_POLICIES].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) return false;
  return policies.every((policy) => {
    const expressions = [policy.using, policy.withCheck].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    return !expressions.some((value) => value === "true" || value === "(true)");
  });
}

function evaluateAfterSnapshot(snapshot) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  const objectNames = snapshot.objects;
  add(
    "expected migration recorded once",
    exactMigrationCount(snapshot.ledger) === 1,
    `found ${exactMigrationCount(snapshot.ledger)} ledger row(s) for ${EXPECTED_MIGRATION_VERSION}`,
  );
  add("new Phase 1A tables exist", includesAll(objectNames.tables, REQUIRED_TABLES).length === 0,
    `missing: ${includesAll(objectNames.tables, REQUIRED_TABLES).join(", ") || "none"}`);
  add("required functions exist", includesAll(objectNames.functions, REQUIRED_FUNCTIONS).length === 0,
    `missing: ${includesAll(objectNames.functions, REQUIRED_FUNCTIONS).join(", ") || "none"}`);
  add("required triggers exist", includesAll(objectNames.triggers, REQUIRED_TRIGGERS).length === 0,
    `missing: ${includesAll(objectNames.triggers, REQUIRED_TRIGGERS).join(", ") || "none"}`);
  add("required indexes exist", includesAll(objectNames.indexes, REQUIRED_INDEXES).length === 0,
    `missing: ${includesAll(objectNames.indexes, REQUIRED_INDEXES).join(", ") || "none"}`);
  add("required constraints exist", includesAll(objectNames.constraints, REQUIRED_CONSTRAINTS).length === 0,
    `missing: ${includesAll(objectNames.constraints, REQUIRED_CONSTRAINTS).join(", ") || "none"}`);
  add("no anonymous access on affected objects", snapshot.security.anonymousAccess.length === 0,
    `${snapshot.security.anonymousAccess.length} affected anonymous grant or policy row(s)`);
  add("tasks policies are least-privilege", taskPoliciesAreLeastPrivilege(snapshot.security.taskPolicies),
    `${snapshot.security.taskPolicies.length} task policy row(s) captured`);
  add("legacy pro_shop_duties has no authenticated writer", snapshot.security.legacyWritable.length === 0,
    `${snapshot.security.legacyWritable.length} writable legacy grant or policy row(s)`);
  add("assignment ranges do not overlap", snapshot.integrity.assignmentOverlaps === 0,
    `${snapshot.integrity.assignmentOverlaps} overlapping assignment pair(s)`);
  add("temporary coverage ranges do not overlap", snapshot.integrity.coverageOverlaps === 0,
    `${snapshot.integrity.coverageOverlaps} overlapping coverage pair(s)`);
  add("duty occurrences have no duplicate identity", snapshot.integrity.duplicateOccurrenceKeys === 0,
    `${snapshot.integrity.duplicateOccurrenceKeys} duplicate occurrence key group(s)`);
  return checks;
}

function captureSnapshot(phase, projectRef, databaseUrl) {
  assertProjectIsAccessible(projectRef);
  const tableCounts = Object.fromEntries(AFFECTED_TABLES.map((table) => [table, countTable(databaseUrl, table)]));
  const relationsPresent = Object.fromEntries(AFFECTED_TABLES.map((table) => [table, tableCounts[table].exists]));
  const has = (...tables) => tables.every((table) => relationsPresent[table]);

  const ledger = queryJson(databaseUrl, `
    SELECT COALESCE(json_agg(json_build_object('version', version, 'name', name) ORDER BY version), '[]'::json)
    FROM supabase_migrations.schema_migrations;
  `);
  const objects = {
    tables: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'name', c.relname, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity
      ) ORDER BY c.relname), '[]'::json)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY(${sqlArray(AFFECTED_TABLES)});
    `),
    columns: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'table', table_name, 'column', column_name, 'type', data_type,
        'nullable', is_nullable, 'default', column_default
      ) ORDER BY table_name, ordinal_position), '[]'::json)
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${sqlArray(AFFECTED_TABLES)});
    `),
    functions: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'name', p.proname, 'signature', p.oid::regprocedure::text,
        'securityDefiner', p.prosecdef, 'config', COALESCE(p.proconfig, ARRAY[]::text[])
      ) ORDER BY p.proname, p.oid::regprocedure::text), '[]'::json)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY(${sqlArray(REQUIRED_FUNCTIONS)});
    `),
    triggers: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('name', t.tgname, 'table', c.relname, 'definition', pg_get_triggerdef(t.oid)) ORDER BY t.tgname), '[]'::json)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = 'public' AND t.tgname = ANY(${sqlArray(REQUIRED_TRIGGERS)});
    `),
    indexes: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('name', indexname, 'table', tablename, 'definition', indexdef) ORDER BY indexname), '[]'::json)
      FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(${sqlArray(REQUIRED_INDEXES)});
    `),
    constraints: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('name', conname, 'table', rel.relname, 'definition', pg_get_constraintdef(con.oid)) ORDER BY conname), '[]'::json)
      FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public' AND con.conname = ANY(${sqlArray(REQUIRED_CONSTRAINTS)});
    `),
    dutyViews: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('name', table_name, 'definition', view_definition) ORDER BY table_name), '[]'::json)
      FROM information_schema.views WHERE table_schema = 'public' AND table_name ILIKE '%duty%';
    `),
  };

  const security = {
    rlsPolicies: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'table', tablename, 'name', policyname, 'command', cmd,
        'roles', roles, 'using', qual, 'withCheck', with_check
      ) ORDER BY tablename, policyname), '[]'::json)
      FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY(${sqlArray(AFFECTED_TABLES)});
    `),
    taskPolicies: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'withCheck', with_check
      ) ORDER BY policyname), '[]'::json)
      FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks';
    `),
    tableGrants: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'table', table_name, 'grantee', grantee, 'privilege', privilege_type
      ) ORDER BY table_name, grantee, privilege_type), '[]'::json)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = ANY(${sqlArray(AFFECTED_TABLES)});
    `),
    functionGrants: queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object(
        'function', routine_name, 'grantee', grantee, 'privilege', privilege_type
      ) ORDER BY routine_name, grantee, privilege_type), '[]'::json)
      FROM information_schema.routine_privileges
      WHERE specific_schema = 'public' AND routine_name = ANY(${sqlArray(REQUIRED_FUNCTIONS)});
    `),
    anonymousAccess: [],
    legacyWritable: [],
  };
  security.anonymousAccess = [
    ...security.tableGrants.filter((grant) => grant.grantee === 'anon'),
    ...security.functionGrants.filter((grant) => grant.grantee === 'anon'),
    ...security.rlsPolicies.filter((policy) => Array.isArray(policy.roles) && policy.roles.includes('anon')),
  ];
  security.legacyWritable = [
    ...security.tableGrants.filter((grant) => grant.table === 'pro_shop_duties'
      && grant.grantee === 'authenticated' && ['INSERT', 'UPDATE', 'DELETE'].includes(grant.privilege)),
    ...security.rlsPolicies.filter((policy) => policy.table === 'pro_shop_duties'
      && ['ALL', 'INSERT', 'UPDATE', 'DELETE'].includes(policy.command)),
  ];

  const integrity = {
    activeDutiesWithoutCurrentAssignment: null,
    assignmentOverlaps: null,
    coverageOverlaps: null,
    duplicateOccurrenceKeys: null,
    movedOccurrences: null,
    occurrenceStatusBreakdown: [],
    protectedHistoryByStatus: [],
  };
  if (has('operation_duties', 'duty_assignments')) {
    integrity.activeDutiesWithoutCurrentAssignment = queryJson(databaseUrl, `
      SELECT COUNT(*)::bigint FROM public.operation_duties d
      WHERE d.is_active = TRUE AND NOT EXISTS (
        SELECT 1 FROM public.duty_assignments a
        WHERE a.duty_id = d.id AND a.effective_from <= CURRENT_DATE
          AND (a.effective_through IS NULL OR a.effective_through >= CURRENT_DATE)
      );
    `);
    integrity.assignmentOverlaps = queryJson(databaseUrl, `
      SELECT COUNT(*)::bigint FROM public.duty_assignments a
      JOIN public.duty_assignments b ON a.duty_id = b.duty_id AND a.id < b.id
        AND daterange(a.effective_from, COALESCE(a.effective_through, 'infinity'::date), '[]')
          && daterange(b.effective_from, COALESCE(b.effective_through, 'infinity'::date), '[]');
    `);
  }
  if (has('duty_temporary_coverages')) {
    integrity.coverageOverlaps = queryJson(databaseUrl, `
      SELECT COUNT(*)::bigint FROM public.duty_temporary_coverages a
      JOIN public.duty_temporary_coverages b ON a.duty_id = b.duty_id AND a.id < b.id
        AND daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');
    `);
  }
  if (has('tasks')) {
    integrity.duplicateOccurrenceKeys = queryJson(databaseUrl, `
      SELECT COUNT(*)::bigint FROM (
        SELECT series_id, occurrence_key FROM public.tasks
        WHERE series_id IS NOT NULL AND occurrence_key IS NOT NULL
        GROUP BY series_id, occurrence_key HAVING COUNT(*) > 1
      ) duplicate_keys;
    `);
    integrity.movedOccurrences = queryJson(databaseUrl, `
      SELECT COUNT(*)::bigint FROM public.tasks
      WHERE duty_id IS NOT NULL AND due_date IS DISTINCT FROM original_due_date;
    `);
    integrity.occurrenceStatusBreakdown = queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('status', status, 'count', count) ORDER BY status), '[]'::json)
      FROM (
        SELECT status, COUNT(*)::bigint AS count FROM public.tasks
        WHERE duty_id IS NOT NULL GROUP BY status
      ) counts;
    `);
    integrity.protectedHistoryByStatus = queryJson(databaseUrl, `
      SELECT COALESCE(json_agg(json_build_object('status', status, 'count', count) ORDER BY status), '[]'::json)
      FROM (
        SELECT status, COUNT(*)::bigint AS count FROM public.tasks
        WHERE status IN ('completed', 'verified') GROUP BY status
      ) counts;
    `);
  }

  const snapshot = {
    format: 1,
    phase,
    capturedAt: new Date().toISOString(),
    projectRef,
    expectedMigration: { version: EXPECTED_MIGRATION_VERSION, file: EXPECTED_MIGRATION_FILE },
    connection: queryJson(databaseUrl, `
      SELECT json_build_object(
        'database', current_database(),
        'currentUser', current_user,
        'transactionReadOnly', current_setting('transaction_read_only')
      );
    `),
    ledger,
    tableCounts,
    objects,
    security,
    integrity,
  };
  snapshot.checks = phase === 'after' ? evaluateAfterSnapshot(snapshot) : [];
  return snapshot;
}

function valueByStatus(rows, status) {
  return Number(rows.find((row) => row.status === status)?.count ?? 0);
}

function compareSnapshots(before, after) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  add("same approved production project", before.projectRef === EXPECTED_PROJECT_REF && after.projectRef === EXPECTED_PROJECT_REF,
    `${before.projectRef} -> ${after.projectRef}`);
  add("migration absent before application", exactMigrationCount(before.ledger) === 0,
    `found ${exactMigrationCount(before.ledger)} ledger row(s) before`);
  add("migration present exactly once after application", exactMigrationCount(after.ledger) === 1,
    `found ${exactMigrationCount(after.ledger)} ledger row(s) after`);
  for (const status of ["completed", "verified"]) {
    const beforeCount = valueByStatus(before.integrity.protectedHistoryByStatus, status);
    const afterCount = valueByStatus(after.integrity.protectedHistoryByStatus, status);
    add(`${status} history did not decline`, afterCount >= beforeCount, `${beforeCount} -> ${afterCount}`);
  }
  for (const check of after.checks ?? []) add(`after: ${check.name}`, check.pass, check.detail);
  return checks;
}

function markdownReport(title, report) {
  const checks = report.checks ?? [];
  const checkLines = checks.length
    ? checks.map((check) => `| ${check.pass ? "PASS" : "FAIL"} | ${check.name} | ${check.detail} |`).join("\n")
    : "| INFO | Capture completed | See JSON companion for complete read-only evidence. |";
  return [
    `# ${title}`,
    "",
    `- Captured: ${report.capturedAt ?? new Date().toISOString()}`,
    `- Production project ref: ${report.projectRef ?? EXPECTED_PROJECT_REF}`,
    `- Expected migration: ${EXPECTED_MIGRATION_FILE}`,
    "- Connection strings and credentials are intentionally excluded.",
    "",
    "## Checks",
    "",
    "| Result | Check | Detail |",
    "| --- | --- | --- |",
    checkLines,
    "",
    "## Snapshot summary",
    "",
    "```json",
    JSON.stringify({
      phase: report.phase,
      tableCounts: report.tableCounts,
      integrity: report.integrity,
    }, null, 2),
    "```",
    "",
    "The JSON companion contains the full migration ledger, schema, policy, grant, and object evidence.",
    "",
  ].join("\n");
}

function writeReport(outputDir, stem, report, title) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${stem}.json`);
  const markdownPath = path.join(outputDir, `${stem}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, markdownReport(title, report), "utf8");
  console.log(`Phase 1A read-only evidence written to:\n${markdownPath}\n${jsonPath}`);
}

function runSelfTest() {
  assert.deepEqual(parseArgs(["before", "--project-ref", EXPECTED_PROJECT_REF]).options, { "project-ref": EXPECTED_PROJECT_REF });
  assert.doesNotThrow(() => assertExpectedProjectRef(EXPECTED_PROJECT_REF));
  assert.throws(() => assertExpectedProjectRef("not-production"), /must be/);
  assert.doesNotThrow(() => assertDirectDatabaseUrl(`postgresql://postgres:secret@db.${EXPECTED_PROJECT_REF}.supabase.co:5432/postgres`, EXPECTED_PROJECT_REF));
  assert.throws(
    () => assertDirectDatabaseUrl("postgresql://postgres:secret@db.other-project.supabase.co:5432/postgres", EXPECTED_PROJECT_REF),
    /must be/,
  );
  assert.equal(taskPoliciesAreLeastPrivilege([
    { name: "tasks_select_authorized", using: "(assigned_to = auth.uid())", withCheck: null },
    { name: "tasks_insert_supervisor", using: null, withCheck: "(assigned_by = auth.uid())" },
    { name: "tasks_update_authorized", using: "(assigned_to = auth.uid())", withCheck: "(assigned_to = auth.uid())" },
    { name: "tasks_delete_manager", using: "can_manage_tasks()", withCheck: null },
  ]), true);
  assert.equal(taskPoliciesAreLeastPrivilege([{ name: "tasks_select_authorized", using: "true", withCheck: null }]), false);
  console.log("phase1a-production-evidence self-test passed");
}

function main() {
  if (process.argv.slice(2).includes("--self-test")) return runSelfTest();
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!["before", "after", "compare"].includes(command)) {
    fail("Use before, after, or compare.");
  }
  const outputDir = options["out-dir"] ?? DEFAULT_OUTPUT_DIR;
  if (command === "compare") {
    if (!options.before || !options.after) fail("compare requires --before <snapshot.json> and --after <snapshot.json>.");
    if (!existsSync(options.before) || !existsSync(options.after)) fail("Both comparison snapshot files must exist.");
    const before = JSON.parse(readFileSync(options.before, "utf8"));
    const after = JSON.parse(readFileSync(options.after, "utf8"));
    const comparison = {
      format: 1,
      phase: "compare",
      capturedAt: new Date().toISOString(),
      projectRef: after.projectRef,
      before: path.resolve(options.before),
      after: path.resolve(options.after),
      checks: compareSnapshots(before, after),
    };
    const stamp = comparison.capturedAt.replaceAll(":", "-").replaceAll(".", "-");
    writeReport(outputDir, `phase1a-production-comparison-${stamp}`, comparison, "Phase 1A production evidence comparison");
    if (comparison.checks.some((check) => !check.pass)) process.exitCode = 1;
    return;
  }

  const projectRef = options["project-ref"];
  assertExpectedProjectRef(projectRef);
  const databaseUrl = process.env.PHASE1A_PRODUCTION_DB_URL;
  assertDirectDatabaseUrl(databaseUrl, projectRef);
  const snapshot = captureSnapshot(command, projectRef, databaseUrl);
  const stamp = snapshot.capturedAt.replaceAll(":", "-").replaceAll(".", "-");
  writeReport(outputDir, `phase1a-production-${command}-${stamp}`, snapshot, `Phase 1A production ${command} evidence`);
  if (snapshot.checks.some((check) => !check.pass)) process.exitCode = 1;
}

main();
