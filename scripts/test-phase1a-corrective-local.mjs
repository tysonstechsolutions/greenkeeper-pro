import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.PHASE1A_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.PHASE1A_LOCAL_SUPABASE_ANON_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const serviceKey = process.env.PHASE1A_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_PROJECT_REF = "mbgublyqnyghmvqfooao";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalOnlyEnvironment() {
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/(SUPABASE|PROJECT_REF|DATABASE_URL)/i.test(name)) continue;
    if (value.includes(PRODUCTION_PROJECT_REF)) {
      throw new Error(`Refusing local integration validation: ${name} references the production project.`);
    }
    if (!/^(https?|postgres(?:ql)?):\/\//i.test(value)) continue;
    let host;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`Refusing local integration validation: ${name} is not a valid local connection URL.`);
    }
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`Refusing local integration validation: ${name} is not a localhost connection.`);
    }
  }
}

assertLocalOnlyEnvironment();

if (!serviceKey) {
  throw new Error("PHASE1A_LOCAL_SUPABASE_SERVICE_ROLE_KEY is required for the disposable local integration database.");
}

const host = new URL(url).hostname;
if (!LOCAL_HOSTS.has(host) || url.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error(`Refusing to create integration fixtures outside localhost: ${host}`);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const prefix = `Phase1A test ${suffix}`;
const password = `Local-only-${suffix}!Aa1`;
const userIds = [];
let vendorId = null;
let rosterId = null;
let legacyDutyId = null;

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function expectData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function expectError(result, label) {
  assert.ok(result.error, `${label}: expected an error`);
  return result.error;
}

async function directRest(token, path, options = {}) {
  const headers = {
    apikey: anonKey,
    "Content-Type": "application/json",
    Prefer: options.prefer ?? "return=representation",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

async function createActor(name, role) {
  const actorKey = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `phase1a-${role}-${actorKey}-${suffix}@example.test`;
  const created = expectData(await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  }), `create ${role} auth user`);
  const id = created.user.id;
  userIds.push(id);
  expectData(await admin.from("profiles").upsert({
    id,
    email,
    full_name: name,
    role,
    is_active: true,
    department: role === "gm" ? "administration" : "maintenance",
    role_group: role === "gm" ? "general_manager" : "maintenance_staff",
  }), `create ${role} profile`);
  const signedInClient = client();
  const signedIn = expectData(await signedInClient.auth.signInWithPassword({ email, password }), `sign in ${role}`);
  assert.ok(signedIn.session?.access_token, `${role} session should have an access token`);
  return { id, api: signedInClient, token: signedIn.session.access_token };
}

function dutyPayload(title, overrides = {}) {
  return {
    title,
    area: "course",
    department: "maintenance",
    role_group: "maintenance_staff",
    days: ["mon"],
    season: "year_round",
    cadence: "weekly",
    recurrence_rule: { cadence: "weekly", interval: 1, weekdays: ["mon"] },
    estimated_minutes: null,
    instructions: null,
    equipment_needed: [],
    equipment_requirement_state: "not_recorded",
    required_document: null,
    standard_reference: null,
    evidence_requirements: [],
    evidence_requirement_state: "not_recorded",
    manager_verification_required: false,
    verification_requirement_state: "not_recorded",
    task_category: "grounds",
    priority: "normal",
    active_from: "2026-07-13",
    active_through: null,
    inactive_reason: null,
    seasonal_start_mmdd: null,
    seasonal_end_mmdd: null,
    legacy_source: null,
    legacy_source_id: null,
    note: null,
    is_active: true,
    sort_order: 10,
    ...overrides,
  };
}

async function saveDuty(manager, payload, ownership = {}) {
  return expectData(await manager.api.rpc("save_operation_duty", {
    p_duty_id: ownership.dutyId ?? null,
    p_duty: payload,
    p_primary_profile_id: ownership.primaryId ?? null,
    p_backup_profile_id: ownership.backupId ?? null,
    p_contractor_vendor_id: ownership.vendorId ?? null,
    p_assignment_effective_date: ownership.effectiveDate ?? "2026-07-13",
    p_assignment_reason: ownership.reason ?? "Local integration fixture ownership",
  }), `save ${payload.title}`);
}

async function cleanup() {
  await admin.from("tasks").delete().like("title", `${prefix}%`);
  await admin.from("operation_duties").delete().like("title", `${prefix}%`);
  if (legacyDutyId) await admin.from("pro_shop_duties").delete().eq("id", legacyDutyId);
  if (rosterId) await admin.from("pro_shop_staff").delete().eq("id", rosterId);
  if (vendorId) await admin.from("vendors").delete().eq("id", vendorId);
  for (const id of userIds.reverse()) {
    await admin.auth.admin.deleteUser(id);
  }
}

try {
  const manager = await createActor("Local GM", "gm");
  const foreman = await createActor("Local Foreman", "foreman");
  const employee = await createActor("Local Primary", "crew");
  const backup = await createActor("Local Backup", "crew");
  const other = await createActor("Local Other", "crew");
  const foremanCrew = `phase1a-local-crew-${suffix}`;
  const databaseToday = new Date().toISOString().slice(0, 10);
  expectData(await admin.from("schedules").upsert({
    user_id: foreman.id,
    schedule_date: databaseToday,
    shift_type: "full",
    crew_assignment: foremanCrew,
    created_by: manager.id,
  }, { onConflict: "user_id,schedule_date" }), "schedule local foreman for the current database day");

  assert.equal(expectData(await admin.rpc("duty_date_in_season", {
    p_date: "2026-07-13",
    p_season: "in_season",
    p_start_mmdd: null,
    p_end_mmdd: null,
  }), "missing seasonal boundaries"), false, "missing seasonal boundaries must not be invented");
  assert.equal(expectData(await admin.rpc("duty_date_in_season", {
    p_date: "2026-01-10",
    p_season: "in_season",
    p_start_mmdd: "11-01",
    p_end_mmdd: "03-15",
  }), "cross-year seasonal boundaries"), true);
  assert.equal(expectData(await admin.rpc("duty_rule_matches", {
    p_date: "2026-03-09",
    p_anchor: "2026-03-02",
    p_rule: { cadence: "weekly", interval: 1, weekdays: ["mon"] },
    p_season: "year_round",
  }), "weekly rule across DST"), true);
  assert.equal(expectData(await admin.rpc("duty_rule_matches", {
    p_date: "2028-02-29",
    p_anchor: "2026-01-31",
    p_rule: { cadence: "monthly", interval: 1, day_of_month: -1 },
    p_season: "year_round",
  }), "leap month end"), true);

  const vendor = expectData(await admin.from("vendors").insert({
    name: `${prefix} contractor`,
    category: "general",
    created_by: manager.id,
  }).select("id,name").single(), "create contractor fixture");
  vendorId = vendor.id;

  const mainPayload = dutyPayload(`${prefix}: primary duty`);
  const mainDuty = await saveDuty(manager, mainPayload, {
    primaryId: employee.id,
    backupId: backup.id,
  });

  const anonymousTaskView = await directRest(null, `tasks?select=id&duty_id=eq.${mainDuty.id}`);
  assert.ok(anonymousTaskView.response.status >= 400 || anonymousTaskView.data?.length === 0,
    "anonymous callers must not read protected Phase 1A occurrences");
  const anonymousDutyWrite = await directRest(null, "operation_duties", {
    method: "POST",
    body: dutyPayload(`${prefix}: anonymous duty write`),
  });
  assert.ok(anonymousDutyWrite.response.status >= 400,
    "anonymous callers must not mutate canonical duty data");
  expectError(await client().rpc("set_duty_assignment", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: employee.id,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_effective_date: "2026-08-01",
    p_reason: "Anonymous calls must be rejected",
  }), "anonymous duty-management RPC");

  const unauthorizedGeneration = await manager.api.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-27",
  });
  expectError(unauthorizedGeneration, "browser actor occurrence generation");

  expectData(await admin.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-27",
  }), "trusted occurrence generation");

  const employeeOwn = await directRest(
    employee.token,
    `tasks?select=id,title,status,assigned_to&duty_id=eq.${mainDuty.id}&order=due_date.asc,id.asc`,
  );
  assert.equal(employeeOwn.response.status, 200);
  assert.equal(employeeOwn.data.length, 3, "primary employee should see all three assigned occurrences");

  const otherView = await directRest(
    other.token,
    `tasks?select=id&duty_id=eq.${mainDuty.id}`,
  );
  assert.equal(otherView.response.status, 200);
  assert.deepEqual(otherView.data, [], "unrelated employee must not see another employee's work");

  const otherAuditView = await directRest(other.token, `duty_audit_events?select=id&duty_id=eq.${mainDuty.id}`);
  assert.equal(otherAuditView.response.status, 200);
  assert.deepEqual(otherAuditView.data, [], "unrelated employees must not read duty management history");

  const firstTask = expectData(await admin.from("tasks").select("*")
    .eq("duty_id", mainDuty.id).eq("original_due_date", "2026-07-13").single(), "load first occurrence");
  const inProgressTask = expectData(await admin.from("tasks").select("id")
    .eq("duty_id", mainDuty.id).eq("original_due_date", "2026-07-27").single(), "load future in-progress occurrence");
  const foremanTask = expectData(await admin.from("tasks").insert({
    title: `${prefix}: foreman crew occurrence`,
    category: "grounds",
    priority: "normal",
    status: "pending",
    assigned_to: employee.id,
    assigned_by: manager.id,
    assigned_crew: foremanCrew,
    due_date: databaseToday,
  }).select("id,status").single(), "create local foreman crew occurrence");

  const foremanCrewView = await directRest(foreman.token, `tasks?select=id,status&id=eq.${foremanTask.id}`);
  assert.equal(foremanCrewView.response.status, 200);
  assert.equal(foremanCrewView.data.length, 1, "foreman should see the assigned crew occurrence");
  const foremanUnscopedView = await directRest(foreman.token, `tasks?select=id&id=eq.${firstTask.id}`);
  assert.equal(foremanUnscopedView.response.status, 200);
  assert.deepEqual(foremanUnscopedView.data, [], "foreman must not see work outside the scheduled crew scope");
  expectData(await foreman.api.rpc("transition_task_status", {
    p_task_id: foremanTask.id,
    p_status: "in_progress",
    p_blocked_reason: null,
  }), "foreman starts scheduled crew occurrence");
  expectData(await foreman.api.rpc("transition_task_status", {
    p_task_id: foremanTask.id,
    p_status: "completed",
    p_blocked_reason: null,
  }), "foreman completes scheduled crew occurrence");
  expectError(await foreman.api.rpc("transition_task_status", {
    p_task_id: foremanTask.id,
    p_status: "verified",
    p_blocked_reason: null,
  }), "foreman cannot verify crew completion");
  expectError(await foreman.api.rpc("set_duty_assignment", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: employee.id,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_effective_date: "2026-08-01",
    p_reason: "Foremen are not duty managers",
  }), "foreman GM-only assignment command");
  expectError(await foreman.api.rpc("save_operation_duty", {
    p_duty_id: null,
    p_duty: dutyPayload(`${prefix}: foreman must not create duties`),
    p_primary_profile_id: null,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_assignment_effective_date: "2026-08-01",
    p_assignment_reason: "Foremen are not duty managers",
  }), "foreman GM-only duty save");

  const ownExecutionRequirements = expectData(await employee.api.rpc("get_task_execution_requirements", {
    p_task_ids: [firstTask.id],
  }), "load own execution requirements");
  assert.deepEqual(ownExecutionRequirements, [{ task_id: firstTask.id, evidence_satisfied: true }]);
  const hiddenExecutionRequirements = expectData(await other.api.rpc("get_task_execution_requirements", {
    p_task_ids: [firstTask.id],
  }), "load hidden execution requirements");
  assert.deepEqual(hiddenExecutionRequirements, [], "requirement helper must not reveal another employee's task");

  const forgedManagerInsert = await directRest(manager.token, "tasks", {
    method: "POST",
    body: {
      title: `${prefix}: forged manager attribution`,
      category: "grounds",
      priority: "normal",
      status: "pending",
      assigned_to: employee.id,
      assigned_by: other.id,
      due_date: "2026-07-13",
    },
  });
  assert.ok(forgedManagerInsert.response.status >= 400,
    "supervisor task inserts must retain the authenticated actor as assigned_by");

  const otherPatch = await directRest(other.token, `tasks?id=eq.${firstTask.id}`, {
    method: "PATCH",
    body: { status: "completed" },
  });
  assert.equal(otherPatch.response.status, 200);
  assert.deepEqual(otherPatch.data, [], "RLS must make an unrelated direct PATCH affect no rows");

  const structuralPatch = await directRest(employee.token, `tasks?id=eq.${firstTask.id}`, {
    method: "PATCH",
    body: { title: `${prefix}: unauthorized rewrite` },
  });
  assert.ok(structuralPatch.response.status >= 400, "employee structural PATCH must be rejected");

  const forgedManagerUpdate = await directRest(manager.token, `tasks?id=eq.${firstTask.id}`, {
    method: "PATCH",
    body: { assigned_by: other.id },
  });
  assert.equal(forgedManagerUpdate.response.status, 200);
  assert.equal(forgedManagerUpdate.data[0]?.assigned_by, manager.id,
    "manager task edits must retain the authenticated actor as assigned_by");

  expectData(await employee.api.rpc("transition_task_status", {
    p_task_id: firstTask.id,
    p_status: "in_progress",
    p_blocked_reason: null,
  }), "employee starts own occurrence");
  expectData(await employee.api.rpc("transition_task_status", {
    p_task_id: firstTask.id,
    p_status: "completed",
    p_blocked_reason: null,
  }), "employee completes own occurrence");
  const completed = expectData(await admin.from("tasks").select("status,completed_by")
    .eq("id", firstTask.id).single(), "load completed occurrence");
  assert.equal(completed.status, "completed");
  assert.equal(completed.completed_by, employee.id, "completion actor must be the employee session");
  expectError(await employee.api.rpc("transition_task_status", {
    p_task_id: firstTask.id,
    p_status: "verified",
    p_blocked_reason: null,
  }), "employee cannot verify their own completion");
  const protectedHistoryPatch = await directRest(employee.token, `tasks?id=eq.${firstTask.id}`, {
    method: "PATCH",
    body: { notes: "Local integration attempted history rewrite" },
  });
  assert.ok(protectedHistoryPatch.response.status >= 400,
    "employees must not edit protected completion history");
  const protectedHistoryDelete = await directRest(employee.token, `tasks?id=eq.${firstTask.id}`, {
    method: "DELETE",
  });
  assert.ok(protectedHistoryDelete.response.status >= 400 || protectedHistoryDelete.data?.length === 0,
    "employees must not delete protected completion history");
  expectError(await employee.api.rpc("set_duty_assignment", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: backup.id,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_effective_date: "2026-08-01",
    p_reason: "Employees are not duty managers",
  }), "employee duty-management command");
  expectData(await employee.api.rpc("transition_task_status", {
    p_task_id: inProgressTask.id,
    p_status: "in_progress",
    p_blocked_reason: null,
  }), "start future occurrence before recurrence revision");

  const deleteCompleted = await directRest(manager.token, `tasks?id=eq.${firstTask.id}`, { method: "DELETE" });
  assert.ok(deleteCompleted.response.status >= 400, "even a manager cannot delete completed history");

  const coverageId = expectData(await manager.api.rpc("set_temporary_duty_coverage", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: backup.id,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_starts_on: "2026-07-20",
    p_ends_on: "2026-07-20",
    p_reason: "Local integration temporary coverage",
  }), "set temporary coverage");
  expectError(await manager.api.rpc("set_temporary_duty_coverage", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: employee.id,
    p_backup_profile_id: null,
    p_contractor_vendor_id: null,
    p_starts_on: "2026-07-20",
    p_ends_on: "2026-07-20",
    p_reason: "Local integration deliberate overlap",
  }), "overlapping temporary coverage");
  const covered = expectData(await admin.from("tasks")
    .select("id,assigned_to,duty_coverage_id,original_due_date,due_date,status")
    .eq("duty_id", mainDuty.id).eq("original_due_date", "2026-07-20").single(), "load covered occurrence");
  assert.equal(covered.assigned_to, backup.id);
  assert.equal(covered.duty_coverage_id, coverageId);

  expectData(await manager.api.rpc("move_duty_occurrence", {
    p_task_id: covered.id,
    p_new_due_date: "2026-07-21",
    p_reason: "Local integration date move",
  }), "move one occurrence");

  const recurrenceRule = { cadence: "weekly", interval: 1, weekdays: ["fri"] };
  const preview = expectData(await manager.api.rpc("preview_duty_recurrence_change", {
    p_duty_id: mainDuty.id,
    p_effective_date: "2026-07-20",
    p_recurrence_rule: recurrenceRule,
  }), "preview recurrence revision");
  assert.equal(preview.find((row) => row.task_id === covered.id)?.action, "preserve", "moved occurrence must be preserved");

  expectData(await manager.api.rpc("change_future_duty_recurrence", {
    p_duty_id: mainDuty.id,
    p_effective_date: "2026-07-20",
    p_cadence: "weekly",
    p_recurrence_rule: recurrenceRule,
    p_reason: "Local integration future recurrence revision",
  }), "apply recurrence revision");

  const movedRows = expectData(await admin.from("tasks")
    .select("id,status,due_date,original_due_date,duty_coverage_id")
    .eq("series_id", firstTask.series_id).eq("occurrence_key", "2026-07-20"), "load immutable occurrence key");
  assert.equal(movedRows.length, 1, "moved occurrence key must not be regenerated");
  assert.equal(movedRows[0].status, "pending");
  assert.equal(movedRows[0].due_date, "2026-07-21");
  assert.equal(movedRows[0].duty_coverage_id, coverageId);
  const preservedInProgress = expectData(await admin.from("tasks").select("status")
    .eq("id", inProgressTask.id).single(), "load in-progress occurrence after recurrence revision");
  assert.equal(preservedInProgress.status, "in_progress", "recurrence revision must preserve in-progress history");

  const restored = expectData(await admin.from("tasks")
    .select("assigned_to,duty_coverage_id,duty_owner_type")
    .eq("duty_id", mainDuty.id).eq("original_due_date", "2026-07-24").single(), "load post-coverage occurrence");
  assert.equal(restored.assigned_to, employee.id, "permanent owner must resume after temporary coverage");
  assert.equal(restored.duty_coverage_id, null);

  const reassignedAssignment = expectData(await manager.api.rpc("set_duty_assignment", {
    p_duty_id: mainDuty.id,
    p_primary_profile_id: backup.id,
    p_backup_profile_id: employee.id,
    p_contractor_vendor_id: null,
    p_effective_date: "2026-08-01",
    p_reason: "Local integration approved manager reassignment",
  }), "manager assignment through approved command");
  assert.ok(reassignedAssignment, "manager assignment command must return an assignment id");
  const overlappingAssignments = expectData(await admin.from("duty_assignments")
    .select("id,effective_from,effective_through")
    .eq("duty_id", mainDuty.id), "load manager assignment history");
  assert.equal(overlappingAssignments.filter((row) => row.effective_through === null).length, 1,
    "manager assignment command must leave one current, non-overlapping assignment");

  const evidencePayload = dutyPayload(`${prefix}: evidence duty`, {
    evidence_requirements: [{ key: "check-record", type: "record", label: "Completed checklist record" }],
    evidence_requirement_state: "required",
    manager_verification_required: true,
    verification_requirement_state: "required",
    sort_order: 20,
  });
  const evidenceDuty = await saveDuty(manager, evidencePayload, { primaryId: employee.id });
  expectData(await admin.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-13",
  }), "generate evidence occurrence");
  const evidenceTask = expectData(await admin.from("tasks").select("id")
    .eq("duty_id", evidenceDuty.id).single(), "load evidence occurrence");
  expectError(await employee.api.rpc("transition_task_status", {
    p_task_id: evidenceTask.id,
    p_status: "completed",
    p_blocked_reason: null,
  }), "complete without required evidence");
  const forgedEvidence = await directRest(employee.token, "task_evidence_items", {
    method: "POST",
    body: {
      task_id: evidenceTask.id,
      requirement_key: "check-record",
      requirement_type: "record",
      note: "Local integration forged direct evidence",
      satisfied_by: employee.id,
    },
  });
  assert.ok(forgedEvidence.response.status >= 400,
    "evidence writes must use the validating record_task_evidence command");
  expectData(await employee.api.rpc("record_task_evidence", {
    p_task_id: evidenceTask.id,
    p_requirement_key: "check-record",
    p_requirement_type: "record",
    p_note: "Local integration evidence",
    p_document_url: null,
    p_external_reference: null,
  }), "record required evidence");
  expectData(await employee.api.rpc("transition_task_status", {
    p_task_id: evidenceTask.id,
    p_status: "completed",
    p_blocked_reason: null,
  }), "complete after evidence");
  expectData(await manager.api.rpc("transition_task_status", {
    p_task_id: evidenceTask.id,
    p_status: "verified",
    p_blocked_reason: null,
  }), "manager verifies completed evidence work");
  const verified = expectData(await admin.from("tasks").select("status,completed_by,verified_by")
    .eq("id", evidenceTask.id).single(), "load verified evidence occurrence");
  assert.equal(verified.completed_by, employee.id);
  assert.equal(verified.verified_by, manager.id);

  const assignmentsBeforeFailedReassignment = expectData(await admin.from("duty_assignments")
    .select("duty_id,primary_profile_id,backup_profile_id,effective_from,effective_through")
    .in("duty_id", [mainDuty.id, evidenceDuty.id])
    .order("duty_id").order("effective_from"), "load assignments before failed bulk reassignment");
  expectError(await manager.api.rpc("reassign_active_duties", {
    p_from_profile_id: employee.id,
    p_replacement_profile_id: crypto.randomUUID(),
    p_effective_date: "2026-07-13",
    p_reason: "Local integration deliberate rollback",
    p_duty_ids: [mainDuty.id, evidenceDuty.id],
  }), "invalid atomic bulk reassignment");
  const assignmentsAfterFailedReassignment = expectData(await admin.from("duty_assignments")
    .select("duty_id,primary_profile_id,backup_profile_id,effective_from,effective_through")
    .in("duty_id", [mainDuty.id, evidenceDuty.id])
    .order("duty_id").order("effective_from"), "load assignments after failed bulk reassignment");
  assert.deepEqual(assignmentsAfterFailedReassignment, assignmentsBeforeFailedReassignment,
    "failed bulk reassignment must leave every assignment unchanged");

  const contractorDuty = await saveDuty(manager, dutyPayload(`${prefix}: contractor duty`, {
    department: "external",
    area: "external",
    role_group: "contractor",
    sort_order: 30,
  }), { vendorId });
  const unassignedDuty = await saveDuty(manager, dutyPayload(`${prefix}: unassigned duty`, {
    role_group: "unassigned",
    sort_order: 40,
  }));
  expectData(await admin.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-13",
  }), "generate contractor and unassigned occurrences");
  expectData(await admin.rpc("materialize_duty_occurrences", {
    p_from: "2026-07-13",
    p_through: "2026-07-13",
  }), "repeat occurrence generation idempotently");
  const ownershipRows = expectData(await admin.from("tasks")
    .select("duty_id,duty_owner_type,duty_contractor_name,assigned_to")
    .in("duty_id", [contractorDuty.id, unassignedDuty.id]), "load ownership variants");
  const contractorTask = ownershipRows.find((row) => row.duty_id === contractorDuty.id);
  const unassignedTask = ownershipRows.find((row) => row.duty_id === unassignedDuty.id);
  assert.equal(ownershipRows.length, 2, "repeated generation must not duplicate operational occurrences");
  assert.equal(contractorTask.duty_owner_type, "contractor");
  assert.equal(contractorTask.duty_contractor_name, `${prefix} contractor`);
  assert.equal(contractorTask.assigned_to, null);
  assert.equal(unassignedTask.duty_owner_type, "unassigned");
  assert.equal(unassignedTask.assigned_to, null);

  const invalidTitle = `${prefix}: atomic rollback`;
  expectError(await manager.api.rpc("save_operation_duty", {
    p_duty_id: null,
    p_duty: dutyPayload(invalidTitle, { sort_order: 50 }),
    p_primary_profile_id: employee.id,
    p_backup_profile_id: employee.id,
    p_contractor_vendor_id: null,
    p_assignment_effective_date: "2026-07-13",
    p_assignment_reason: "Local integration invalid ownership",
  }), "invalid atomic duty save");
  const { count: invalidCount, error: invalidCountError } = await admin.from("operation_duties")
    .select("id", { count: "exact", head: true }).eq("title", invalidTitle);
  if (invalidCountError) throw invalidCountError;
  assert.equal(invalidCount, 0, "failed ownership must roll back the duty definition");

  const directDutyWrite = await directRest(manager.token, "operation_duties", {
    method: "POST",
    body: dutyPayload(`${prefix}: direct writer must fail`),
  });
  assert.ok(directDutyWrite.response.status >= 400, "canonical duty direct writer must be revoked");

  const roster = expectData(await admin.from("pro_shop_staff").insert({
    full_name: `${prefix} legacy roster`,
    position: "rec_aid",
    default_group: "outside",
  }).select("id").single(), "create unlinked roster fixture");
  rosterId = roster.id;
  expectData(await manager.api.rpc("link_pro_shop_staff_profile", {
    p_staff_id: rosterId,
    p_profile_id: other.id,
    p_reason: "Local integration explicit identity confirmation",
  }), "link legacy roster explicitly");
  const linked = expectData(await admin.from("pro_shop_staff").select("profile_id")
    .eq("id", rosterId).single(), "load linked roster");
  assert.equal(linked.profile_id, other.id);

  const legacyDuty = expectData(await admin.from("pro_shop_duties").insert({
    title: `${prefix}: legacy read-only duty`,
    area: "outside",
    days: ["mon"],
    created_by: manager.id,
  }).select("id,title").single(), "create legacy duty fixture");
  legacyDutyId = legacyDuty.id;
  const legacyWrite = await directRest(manager.token, `pro_shop_duties?id=eq.${legacyDutyId}`, {
    method: "PATCH",
    body: { title: `${prefix}: forbidden legacy rewrite` },
  });
  assert.ok(legacyWrite.response.status >= 400, "retired legacy duty writer must reject authenticated changes");

  const pageTasks = Array.from({ length: 117 }, (_, index) => ({
    title: `${prefix} page:${String(index + 1).padStart(3, "0")}`,
    category: "grounds",
    priority: "normal",
    status: "pending",
    assigned_to: employee.id,
    assigned_by: manager.id,
    due_date: "2026-07-13",
  }));
  expectData(await admin.from("tasks").insert(pageTasks), "insert >100 pagination fixtures");
  const pagedRows = [];
  for (let offset = 0; ; offset += 50) {
    const page = await directRest(
      employee.token,
      `tasks?select=id,title&title=like.${encodeURIComponent(`${prefix} page:*`)}&order=title.asc,id.asc&limit=50&offset=${offset}`,
    );
    assert.equal(page.response.status, 200);
    pagedRows.push(...page.data);
    if (page.data.length < 50) break;
  }
  assert.equal(pagedRows.length, 117, "complete operational paging must return every visible row");
  assert.equal(new Set(pagedRows.map((row) => row.id)).size, 117, "paging must not duplicate rows");

  const auditActors = expectData(await admin.from("duty_audit_events")
    .select("actor_id,event_type").eq("duty_id", mainDuty.id), "load audit actors");
  assert.ok(auditActors.length >= 3);
  assert.ok(auditActors.every((event) => event.actor_id === manager.id), "manager changes must retain actor identity");

  const endedPayload = {
    ...mainPayload,
    days: ["fri"],
    recurrence_rule: recurrenceRule,
    is_active: false,
    inactive_reason: "Local integration lifecycle end",
  };
  await saveDuty(manager, endedPayload, {
    dutyId: mainDuty.id,
    primaryId: employee.id,
    backupId: backup.id,
    reason: "Local integration lifecycle end",
  });
  const preservedCompleted = expectData(await admin.from("tasks").select("status")
    .eq("id", firstTask.id).single(), "load history after lifecycle end");
  assert.equal(preservedCompleted.status, "completed", "lifecycle end must preserve completed history");

  await saveDuty(manager, {
    ...evidencePayload,
    is_active: false,
    inactive_reason: "Local integration verified history end",
  }, {
    dutyId: evidenceDuty.id,
    primaryId: employee.id,
    reason: "Local integration verified history end",
  });
  const preservedVerified = expectData(await admin.from("tasks").select("status,verified_by")
    .eq("id", evidenceTask.id).single(), "load verified history after lifecycle end");
  assert.equal(preservedVerified.status, "verified", "lifecycle end must preserve verified history");
  assert.equal(preservedVerified.verified_by, manager.id);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      individualActors: 5,
      rlsAndRpcAuthorization: true,
      anonymousProtection: true,
      foremanCrewScope: true,
      atomicSaveRollback: true,
      atomicReassignmentRollback: true,
      temporaryCoverageRestored: true,
      movedOccurrencePreserved: true,
      historyPreserved: ["in_progress", "completed", "verified"],
      dateEdges: ["missing-season", "cross-year", "DST", "leap-month-end"],
      evidenceAndVerification: true,
      ownershipVariants: ["employee", "contractor", "unassigned"],
      occurrenceGenerationIdempotent: true,
      explicitRosterLink: true,
      retiredLegacyWriter: true,
      paginatedRows: pagedRows.length,
    },
  }, null, 2));
} finally {
  await cleanup();
}
