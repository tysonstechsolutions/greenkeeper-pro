/**
 * Restricted Entry Interval (REI) conflict matching.
 *
 * After a chemical application, OSHA's Worker Protection Standard bars workers
 * from entering the treated area until the product's REI elapses. When a
 * superintendent assigns a task to a zone or hole that's still inside an
 * active REI window, we surface a warning so nobody is sent into a restricted
 * area. This module is the pure matcher; the UI banner consumes its output.
 */

export interface REIZoneInfo {
  application_id: string;
  product_name: string;
  /** Course-zone ids still under the active REI for this application. */
  zone_ids: string[];
  /** Hole numbers still under the active REI for this application. */
  hole_numbers: number[];
  rei_expires_at: string;
  hours_remaining: number;
}

export interface TaskREITarget {
  /** The task's target zone, or null if it isn't zone-scoped. */
  zone_id: string | null;
  /** The task's target holes (may be empty). */
  hole_numbers: number[];
}

/**
 * Returns the subset of `activeREIs` that overlap the task's target.
 *
 * An REI conflicts when the task's zone is in the REI's `zone_ids`, OR any of
 * the task's holes is in the REI's `hole_numbers`. Each conflicting REI is
 * returned at most once, preserving input order.
 */
export function findREIConflicts(
  target: TaskREITarget,
  activeREIs: REIZoneInfo[],
): REIZoneInfo[] {
  const targetHoles = new Set(target.hole_numbers);

  return activeREIs.filter((rei) => {
    const zoneMatch =
      target.zone_id !== null && rei.zone_ids.includes(target.zone_id);
    const holeMatch = rei.hole_numbers.some((h) => targetHoles.has(h));
    return zoneMatch || holeMatch;
  });
}
