#!/usr/bin/env node

/**
 * Seeds and verifies a representative pre-corrective Phase 1A baseline in an
 * unlinked local Supabase fixture. It is intentionally unable to use a hosted
 * URL or the production project ref. The fixture data is disposable and lives
 * only in the local Docker volume selected by --workdir.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const productionProjectRef = "mbgublyqnyghmvqfooao";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const prefix = "Phase1A pre-corrective preservation";

function fail(message) {
  throw new Error(`Phase 1A local preservation fixture refused: ${message}`);
}

function assertLocalOnlyEnvironment() {
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/(SUPABASE|PROJECT_REF|DATABASE_URL)/i.test(name)) continue;
    if (value.includes(productionProjectRef)) fail(`${name} references the production project`);
    if (!/^(https?|postgres(?:ql)?):\/\//i.test(value)) continue;
    let host;
    try {
      host = new URL(value).hostname;
    } catch {
      fail(`${name} is not a valid local connection URL`);
    }
    if (!localHosts.has(host)) fail(`${name} is not a localhost connection`);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== "--workdir") fail(`unexpected argument ${rest[index]}`);
    options.workdir = rest[index + 1];
    index += 1;
  }
  if (!options.workdir) fail("--workdir is required");
  return { command, workdir: options.workdir };
}

function localStatus(workdir) {
  const config = readFileSync(`${workdir}/supabase/config.toml`, "utf8");
  if (config.includes(productionProjectRef)) fail("fixture configuration references production");
  const raw = execFileSync("supabase", ["--workdir", workdir, "status", "--output", "json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) fail("local status did not return JSON");
  const status = JSON.parse(raw.slice(start, end + 1));
  for (const value of [status.API_URL, status.DB_URL, status.FUNCTIONS_URL]) {
    if (typeof value !== "string" || value.includes(productionProjectRef)) fail("local status references production");
    const host = new URL(value).hostname;
    if (!localHosts.has(host)) fail(`local status returned non-local host ${host}`);
  }
  if (!status.SERVICE_ROLE_KEY) fail("local status did not provide a service role key");
  return status;
}

function adminClient(status) {
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function expectData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createActor(admin, label, role) {
  const email = `${label.toLowerCase().replaceAll(" ", "-")}@phase1a.local`;
  const created = expectData(await admin.auth.admin.createUser({
    email,
    password: "Local-only-Phase1A!42",
    email_confirm: true,
  }), `create ${label} auth user`);
  const profile = {
    id: created.user.id,
    email,
    full_name: label,
    display_name: label,
    role,
    is_active: true,
    department: role === "director" ? "administration" : "maintenance",
    role_group: role === "director" ? "general_manager" : "maintenance_staff",
  };
  expectData(await admin.from("profiles").upsert(profile), `create ${label} profile`);
  return profile;
}

async function seed(workdir) {
  const admin = adminClient(localStatus(workdir));
  const existing = expectData(await admin.from("operation_duties").select("id").eq("title", `${prefix} duty`));
  if (existing.length > 0) fail("fixture data already exists; reset the local fixture before seeding");

  const manager = await createActor(admin, `${prefix} manager`, "director");
  const foreman = await createActor(admin, `${prefix} foreman`, "foreman");
  const employee = await createActor(admin, `${prefix} employee`, "crew");
  const backup = await createActor(admin, `${prefix} backup`, "crew");

  const vendor = expectData(await admin.from("vendors").insert({
    name: `${prefix} contractor`,
    category: "general",
    created_by: manager.id,
  }).select("id").single(), "create contractor");
  const roster = expectData(await admin.from("pro_shop_staff").insert({
    full_name: `${prefix} roster`,
    position: "rec_aid",
    default_group: "outside",
  }).select("id").single(), "create legacy roster record");
  const legacyDuty = expectData(await admin.from("pro_shop_duties").insert({
    title: `${prefix} legacy duty`,
    area: "outside",
    days: ["mon"],
    created_by: manager.id,
  }).select("id").single(), "create legacy duty");
  const duty = expectData(await admin.from("operation_duties").insert({
    title: `${prefix} duty`,
    area: "course",
    department: "maintenance",
    role_group: "maintenance_staff",
    days: ["mon", "wed"],
    season: "year_round",
    cadence: "weekly",
    recurrence_rule: { cadence: "weekly", interval: 1, weekdays: ["mon", "wed"] },
    estimated_minutes: null,
    instructions: "Recorded pre-corrective local fixture instruction.",
    equipment_needed: [],
    evidence_requirements: [],
    manager_verification_required: false,
    task_category: "other",
    priority: "normal",
    active_from: "2026-07-13",
    active_through: null,
    is_active: true,
    sort_order: 991,
  }).select("id").single(), "create existing duty");
  const assignment = expectData(await admin.from("duty_assignments").insert({
    duty_id: duty.id,
    assignee_type: "employee",
    primary_profile_id: employee.id,
    backup_profile_id: backup.id,
    contractor_vendor_id: null,
    effective_from: "2026-07-13",
    effective_through: null,
    change_reason: "Recorded pre-corrective primary and backup ownership",
    assigned_by: manager.id,
  }).select("id").single(), "create existing assignment");
  expectData(await admin.from("duty_completions").insert({
    duty_id: duty.id,
    duty_date: "2026-07-13",
    completed_by: employee.id,
  }), "create legacy completion history");
  expectData(await admin.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-20",
  }), "materialize existing occurrences");
  const occurrences = expectData(await admin.from("tasks")
    .select("id,original_due_date")
    .eq("duty_id", duty.id)
    .order("original_due_date"), "load existing occurrences");
  assert.ok(occurrences.length >= 2, "pre-corrective duty must have multiple occurrences");
  expectData(await admin.from("tasks").update({
    status: "completed",
    completed_at: "2026-07-13T12:00:00Z",
    completed_by: employee.id,
  }).eq("id", occurrences[0].id), "preserve completed occurrence");
  expectData(await admin.from("tasks").update({
    status: "verified",
    completed_at: "2026-07-14T12:00:00Z",
    completed_by: employee.id,
    verified_at: "2026-07-14T13:00:00Z",
    verified_by: manager.id,
  }).eq("id", occurrences[1].id), "preserve verified occurrence");

  console.log(JSON.stringify({
    seeded: true,
    dutyId: duty.id,
    assignmentId: assignment.id,
    legacyDutyId: legacyDuty.id,
    rosterId: roster.id,
    managerId: manager.id,
    foremanId: foreman.id,
    contractorId: vendor.id,
  }));
}

async function verify(workdir) {
  const admin = adminClient(localStatus(workdir));
  const duty = expectData(await admin.from("operation_duties")
    .select("id,evidence_requirement_state,verification_requirement_state,equipment_requirement_state")
    .eq("title", `${prefix} duty`).single(), "load preserved duty");
  assert.equal(duty.evidence_requirement_state, "not_recorded");
  assert.equal(duty.verification_requirement_state, "not_recorded");
  assert.equal(duty.equipment_requirement_state, "not_recorded");
  const assignment = expectData(await admin.from("duty_assignments")
    .select("primary_profile_id,backup_profile_id,assignee_type")
    .eq("duty_id", duty.id).single(), "load preserved assignment");
  assert.equal(assignment.assignee_type, "employee");
  assert.ok(assignment.primary_profile_id);
  assert.ok(assignment.backup_profile_id);
  const statuses = expectData(await admin.from("tasks").select("status")
    .eq("duty_id", duty.id), "load preserved occurrences");
  assert.ok(statuses.some((task) => task.status === "completed"));
  assert.ok(statuses.some((task) => task.status === "verified"));
  const legacy = expectData(await admin.from("pro_shop_duties").select("id")
    .eq("title", `${prefix} legacy duty`).single(), "load preserved legacy duty");
  assert.ok(legacy.id);
  const completions = expectData(await admin.from("duty_completions").select("id")
    .eq("duty_id", duty.id), "load preserved legacy completion history");
  assert.equal(completions.length, 1);
  console.log("phase1a pre-corrective preservation verified");
}

assertLocalOnlyEnvironment();

const { command, workdir } = parseArgs(process.argv.slice(2));
if (command === "seed") await seed(workdir);
else if (command === "verify") await verify(workdir);
else fail("use seed or verify");
