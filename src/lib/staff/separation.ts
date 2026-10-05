/**
 * Resignations take people off the active staff list.
 *
 * A resignation SF-52's effective date is the employee's last day of work.
 * Saving the SF-52 records that date on the person (personnel_details.
 * separation_date) and on their pro shop schedule row (employed_through,
 * which the schedule already honors). If the last day has passed they're
 * marked inactive right away; otherwise `deactivateDepartedStaff` marks them
 * inactive the first time a manager opens Staff, Evaluations, or SF-52 after
 * that day.
 */
import { directRpc, directSelectList, directSelectRow } from "@/lib/supabase/rest";
import type { PersonnelDetails, StaffPersonnelPrivate } from "@/types/database";
import { normalizeStaffName } from "./import-schedule-staff";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Someone has left once the day after their last day arrives. */
export function hasLeft(lastDay: string | null | undefined, todayIso: string): boolean {
  return !!lastDay && ISO_DATE.test(lastDay) && todayIso > lastDay;
}

/**
 * The last day of work from the SF-52's proposed effective date. With no
 * date entered, the resignation counts as of yesterday (they've already gone).
 */
export function resignationLastDay(effectiveDate: string, todayIso: string): string {
  if (ISO_DATE.test(effectiveDate.trim())) return effectiveDate.trim();
  const d = new Date(`${todayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Personnel details with the separation date set; everything else kept. */
export function withSeparationDate(pd: PersonnelDetails | null | undefined, lastDay: string): PersonnelDetails {
  return { ...(pd || {}), separation_date: lastDay };
}

interface ScheduleRow {
  id: string;
  full_name: string;
  profile_id?: string | null;
  employed_through?: string | null;
}

/** The person's pro shop schedule row: linked profile first, then exact name. */
export function findScheduleRow(rows: ScheduleRow[], employeeId: string, fullName: string): ScheduleRow | null {
  const linked = rows.find((r) => r.profile_id === employeeId);
  if (linked) return linked;
  const name = normalizeStaffName(fullName);
  const byName = rows.filter((r) => name && normalizeStaffName(r.full_name) === name);
  return byName.length === 1 ? byName[0] : null;
}

export interface ResignationResult {
  lastDay: string;
  /** Marked inactive now (the last day has passed). */
  removedNow: boolean;
  /** Their pro shop schedule row got the same last day. */
  scheduleUpdated: boolean;
}

/** Record a resignation from a saved SF-52. Manager-only (the RPCs check). */
export async function applyResignation(args: {
  employeeId: string;
  fullName: string;
  effectiveDate: string;
  todayIso: string;
}): Promise<ResignationResult> {
  const lastDay = resignationLastDay(args.effectiveDate, args.todayIso);
  const removedNow = hasLeft(lastDay, args.todayIso);

  // update_staff_profile replaces personnel_details whole, so merge first.
  const personnel = await directSelectRow<Pick<StaffPersonnelPrivate, "personnel_details">>(
    "staff_personnel_private",
    "employee_id",
    args.employeeId,
    "personnel_details",
    "separation.personnel",
  );
  await directRpc(
    "update_staff_profile",
    {
      p_employee_id: args.employeeId,
      p_directory: removedNow ? { is_active: false } : {},
      p_personnel: { personnel_details: withSeparationDate(personnel?.personnel_details, lastDay) },
    },
    "separation.profile",
  );

  // Best effort: the schedule stops scheduling them after their last day.
  let scheduleUpdated = false;
  try {
    const rows = await directSelectList<ScheduleRow>("pro_shop_staff", {
      columns: "id,full_name,profile_id,employed_through",
      label: "separation.schedule",
    });
    const row = findScheduleRow(rows, args.employeeId, args.fullName);
    if (row) {
      await directRpc(
        "save_pro_shop_staff",
        {
          p_staff_id: row.id,
          p_values: { employed_through: lastDay },
          p_reason: "Resignation SF-52 saved",
        },
        "separation.schedule.save",
      );
      scheduleUpdated = true;
    }
  } catch {
    /* the staff record is what matters; the schedule can be edited by hand */
  }

  return { lastDay, removedNow, scheduleUpdated };
}

/**
 * Someone marked active again (a rehire) loses a last day that has already
 * passed, so the daily check doesn't take them off the list again.
 * Returns true when a date was cleared.
 */
export async function clearPastSeparation(employeeId: string, todayIso: string): Promise<boolean> {
  const personnel = await directSelectRow<Pick<StaffPersonnelPrivate, "personnel_details">>(
    "staff_personnel_private",
    "employee_id",
    employeeId,
    "personnel_details",
    "separation.clear.personnel",
  );
  const pd = personnel?.personnel_details;
  if (!pd || !hasLeft(pd.separation_date, todayIso)) return false;
  const rest: PersonnelDetails = { ...pd };
  delete rest.separation_date;
  await directRpc(
    "update_staff_profile",
    { p_employee_id: employeeId, p_directory: {}, p_personnel: { personnel_details: rest } },
    "separation.clear",
  );
  return true;
}

let sweptOn: string | null = null;

/**
 * Mark inactive anyone whose recorded last day has passed. Runs at most once
 * per day per app session; never throws (a non-manager simply can't).
 * Returns how many people were taken off the active list.
 */
export async function deactivateDepartedStaff(todayIso: string): Promise<number> {
  if (sweptOn === todayIso) return 0;
  sweptOn = todayIso;
  try {
    const rows = await directSelectList<Pick<StaffPersonnelPrivate, "employee_id" | "personnel_details">>(
      "staff_personnel_private",
      {
        columns: "employee_id,personnel_details",
        filters: [`personnel_details->>separation_date=lt.${todayIso}`],
        label: "separation.sweep.personnel",
      },
    );
    const departed = rows.filter((r) => hasLeft(r.personnel_details?.separation_date, todayIso));
    if (departed.length === 0) return 0;
    const stillActive = await directSelectList<{ id: string }>("profiles", {
      columns: "id",
      filters: [`id=in.(${departed.map((r) => r.employee_id).join(",")})`, "is_active=eq.true"],
      label: "separation.sweep.profiles",
    });
    let count = 0;
    for (const p of stillActive) {
      await directRpc(
        "update_staff_profile",
        { p_employee_id: p.id, p_directory: { is_active: false }, p_personnel: {} },
        "separation.sweep.deactivate",
      )
        .then(() => count++)
        .catch(() => undefined);
    }
    return count;
  } catch {
    sweptOn = null; // try again next time
    return 0;
  }
}

/** For tests: forget that today's sweep already ran. */
export function resetDepartedStaffSweep(): void {
  sweptOn = null;
}
