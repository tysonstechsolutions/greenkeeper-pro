import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeNDVIForTasks,
  generateTaskTitle,
  severityToPriority,
} from "@/lib/ai/ndvi-tasking";
import type { StressZone } from "@/lib/ai/ndvi-tasking";

const MANAGEMENT_ROLES = new Set([
  "super",
  "asst_super",
  "director",
  "foreman",
]);

/**
 * POST /api/drone/auto-task
 *
 * Analyzes a drone flight preview image for NDVI stress zones and
 * auto-generates scout tasks for each detected zone.
 *
 * Body: { flightId: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !MANAGEMENT_ROLES.has(profile.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions. Management role required." },
      { status: 403 }
    );
  }

  // Parse body
  let flightId: string;
  try {
    const body = await req.json();
    flightId = body.flightId;
    if (!flightId || typeof flightId !== "string") {
      return NextResponse.json(
        { error: "flightId is required" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Fetch the drone flight
  const { data: flight, error: flightError } = await supabase
    .from("drone_flights")
    .select("*")
    .eq("id", flightId)
    .single();

  if (flightError || !flight) {
    return NextResponse.json(
      { error: "Drone flight not found" },
      { status: 404 }
    );
  }

  // Determine preview image URL
  const imagePath = flight.preview_png_path || flight.geotiff_path;
  if (!imagePath) {
    return NextResponse.json(
      { error: "No preview image available for this flight" },
      { status: 400 }
    );
  }

  // Generate a signed URL for the image (1 hour)
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("drone-flights")
    .createSignedUrl(imagePath, 3600);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate image URL" },
      { status: 500 }
    );
  }

  // Run NDVI analysis
  const analysis = await analyzeNDVIForTasks({
    imageUrl: signedUrlData.signedUrl,
    flightDate: flight.flight_date,
    band: flight.band || "ndvi",
    courseContext:
      "Veterans Memorial Golf Course is an 18-hole course. The layout runs roughly north-south with holes 1-9 on the east side and holes 10-18 on the west side.",
  });

  // Create tasks from stress zones
  const taskIds: string[] = [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = tomorrow.toISOString().split("T")[0];

  for (const zone of analysis.stressZones) {
    const title = generateTaskTitle(zone);
    const priority = severityToPriority(zone.severity);
    const holeNumbers = zone.estimatedHole ? [zone.estimatedHole] : [];

    const taskInsert = {
      title,
      description: `Auto-generated from ${(flight.band || "NDVI").toUpperCase()} drone flight on ${flight.flight_date}. ${zone.suggestedAction}. Flight ID: ${flightId}`,
      category: "other" as const,
      priority,
      status: "pending" as const,
      assigned_to: null,
      assigned_by: profile.id,
      due_date: dueDate,
      hole_numbers: holeNumbers,
      requires_photo_before: false,
      requires_photo_after: true,
      notes: `Severity: ${zone.severity}. ${zone.description}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newTask, error: taskError } = await (supabase as any)
      .from("tasks")
      .insert(taskInsert)
      .select("id")
      .single();

    if (!taskError && newTask?.id) {
      taskIds.push(newTask.id);
    } else {
      console.error("Failed to create task for zone:", zone.description, taskError);
    }
  }

  return NextResponse.json({
    analysis,
    tasksCreated: taskIds.length,
    taskIds,
  });
}
