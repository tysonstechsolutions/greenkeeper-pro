/**
 * Leadership briefing data loader.
 *
 * This module is intentionally only an I/O adapter. It fetches the approved
 * sources, preserves missing numeric data as invalid/unavailable rather than
 * coercing it to zero, and passes the result to the pure briefing engine.
 */
import { buildBriefing } from "./engine";
import type {
  BriefingBudgetItemSource,
  BriefingData,
  BriefingEquipmentSource,
  BriefingHoleObservationSource,
  BriefingProfileSource,
  BriefingPurchaseRequestSource,
  BriefingSources,
  BriefingWorkOrderSource,
  BuildBriefingOptions,
} from "./types";
import type {
  Obligation,
  ObligationCompletion,
} from "@/lib/operations/types";
import { directSelectList } from "@/lib/supabase/rest";
import type { Certification } from "@/lib/people/certs";
import type { PurchaseRequestItem } from "@/types/database";

interface RawMonthlyTotal {
  month: string;
  category?: string;
  cost_ctr?: string | null;
  total: number | string | null;
}

interface RawBudgetItem {
  id: string;
  fiscal_year: number | string;
  category: BriefingBudgetItemSource["category"];
  description: string | null;
  budgeted_amount: number | string | null;
  month: number | string | null;
}

interface RawPurchaseRequest {
  id: string;
  date_prepared: string;
  status: BriefingPurchaseRequestSource["status"];
  items: PurchaseRequestItem[] | null;
  ige_amount: number | string | null;
  actual_amount: number | string | null;
}

interface RawEquipment {
  id: string;
  name: string;
  status: BriefingEquipmentSource["status"];
  make: string | null;
  model: string | null;
  needs_parts_ordered: boolean;
  current_hours: number | string | null;
  service_interval_hours: number | string | null;
  next_service_due_hours: number | string | null;
  next_service_due_date: string | null;
  triage_status: BriefingEquipmentSource["triage_status"];
}

interface RawHoleObservation {
  id: string;
  hole_number: number | string;
  issue_type: BriefingHoleObservationSource["issue_type"];
  priority: BriefingHoleObservationSource["priority"];
  status: BriefingHoleObservationSource["status"];
  title: string;
  resolved_at: string | null;
  created_at: string;
}

interface RawWorkOrder {
  id: string;
  description_of_work: string;
  status: BriefingWorkOrderSource["status"];
  date_submitted: string | null;
  created_at: string;
  updated_at: string;
}

function numberOrNaN(value: number | string | null): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  // The engine turns an invalid present value into an explicit availability
  // state. Do not silently turn it into 0.
  return Number.NaN;
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : numberOrNaN(value);
}

