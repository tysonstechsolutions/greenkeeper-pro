/**
 * Keeps work orders and the clubhouse/facilities issue board in sync.
 *
 *  - Every work order also appears as an issue on the board, tagged by building
 *    (8400 = Clubhouse / Buckley's, 3311 = Maintenance). createClubhouseIssueForWO()
 *  - When a work order's status advances, the linked issue follows. syncClubhouseIssueForWO()
 *  - A clubhouse issue can be escalated into a work order. createWorkOrderFromIssue()
 *
 * All sync writes are best-effort: a failure here must never block the work-order
 * or issue action the user actually took.
 */
import { directInsertRow, directPatchByFilter, getCachedUserId } from "@/lib/supabase/rest";

// Fixed POCs for golf work orders (mirrors the new-work-order form).
const WO_POC = {
  primaryEmail: "admin@tysonstechsolutions.com",
  primaryPhone: "847-688-4593",
  secondaryName: "Joseph Caprez",
  secondaryPhone: "847-688-4593",
} as const;

export type ClubhouseStatus = "open" | "in_progress" | "ordered" | "scheduled" | "completed";

/** "VMGC @ 8400" -> "8400". null when neither building is named. */
export function buildingFromFacility(facility: string | null | undefined): string | null {
  if (!facility) return null;
  if (facility.includes("8400")) return "8400";
  if (facility.includes("3311")) return "3311";
  return null;
}

export function buildingLabel(building: string | null | undefined): string {
  if (building === "8400") return "Clubhouse / Buckley's";
  if (building === "3311") return "Maintenance";
  return building || "—";
}

export function woStatusToIssueStatus(woStatus: string): ClubhouseStatus {
  switch (woStatus) {
    case "completed":
      return "completed";
    case "sent":
    case "submitted":
      return "in_progress";
    default:
      return "open"; // draft / unknown
  }
}

export function priorityFromWorkType(
  workType: string | null | undefined,
): "low" | "normal" | "high" | "urgent" {
  const wt = (workType || "").toLowerCase();
  if (wt.includes("emergency")) return "urgent";
  if (wt.includes("urgent") || wt.includes("safety") || wt.includes("fire") || wt.includes("revenue")) {
    return "high";
  }
  return "normal";
}

function firstLine(s: string, max = 80): string {
  const line = (s || "").split("\n")[0].trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

/** Mirror a newly-created work order onto the clubhouse/facilities board. */
export async function createClubhouseIssueForWO(wo: {
  id: string;
  description_of_work: string;
  work_type?: string | null;
  facility_bldg?: string | null;
  program_area_room?: string | null;
  nature_of_request?: string | null;
}): Promise<void> {
  try {
    const title =
      wo.nature_of_request && wo.nature_of_request.trim()
        ? wo.nature_of_request.trim()
        : firstLine(wo.description_of_work) || "Work order";
    await directInsertRow(
      "clubhouse_issues",
      {
        reported_by: getCachedUserId(),
        title,
        description: wo.description_of_work || null,
        location: wo.program_area_room || null,
        category: "maintenance",
        priority: priorityFromWorkType(wo.work_type),
        status: woStatusToIssueStatus("submitted"),
        photos: [],
        work_order_id: wo.id,
        building: buildingFromFacility(wo.facility_bldg),
      },
      "clubhouse-sync.createIssueForWO",
    );
  } catch (err) {
    console.warn(
      "[clubhouse-sync] couldn't create issue for WO:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Mirror a work order's status change onto any linked issue. */
export async function syncClubhouseIssueForWO(woId: string, woStatus: string): Promise<void> {
  try {
    const status = woStatusToIssueStatus(woStatus);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    await directPatchByFilter(
      "clubhouse_issues",
      [`work_order_id=eq.${woId}`],
      patch,
      "clubhouse-sync.syncIssueStatus",
    );
  } catch (err) {
    console.warn(
      "[clubhouse-sync] couldn't sync issue status:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Escalate a clubhouse issue into a work order. Returns the new WO row. */
export async function createWorkOrderFromIssue(issue: {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  building?: string | null;
}): Promise<{ id: string; wo_sequence_number: number } | null> {
  const facility = issue.building === "3311" ? "VMGC @ 3311" : "VMGC @ 8400";
  const desc =
    issue.description && issue.description.trim() ? issue.description.trim() : issue.title;
  const row = await directInsertRow<{ id: string; wo_sequence_number: number }>(
    "work_orders",
    {
      date_submitted: new Date().toISOString().slice(0, 10),
      nature_of_request: null,
      facility_bldg: facility,
      program_area_room: issue.location || null,
      cost_center: null,
      description_of_work: desc,
      work_type: "Routine",
      primary_poc_email: WO_POC.primaryEmail,
      primary_poc_phone: WO_POC.primaryPhone,
      secondary_poc_name: WO_POC.secondaryName,
      secondary_poc_phone: WO_POC.secondaryPhone,
      number_of_enclosures: "0",
      status: "submitted",
      created_by: getCachedUserId(),
    },
    "clubhouse-sync.createWorkOrderFromIssue",
  );
  return row ?? null;
}
