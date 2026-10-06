/**
 * What the Food & Beverage Manager (role `fb_manager`) can do.
 *
 * She runs Buckley's: the restaurant schedule, revenue, orders, restaurant
 * purchases and inventory, and her own purchase requests (food and alcohol
 * COGS). She manages the people in the Food & Beverage department (profile
 * details, 1:1s, evaluations, SF-52s) but cannot change anyone's role. The
 * database enforces the same lines (migration 20261005140000_fb_manager_role).
 */
import type { UserRole } from "@/types/database";

export const FB_DEPARTMENT = "food_and_beverage";

/** Schedule areas that belong to Buckley's. */
export const BUCKLEYS_SCHEDULE_AREA = "buckleys" as const;

const PR_MANAGERS: UserRole[] = ["super", "asst_super", "director", "gm"];

export function isFbManagerRole(role: string | null | undefined): boolean {
  return role === "fb_manager";
}

/** Purchase requests: managers, and the F&B Manager for her own. */
export function canUsePurchaseRequests(role: string | null | undefined): boolean {
  return PR_MANAGERS.includes(role as UserRole) || isFbManagerRole(role);
}

/** Advance, revert, edit, or delete this PR. The F&B Manager: only her own. */
export function canChangePurchaseRequest(
  role: string | null | undefined,
  userId: string | null | undefined,
  pr: { created_by?: string | null } | null | undefined,
): boolean {
  if (PR_MANAGERS.includes(role as UserRole)) return true;
  return isFbManagerRole(role) && !!userId && !!pr && pr.created_by === userId;
}

/** Is this employee one of hers (Food & Beverage department)? */
export function isFbStaff(employee: { department?: string | null } | null | undefined): boolean {
  return employee?.department === FB_DEPARTMENT;
}

/**
 * Narrow a staff list to what the viewer manages. Everyone but the F&B
 * Manager gets the list unchanged.
 */
export function staffForViewer<T extends { department?: string | null; id?: string }>(
  role: string | null | undefined,
  viewerId: string | null | undefined,
  staff: T[],
): T[] {
  if (!isFbManagerRole(role)) return staff;
  return staff.filter((p) => isFbStaff(p) && p.id !== viewerId);
}