/** Fetch every approved source needed by the deterministic briefing engine. */
export async function loadBriefingSources(): Promise<BriefingSources> {
  const [
    revenueRows,
    prSpendRows,
    budgetRows,
    purchaseRequests,
    equipment,
    observations,
    obligations,
    obligationCompletions,
    profiles,
    certifications,
    workOrders,
    restaurantPurchases,
    inventoryItems,
    capitalProjects,
    staffRecords,
  ] = await Promise.all([
    directSelectList<RawMonthlyTotal>("revenue_monthly_rollup", {
      columns: "month,category,total",
      orderBy: [{ column: "month", ascending: true }],
      limit: 500,
      label: "briefing.revenueRollups",
    }),
    directSelectList<RawMonthlyTotal>("pr_spend_monthly_rollup", {
      columns: "month,cost_ctr,total",
      orderBy: [{ column: "month", ascending: true }],
      limit: 500,
      label: "briefing.prSpendRollups",
    }),
    directSelectList<RawBudgetItem>("budget_items", {
      columns: "id,fiscal_year,category,description,budgeted_amount,month",
      limit: 2_000,
      label: "briefing.budgetItems",
    }),
    directSelectList<RawPurchaseRequest>("purchase_requests", {
      columns: "id,date_prepared,status,items,ige_amount,actual_amount",
      limit: 2_000,
      label: "briefing.purchaseRequests",
    }),
    directSelectList<RawEquipment>("equipment", {
      columns:
        "id,name,status,make,model,needs_parts_ordered,current_hours,service_interval_hours,next_service_due_hours,next_service_due_date,triage_status",
      limit: 500,
      label: "briefing.equipment",
    }),
    directSelectList<RawHoleObservation>("hole_observations", {
      columns:
        "id,hole_number,issue_type,priority,status,title,resolved_at,created_at",
      limit: 2_000,
      label: "briefing.holeObservations",
    }),
    directSelectList<Obligation>("obligations", {
      columns: "*",
      limit: 500,
      label: "briefing.obligations",
    }),
    directSelectList<ObligationCompletion>("obligation_completions", {
      columns: "*",
      limit: 2_000,
      label: "briefing.obligationCompletions",
    }),
    directSelectList<BriefingProfileSource>("profiles", {
      columns: "id,role,is_active",
      limit: 1_000,
      label: "briefing.profiles",
    }),
    directSelectList<Certification>("certifications", {
      columns: "*",
      limit: 1_000,
      label: "briefing.certifications",
    }),
    directSelectList<RawWorkOrder>("work_orders", {
      columns: "id,description_of_work,status,date_submitted,created_at,updated_at",
      limit: 2_000,
      label: "briefing.workOrders",
    }),
    directSelectList<{ id: string }>("restaurant_purchases", {
      columns: "id",
      limit: 2_000,
      label: "briefing.restaurantPurchases",
    }),
    directSelectList<{ id: string }>("inventory_items", {
      columns: "id",
      limit: 2_000,
      label: "briefing.inventoryItems",
    }),
    directSelectList<{ id: string }>("capital_projects", {
      columns: "id",
      limit: 1_000,
      label: "briefing.capitalProjects",
    }),
    directSelectList<{ id: string }>("staff_records", {
      columns: "id",
      limit: 2_000,
      label: "briefing.staffRecords",
    }),
  ]);

  return {
    revenueRollups: revenueRows.map((row) => ({
      month: row.month,
      category: row.category ?? "",
      total: numberOrNaN(row.total),
    })),
    prSpendRollups: prSpendRows.map((row) => ({
      month: row.month,
      cost_ctr: row.cost_ctr ?? null,
      total: numberOrNaN(row.total),
    })),
    budgetItems: budgetRows.map((row) => ({
      id: row.id,
      fiscal_year: numberOrNaN(row.fiscal_year),
      category: row.category,
      description: row.description,
      budgeted_amount: numberOrNaN(row.budgeted_amount),
      month: row.month === null ? null : numberOrNaN(row.month),
    })),
    purchaseRequests: purchaseRequests.map((row) => ({
      id: row.id,
      date_prepared: row.date_prepared,
      status: row.status,
      items: Array.isArray(row.items) ? row.items : [],
      ige_amount: numberOrNaN(row.ige_amount),
      actual_amount: nullableNumber(row.actual_amount),
    })),
    equipment: equipment.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      make: row.make,
      model: row.model,
      needs_parts_ordered: row.needs_parts_ordered,
      current_hours: nullableNumber(row.current_hours),
      service_interval_hours: nullableNumber(row.service_interval_hours),
      next_service_due_hours: nullableNumber(row.next_service_due_hours),
      next_service_due_date: row.next_service_due_date,
      triage_status: row.triage_status,
    })),
    holeObservations: observations.map((row) => ({
      id: row.id,
      hole_number: numberOrNaN(row.hole_number),
      issue_type: row.issue_type,
      priority: row.priority,
      status: row.status,
      title: row.title,
      resolved_at: row.resolved_at,
      created_at: row.created_at,
    })),
    obligations,
    obligationCompletions,
    profiles,
    certifications,
    workOrders: workOrders,
    restaurantPurchases,
    inventoryItems,
    capitalProjects,
    staffRecords,
  };
}

/** Fetch the approved sources, then hand them unchanged to the pure engine. */
export async function loadLeadershipBriefing(
  options: BuildBriefingOptions,
): Promise<BriefingData> {
  return buildBriefing(await loadBriefingSources(), options);
}
