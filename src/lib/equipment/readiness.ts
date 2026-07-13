import type { Equipment } from "@/types/database";

export type ReadinessBucket =
  | "operational"
  | "down"
  | "needs_service"
  | "waiting_on_parts";

export type EquipmentReadinessUnit = Pick<
  Equipment,
  | "status"
  | "needs_parts_ordered"
  | "current_hours"
  | "service_interval_hours"
  | "next_service_due_date"
  | "make"
  | "model"
>;

export interface EquipmentReadinessSummary {
  totalOwned: number;
  operational: number;
  down: number;
  needsService: number;
  waitingOnParts: number;
}

const DOWN_STATUSES = new Set(["out_of_service", "in_repair"]);

/**
 * Classifies a unit only from its existing status and parts-order flag.
 * Hours and service dates deliberately do not participate in Phase A.
 */
export function getReadinessBuckets(unit: EquipmentReadinessUnit): ReadinessBucket[] {
  if (unit.status === "retired") return [];

  const buckets: ReadinessBucket[] = [];
  if (unit.status === "operational") buckets.push("operational");
  if (DOWN_STATUSES.has(unit.status)) buckets.push("down");
  if (unit.status === "needs_service") buckets.push("needs_service");
  if (unit.needs_parts_ordered) buckets.push("waiting_on_parts");
  return buckets;
}

export function summarizeEquipmentReadiness(
  units: readonly EquipmentReadinessUnit[],
): EquipmentReadinessSummary {
  const summary: EquipmentReadinessSummary = {
    totalOwned: 0,
    operational: 0,
    down: 0,
    needsService: 0,
    waitingOnParts: 0,
  };

  for (const unit of units) {
    const buckets = getReadinessBuckets(unit);
    if (unit.status === "retired") continue;

    summary.totalOwned += 1;
    if (buckets.includes("operational")) summary.operational += 1;
    if (buckets.includes("down")) summary.down += 1;
    if (buckets.includes("needs_service")) summary.needsService += 1;
    if (buckets.includes("waiting_on_parts")) summary.waitingOnParts += 1;
  }

  return summary;
}

export function needsAttention(unit: EquipmentReadinessUnit): boolean {
  return getAttentionPriority(unit) < 3;
}

/** Lower values sort first in the attention list. */
export function getAttentionPriority(unit: EquipmentReadinessUnit): number {
  if (unit.status === "retired") return 3;
  if (DOWN_STATUSES.has(unit.status)) return 0;
  if (unit.status === "needs_service") return 1;
  if (unit.needs_parts_ordered) return 2;
  return 3;
}

export function sortEquipmentForAttention<T extends EquipmentReadinessUnit>(
  units: readonly T[],
): T[] {
  return units
    .filter(needsAttention)
    .sort((a, b) => getAttentionPriority(a) - getAttentionPriority(b));
}

export function formatEquipmentIdentity(
  unit: Pick<Equipment, "make" | "model">,
): string {
  if (unit.make && unit.model) return `${unit.make} ${unit.model}`;
  return unit.model || unit.make || "Details not recorded";
}
