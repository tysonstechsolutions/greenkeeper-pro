import type { EquipmentTriageStatus } from "@/types/database";
import type { Certification } from "@/lib/people/certs";
import type {
  Obligation,
  ObligationCompletion,
} from "@/lib/operations/types";
import type {
  RevenueRollupRow,
  SpendRollupRow,
} from "@/lib/money/area-pnl";
import type {
  BudgetItem,
  Equipment,
  HoleObservation,
  Profile,
  PurchaseRequest,
} from "@/types/database";

export const PR_COMMITTED_ORDERED_SPEND_LABEL =
  "PR committed/ordered spend" as const;

export type BriefingPeriodKind = "monthly" | "quarterly";

export type BriefingAvailability =
  | "recorded"
  | "not_recorded"
  | "insufficient_history";

export const BRIEFING_AVAILABILITY_LABELS: Record<
  BriefingAvailability,
  string
> = {
  recorded: "Recorded",
  not_recorded: "Not recorded",
  insufficient_history: "Insufficient history",
};

export type BriefingSourceId =
  | "revenue_monthly_rollup"
  | "pr_spend_monthly_rollup"
  | "budget_items"
  | "purchase_requests"
  | "equipment"
  | "equipment_readiness"
  | "equipment_triage"
  | "equipment_pm_status"
  | "hole_observations"
  | "obligations"
  | "obligation_completions"
  | "obligations_engine"
  | "profiles"
  | "certifications"
  | "certifications_engine"
  | "work_orders"
  | "restaurant_purchases"
  | "inventory_items"
  | "capital_projects"
  | "staff_records"
  | "briefing_engine";

export interface BriefingSourceAttribution {
  id: BriefingSourceId;
  label: string;
}

export interface BriefingFact<T> {
  value: T | null;
  availability: BriefingAvailability;
  availabilityLabel: string;
  source: BriefingSourceAttribution[];
  asOf: string;
  note?: string;
}

export interface BriefingSection<T> {
  data: T;
  availability: BriefingAvailability;
  availabilityLabel: string;
  source: BriefingSourceAttribution[];
  asOf: string;
  note?: string;
}

export interface BriefingPeriod {
  kind: BriefingPeriodKind;
  key: string;
  label: string;
  start: string;
  end: string;
  calendarEnd: string;
  isPartial: boolean;
  previous: {
    key: string;
    label: string;
    start: string;
    end: string;
  };
}

export interface BriefingMeta {
  period: BriefingPeriod;
  generatedAt: string;
  courseName: string;
  factsOnly: true;
}

export type ChangeDirection = "increased" | "decreased" | "unchanged";

export interface PeriodComparison {
  current: number;
  prior: number;
  absoluteChange: number;
  percentChange: number | null;
  direction: ChangeDirection;
  currentPeriod: string;
  priorPeriod: string;
  note?: string;
}

export interface BriefingFinding {
  label: string;
  detail: string;
  source: BriefingSourceAttribution[];
  asOf: string;
}

export interface AtAGlanceSection {
  improved: BriefingFact<BriefingFinding[]>;
  worsened: BriefingFact<BriefingFinding[]>;
  overdue: BriefingFact<BriefingFinding[]>;
  equipmentDown: BriefingFact<BriefingFinding[]>;
  prCommittedOrderedSpend: BriefingFact<BriefingFinding[]>;
  decisionsNeeded: BriefingFact<BriefingFinding[]>;
  supportNeeded: BriefingFact<BriefingFinding[]>;
}

export interface ExecutiveSection {
  headline: BriefingFact<string>;
}

export interface MoneyCategoryAmount {
  category: string;
  amount: number;
}

export interface MoneyMonthAmount {
  month: string;
  amount: number;
}

export interface BudgetLineAmount {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  month: number | null;
  fiscalYear: number;
}

export interface BudgetSpendPosition {
  budget: number;
  prCommittedOrderedSpend: number;
  remaining: number;
  percentUsed: number | null;
  label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
}

export interface PrReconciliationVariance {
  purchaseRequestId: string;
  submittedAmount: number;
  recordedReceiptAmount: number;
  dollarVariance: number;
  percentVariance: number | null;
  tone: "ok" | "warn" | "over";
}

export interface FinancialSection {
  revenueTotal: BriefingFact<number>;
  revenueByCategory: BriefingFact<MoneyCategoryAmount[]>;
  revenueTrend: BriefingFact<MoneyMonthAmount[]>;
  revenuePeriodComparison: BriefingFact<PeriodComparison>;
  revenueYearOverYear: BriefingFact<PeriodComparison>;
  prCommittedOrderedSpendTotal: BriefingFact<number> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  prSpendByCostCenter: BriefingFact<MoneyCategoryAmount[]> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  prSpendPeriodComparison: BriefingFact<PeriodComparison> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  budgetByLine: BriefingFact<BudgetLineAmount[]>;
  periodBudgetTotal: BriefingFact<number>;
  prSpendAgainstBudget: BriefingFact<BudgetSpendPosition> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  prBudgetUtilizationComparison: BriefingFact<PeriodComparison> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  reconciliationVariances: BriefingFact<PrReconciliationVariance[]>;
}

export interface EquipmentAttentionUnit {
  id: string;
  name: string;
  status: string;
  triageStatus: EquipmentTriageStatus | null;
  triageLabel: string;
}

export interface EquipmentSection {
  total: BriefingFact<number>;
  operational: BriefingFact<number>;
  down: BriefingFact<number>;
  waitingParts: BriefingFact<number>;
  needsService: BriefingFact<number>;
  attentionUnits: BriefingFact<EquipmentAttentionUnit[]>;
  pmNote: BriefingFact<string>;
  downPeriodComparison: BriefingFact<PeriodComparison>;
}

