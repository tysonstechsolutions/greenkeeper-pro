import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateCronRequest } from "@/lib/cron-auth";

/**
 * Service-role Supabase client for cron operations (no user session needed).
 */
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AlertResult {
  equipmentId: string;
  equipmentName: string;
  action: "status_updated" | "task_created" | "task_exists";
  details: string;
}

/**
 * GET /api/cron/equipment-alerts
 *
 * Scans all equipment that is currently "operational" and checks whether it
 * has exceeded its service-hour interval or its calendar service date.
 *
 * For every match it:
 *   1. Flips the equipment status to "needs_service".
 *   2. Creates a high-priority mechanical task (if one doesn't already exist).
 *
 * Protected via the shared `validateCronRequest` helper.
 */
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const results: AlertResult[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Fetch operational equipment that is overdue ──────────────────
    const { data: equipment, error: fetchError } = await supabase
      .from("equipment")
      .select("id, name, current_hours, next_service_due_hours, next_service_due_date, status")
      .eq("status", "operational");

    if (fetchError) {
      throw new Error(`Failed to query equipment: ${fetchError.message}`);
    }

    if (!equipment || equipment.length === 0) {
      return NextResponse.json({
        message: "No operational equipment found",
        processed: 0,
        results: [],
      });
    }

    // Filter to those that are actually overdue
    const overdue = equipment.filter((eq) => {
      const hoursOverdue =
        eq.current_hours != null &&
        eq.next_service_due_hours != null &&
        eq.current_hours >= eq.next_service_due_hours;
      const dateOverdue =
        eq.next_service_due_date != null && eq.next_service_due_date <= today;
      return hoursOverdue || dateOverdue;
    });

    // ── 2. Process each overdue piece of equipment ─────────────────────
    for (const eq of overdue) {
      // 2a. Update status to needs_service
      const { error: updateError } = await supabase
        .from("equipment")
        .update({ status: "needs_service" })
        .eq("id", eq.id);

      if (updateError) {
        errors.push(`Failed to update status for ${eq.name}: ${updateError.message}`);
        continue;
      }

      results.push({
        equipmentId: eq.id,
        equipmentName: eq.name,
        action: "status_updated",
        details: "Status changed from operational to needs_service",
      });

      // 2b. Check if a matching service task already exists
      const { data: existingTasks, error: taskQueryError } = await supabase
        .from("tasks")
        .select("id, title, status")
        .ilike("title", `%${eq.name}%service%`)
        .in("status", ["pending", "in_progress"]);

      if (taskQueryError) {
        errors.push(`Failed to query tasks for ${eq.name}: ${taskQueryError.message}`);
        continue;
      }

      if (existingTasks && existingTasks.length > 0) {
        results.push({
          equipmentId: eq.id,
          equipmentName: eq.name,
          action: "task_exists",
          details: `Existing task found: "${existingTasks[0].title}" (${existingTasks[0].status})`,
        });
        continue;
      }

      // 2c. Create a new service task
      const hoursInfo =
        eq.current_hours != null && eq.next_service_due_hours != null
          ? `Current hours: ${eq.current_hours}. Service was due at ${eq.next_service_due_hours} hours.`
          : "";
      const dateInfo =
        eq.next_service_due_date != null
          ? `Service was due by ${eq.next_service_due_date}.`
          : "";

      const notes = `[Auto] ${hoursInfo} ${dateInfo}`.trim();

      const { error: insertError } = await supabase.from("tasks").insert({
        title: `Service due: ${eq.name}`,
        category: "mechanical",
        priority: "high",
        status: "pending",
        due_date: today,
        notes,
        hole_numbers: [],
        equipment_needed: [],
        materials_needed: [],
        checklist: [],
        requires_photo_before: false,
        requires_photo_after: false,
        weather_dependent: false,
      });

      if (insertError) {
        errors.push(`Failed to create task for ${eq.name}: ${insertError.message}`);
        continue;
      }

      results.push({
        equipmentId: eq.id,
        equipmentName: eq.name,
        action: "task_created",
        details: `Created task "Service due: ${eq.name}" — ${notes}`,
      });
    }

    return NextResponse.json({
      message: `Processed ${overdue.length} overdue equipment items`,
      processed: overdue.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Equipment alerts cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
