#!/usr/bin/env node

/**
 * Read-only production data-readiness inventory.
 *
 * Uses the configured authenticated control account and requests only exact
 * counts with `head: true`; no row values are downloaded or printed. Missing
 * or undeployed relations are reported as schema errors. This script performs
 * no inserts, updates, deletes, RPC calls, or storage operations.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = { ...process.env };
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in env)) env[match[1]] = match[2].trim();
  }
} catch {
  // Environment variables may be supplied by the caller instead.
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_EMAIL",
  "NEXT_PUBLIC_APP_PASSWORD",
];
const missing = required.filter((name) => !env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const tables = [
  "profiles",
  "tasks",
  "task_templates",
  "task_series",
  "operation_duties",
  "duty_assignments",
  "duty_audit_events",
  "duty_recurrence_versions",
  "duty_temporary_coverages",
  "task_evidence_items",
  "obligations",
  "obligation_completions",
  "obligation_completion_audit_events",
  "program_standards",
  "program_standard_versions",
  "standard_evaluations",
  "standard_corrective_actions",
  "daily_goals",
  "daily_steps",
  "calendar_events",
  "staff_one_on_ones",
  "staff_one_on_one_sessions",
  "staff_engagement_profiles",
  "staff_concerns",
  "staff_records",
  "staff_documents",
  "certifications",
  "schedules",
  "time_off_requests",
  "pro_shop_staff",
  "pro_shop_schedules",
  "pro_shop_shifts",
  "pro_shop_duties",
  "duty_completions",
  "equipment",
  "equipment_logs",
  "equipment_inspections",
  "equipment_service_records",
  "fy26_assets",
  "untracked_assets",
  "ast_inspections",
  "inspection_checklists",
  "environmental_compliance",
  "water_usage",
  "chemical_products",
  "chemical_applications",
  "purchase_requests",
  "cost_center_budgets",
  "budget_items",
  "expenses",
  "revenue_entries",
  "capital_projects",
  "inventory_items",
  "inventory_counts",
  "inventory_count_lines",
  "restaurant_purchases",
  "vendors",
  "tournaments",
  "tournament_checklist_items",
  "work_orders",
  "notifications",
  "photos",
  "created_documents",
  "onboarding_documents",
];

const primaryKeyByTable = {
  staff_engagement_profiles: "employee_id",
};

const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function formatError(error) {
  const parts = [
    error.code,
    error.message,
    error.details,
    error.hint,
    error.name,
    error.status,
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
  if (parts.length > 0) return parts.join("|");
  const serialized = JSON.stringify(error);
  return serialized && serialized !== "{}" ? serialized : "Unknown query error";
}

const { error: signInError } = await client.auth.signInWithPassword({
  email: env.NEXT_PUBLIC_APP_EMAIL,
  password: env.NEXT_PUBLIC_APP_PASSWORD,
});
if (signInError) {
  console.error(`Authenticated control sign-in failed: ${signInError.message}`);
  process.exit(1);
}

console.log(`Data-readiness counts - ${new Date().toISOString()}`);
for (const table of tables) {
  const { count, error } = await client
    .from(table)
    .select(primaryKeyByTable[table] ?? "id", { count: "exact", head: true });
  if (error) {
    console.log(`${table}|ERROR|${formatError(error)}`);
  } else {
    console.log(`${table}|${count ?? 0}`);
  }
}

const filteredChecks = [
  ["tasks.duty_backed", "tasks", (query) => query.not("duty_id", "is", null)],
  ["tasks.unassigned", "tasks", (query) => query.is("assigned_to", null)],
  ["tasks.pending", "tasks", (query) => query.eq("status", "pending")],
  ["tasks.in_progress", "tasks", (query) => query.eq("status", "in_progress")],
  ["tasks.blocked", "tasks", (query) => query.eq("status", "blocked")],
  ["tasks.completed", "tasks", (query) => query.eq("status", "completed")],
  ["tasks.verified", "tasks", (query) => query.eq("status", "verified")],
  [
    "tasks.evidence_required",
    "tasks",
    (query) => query.eq("duty_evidence_requirement_state", "required"),
  ],
  [
    "tasks.verification_required",
    "tasks",
    (query) => query.eq("duty_verification_requirement_state", "required"),
  ],
  [
    "duties.evidence_not_recorded",
    "operation_duties",
    (query) => query.eq("evidence_requirement_state", "not_recorded"),
  ],
  [
    "duties.verification_not_recorded",
    "operation_duties",
    (query) => query.eq("verification_requirement_state", "not_recorded"),
  ],
  [
    "duties.equipment_not_recorded",
    "operation_duties",
    (query) => query.eq("equipment_requirement_state", "not_recorded"),
  ],
  ["obligations.unowned", "obligations", (query) => query.is("owner_profile_id", null)],
  ["standards.unowned", "program_standards", (query) => query.is("owner_profile_id", null)],
  ["profiles.department_missing", "profiles", (query) => query.is("department", null)],
  ["daily_goals.actor_missing", "daily_goals", (query) => query.is("created_by", null)],
  ["daily_steps.actor_missing", "daily_steps", (query) => query.is("created_by", null)],
  ["equipment.photo_missing", "equipment", (query) => query.is("photo_url", null)],
  ["equipment.serial_missing", "equipment", (query) => query.is("serial_number", null)],
  [
    "equipment.inspection_date_missing",
    "equipment",
    (query) => query.is("last_inspection_date", null),
  ],
  ["assets.photo_missing", "fy26_assets", (query) => query.is("photo_url", null)],
  ["assets.unverified", "fy26_assets", (query) => query.eq("status", "unverified")],
  [
    "assets.verified_present",
    "fy26_assets",
    (query) => query.eq("status", "verified_present"),
  ],
];

console.log("Filtered readiness checks");
for (const [label, table, apply] of filteredChecks) {
  const key = primaryKeyByTable[table] ?? "id";
  const query = client.from(table).select(key, { count: "exact", head: true });
  const { count, error } = await apply(query);
  if (error) {
    console.log(`${label}|ERROR|${formatError(error)}`);
  } else {
    console.log(`${label}|${count ?? 0}`);
  }
}

await client.auth.signOut();