export interface CountByLabel {
  label: string;
  count: number;
}

export interface CoursePriorityIssue {
  id: string;
  holeNumber: number;
  title: string;
  priority: string;
  issueType: string;
}

export interface CourseSection {
  openIssues: BriefingFact<number>;
  resolvedThisPeriod: BriefingFact<number>;
  byCategory: BriefingFact<CountByLabel[]>;
  byHole: BriefingFact<CountByLabel[]>;
  topPriority: BriefingFact<CoursePriorityIssue[]>;
  openIssuePeriodComparison: BriefingFact<PeriodComparison>;
}

export interface ProcurementItem {
  id: string;
  status: string;
  datePrepared: string;
  submittedAmount: number | null;
}

export interface ProcurementSection {
  prCountByStatus: BriefingFact<CountByLabel[]>;
  openPRs: BriefingFact<ProcurementItem[]>;
  awaitingApproval: BriefingFact<ProcurementItem[]>;
  prCommittedOrderedSpend: BriefingFact<number> & {
    label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
  };
  reconciliationVariances: BriefingFact<PrReconciliationVariance[]>;
}

export interface StaffingSection {
  activeHeadcount: BriefingFact<number>;
  byRole: BriefingFact<CountByLabel[]>;
  vacancies: BriefingFact<number>;
  certificationsExpiring: BriefingFact<
    Array<{
      id: string;
      holder: string;
      certification: string;
      status: "expired" | "expiring";
      daysUntil: number;
    }>
  >;
  trainingRecords: BriefingFact<number>;
}

export interface ComplianceItem {
  id: string;
  title: string;
  dueDate: string;
  daysUntil: number;
  status: "overdue" | "due_soon";
}

export interface ComplianceSection {
  overdue: BriefingFact<ComplianceItem[]>;
  dueSoon: BriefingFact<ComplianceItem[]>;
  overduePeriodComparison: BriefingFact<PeriodComparison>;
}

export interface WorkOrderSummary {
  open: BriefingFact<number>;
  agedOpen: BriefingFact<number>;
  agedOpenItems: BriefingFact<
    Array<{
      id: string;
      description: string;
      submittedDate: string;
    }>
  >;
  openPeriodComparison: BriefingFact<PeriodComparison>;
}

export interface AvailabilityOnlySection {
  recordCount: BriefingFact<number>;
}

export interface RisksSection {
  items: BriefingFact<BriefingFinding[]>;
}

export interface LeadershipAsksSection {
  decisionsNeeded: BriefingFact<BriefingFinding[]>;
  supportNeeded: BriefingFact<BriefingFinding[]>;
}

export interface BriefingData {
  meta: BriefingMeta;
  atAGlance: BriefingSection<AtAGlanceSection>;
  executive: BriefingSection<ExecutiveSection>;
  financial: BriefingSection<FinancialSection>;
  equipment: BriefingSection<EquipmentSection>;
  course: BriefingSection<CourseSection>;
  procurement: BriefingSection<ProcurementSection>;
  restaurant: BriefingSection<AvailabilityOnlySection>;
  proShop: BriefingSection<AvailabilityOnlySection>;
  staffing: BriefingSection<StaffingSection>;
  compliance: BriefingSection<ComplianceSection>;
  workOrders: BriefingSection<WorkOrderSummary>;
  projects: BriefingSection<AvailabilityOnlySection>;
  risks: BriefingSection<RisksSection>;
  leadershipAsks: BriefingSection<LeadershipAsksSection>;
}

export type BriefingEquipmentSource = Pick<
  Equipment,
  | "id"
  | "name"
  | "status"
  | "make"
  | "model"
  | "needs_parts_ordered"
  | "current_hours"
  | "service_interval_hours"
  | "next_service_due_hours"
  | "next_service_due_date"
  | "triage_status"
>;

export type BriefingHoleObservationSource = Pick<
  HoleObservation,
  | "id"
  | "hole_number"
  | "issue_type"
  | "priority"
  | "status"
  | "title"
  | "resolved_at"
  | "created_at"
>;

export type BriefingPurchaseRequestSource = Pick<
  PurchaseRequest,
  | "id"
  | "date_prepared"
  | "status"
  | "items"
  | "ige_amount"
  | "actual_amount"
>;

export type BriefingBudgetItemSource = Pick<
  BudgetItem,
  | "id"
  | "fiscal_year"
  | "category"
  | "description"
  | "budgeted_amount"
  | "month"
>;

export type BriefingProfileSource = Pick<Profile, "id" | "role" | "is_active">;

export interface BriefingWorkOrderSource {
  id: string;
  description_of_work: string;
  status: "draft" | "submitted" | "sent" | "completed";
  date_submitted: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefingPresenceSource {
  id: string;
}

export interface BriefingSources {
  revenueRollups: RevenueRollupRow[];
  prSpendRollups: SpendRollupRow[];
  budgetItems: BriefingBudgetItemSource[];
  purchaseRequests: BriefingPurchaseRequestSource[];
  equipment: BriefingEquipmentSource[];
  holeObservations: BriefingHoleObservationSource[];
  obligations: Obligation[];
  obligationCompletions: ObligationCompletion[];
  profiles: BriefingProfileSource[];
  certifications: Certification[];
  workOrders: BriefingWorkOrderSource[];
  restaurantPurchases: BriefingPresenceSource[];
  inventoryItems: BriefingPresenceSource[];
  capitalProjects: BriefingPresenceSource[];
  staffRecords: BriefingPresenceSource[];
}

export interface BuildBriefingOptions {
  asOf: string;
  generatedAt: string;
  courseName?: string;
  period?: {
    kind?: BriefingPeriodKind;
    anchor?: string;
  };
}
