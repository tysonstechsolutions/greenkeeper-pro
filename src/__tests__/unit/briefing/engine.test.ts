import { describe, expect, it } from "vitest";
import {
  AGED_WORK_ORDER_DAYS,
  buildBriefing,
  resolveBriefingPeriod,
} from "@/lib/briefing/engine";
import {
  PR_COMMITTED_ORDERED_SPEND_LABEL,
  type BriefingEquipmentSource,
  type BriefingHoleObservationSource,
  type BriefingPurchaseRequestSource,
  type BriefingSources,
  type BuildBriefingOptions,
} from "@/lib/briefing/types";
import type { Obligation, ObligationCompletion } from "@/lib/operations/types";
import type { Certification } from "@/lib/people/certs";

const OPTIONS: BuildBriefingOptions = {
  asOf: "2026-09-30",
  generatedAt: "2026-09-30T17:00:00.000Z",
};

function emptySources(): BriefingSources {
  return {
    revenueRollups: [],
    prSpendRollups: [],
    budgetItems: [],
    purchaseRequests: [],
    equipment: [],
    holeObservations: [],
    obligations: [],
    obligationCompletions: [],
    profiles: [],
    certifications: [],
    workOrders: [],
    restaurantPurchases: [],
    inventoryItems: [],
    capitalProjects: [],
    staffRecords: [],
  };
}

function equipment(
  id: string,
  overrides: Partial<BriefingEquipmentSource> = {},
): BriefingEquipmentSource {
  return {
    id,
    name: `Unit ${id}`,
    status: "operational",
    make: "Toro",
    model: "Workman",
    needs_parts_ordered: false,
    current_hours: null,
    service_interval_hours: null,
    next_service_due_hours: null,
    next_service_due_date: null,
    triage_status: null,
    ...overrides,
  };
}

function observation(
  id: string,
  overrides: Partial<BriefingHoleObservationSource> = {},
): BriefingHoleObservationSource {
  return {
    id,
    hole_number: 1,
    issue_type: "turf_thin",
    priority: "normal",
    status: "open",
    title: `Issue ${id}`,
    resolved_at: null,
    created_at: "2026-01-15T12:00:00.000Z",
    ...overrides,
  };
}

function purchaseRequest(
  id: string,
  overrides: Partial<BriefingPurchaseRequestSource> = {},
): BriefingPurchaseRequestSource {
  return {
    id,
    date_prepared: "2026-07-10",
    status: "approved",
    items: [
      {
        item: 1,
        site: "VMGC",
        cost_ctr: "11000",
        gl_acct: "6000",
        description: "Recorded item",
        qty: 1,
        unit: "ea",
        unit_price: 100,
      },
    ],
    ige_amount: 100,
    actual_amount: null,
    ...overrides,
  };
}

function obligation(): Obligation {
  return {
    id: "ob-1",
    slug: "monthly-check",
    title: "Monthly safety check",
    detail: null,
    workspace: "general",
    cadence: "monthly",
    due_day: 5,
    due_month: null,
    lead_days: 3,
    delegable: true,
    link_href: null,
    is_active: true,
    notes: null,
    sort_order: 0,
    created_at: "2026-05-01T12:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
  };
}

function completion(period: string, completedAt: string): ObligationCompletion {
  return {
    id: `completion-${period}`,
    obligation_id: "ob-1",
    period,
    completed_at: completedAt,
    completed_by: null,
    note: null,
  };
}

function certification(overrides: Partial<Certification> = {}): Certification {
  return {
    id: "cert-1",
    holder: "Recorded employee",
    profile_id: null,
    cert_name: "Safety certificate",
    license_number: null,
    issued_date: null,
    expires_date: "2026-08-01",
    document_path: null,
    notes: null,
    is_active: true,
    created_at: "2026-01-01T12:00:00.000Z",
    updated_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("GM leadership briefing periods", () => {
  it("defaults to the current calendar quarter and retains the prior quarter", () => {
    expect(
      resolveBriefingPeriod({
        asOf: "2026-07-13",
        generatedAt: "2026-07-13T12:00:00.000Z",
      }),
    ).toEqual({
      kind: "quarterly",
      key: "2026-Q3",
      label: "Q3 2026",
      start: "2026-07-01",
      end: "2026-07-13",
      calendarEnd: "2026-09-30",
      isPartial: true,
      previous: {
        key: "2026-Q2",
        label: "Q2 2026",
        start: "2026-04-01",
        end: "2026-06-30",
      },
    });
  });

  it("supports a full historical calendar month", () => {
    const period = resolveBriefingPeriod({
      asOf: "2026-07-13",
      generatedAt: "2026-07-13T12:00:00.000Z",
      period: { kind: "monthly", anchor: "2026-06-10" },
    });

    expect(period).toMatchObject({
      kind: "monthly",
      key: "2026-06",
      label: "June 2026",
      start: "2026-06-01",
      end: "2026-06-30",
      calendarEnd: "2026-06-30",
      isPartial: false,
      previous: {
        key: "2026-05",
        start: "2026-05-01",
        end: "2026-05-31",
      },
    });
  });
});

describe("GM leadership briefing availability rules", () => {
  it("keeps empty and thin sources explicit instead of fabricating numeric zeros", () => {
    const result = buildBriefing(emptySources(), OPTIONS);

    expect(result.financial.data.revenueTotal).toMatchObject({
      value: null,
      availability: "not_recorded",
      availabilityLabel: "Not recorded",
    });
    expect(result.financial.data.prCommittedOrderedSpendTotal.value).toBeNull();
    expect(result.equipment.data.down.value).toBeNull();
    expect(result.staffing.data.activeHeadcount.value).toBeNull();
    expect(result.staffing.data.vacancies.value).toBeNull();
    expect(result.financial.data.revenueYearOverYear.value).toBeNull();
    expect(result.executive.data.headline.value).toBeNull();

    assertUnavailableFactsAreNull(result);
  });

  it("allows zero only when a rollup source explicitly recorded zero", () => {
    const sources = emptySources();
    sources.revenueRollups = [
      { month: "2026-07-01", category: "green_fees", total: 0 },
    ];
    sources.prSpendRollups = [
      { month: "2026-07-01", cost_ctr: "11000", total: 0 },
    ];

    const result = buildBriefing(sources, OPTIONS);

    expect(result.financial.data.revenueTotal).toMatchObject({
      value: 0,
      availability: "recorded",
    });
    expect(result.financial.data.prCommittedOrderedSpendTotal).toMatchObject({
      value: 0,
      availability: "recorded",
    });
  });

  it("does not compare a current value when the prior period has no record", () => {
    const sources = emptySources();
    sources.revenueRollups = [
      { month: "2026-07-01", category: "green_fees", total: 100 },
    ];

    const result = buildBriefing(sources, OPTIONS);

    expect(result.financial.data.revenuePeriodComparison).toMatchObject({
      value: null,
      availability: "insufficient_history",
      availabilityLabel: "Insufficient history",
    });
    expect(result.financial.data.revenueYearOverYear.availability).toBe(
      "insufficient_history",
    );
  });

  it("omits percentage change when the recorded prior baseline is zero", () => {
    const sources = emptySources();
    sources.revenueRollups = [
      { month: "2026-04-01", category: "green_fees", total: 0 },
      { month: "2026-07-01", category: "green_fees", total: 100 },
    ];

    const comparison = buildBriefing(sources, OPTIONS).financial.data
      .revenuePeriodComparison;

    expect(comparison.availability).toBe("recorded");
    expect(comparison.value).toMatchObject({
      current: 100,
      prior: 0,
      absoluteChange: 100,
      percentChange: null,
      direction: "increased",
    });
  });

  it("does not allocate annual budget lines into a month or quarter", () => {
    const sources = emptySources();
    sources.prSpendRollups = [
      { month: "2026-07-01", cost_ctr: "11000", total: 500 },
    ];
    sources.budgetItems = [
      {
        id: "annual-budget",
        fiscal_year: 2026,
        category: "supplies",
        description: "Annual supplies",
        budgeted_amount: 12_000,
        month: null,
      },
    ];

    const financial = buildBriefing(sources, OPTIONS).financial.data;

    expect(financial.budgetByLine.availability).toBe("recorded");
    expect(financial.periodBudgetTotal.availability).toBe(
      "insufficient_history",
    );
    expect(financial.prSpendAgainstBudget.value).toBeNull();
  });
});

describe("GM leadership briefing financial and wording rules", () => {
  it("computes recorded period comparisons and uses the exact PR label", () => {
    const sources = emptySources();
    sources.revenueRollups = [
      { month: "2026-04-01", category: "green_fees", total: 1_000 },
      { month: "2026-07-01", category: "green_fees", total: 1_500 },
    ];
    sources.prSpendRollups = [
      { month: "2026-04-01", cost_ctr: "11000", total: 3_000 },
      { month: "2026-07-01", cost_ctr: "11000", total: 4_000 },
    ];
    sources.budgetItems = [
      ...[4, 5, 6].map((month) => ({
        id: `prior-${month}`,
        fiscal_year: 2026,
        category: "supplies" as const,
        description: null,
        budgeted_amount: 2_000,
        month,
      })),
      ...[7, 8, 9].map((month) => ({
        id: `current-${month}`,
        fiscal_year: 2026,
        category: "supplies" as const,
        description: null,
        budgeted_amount: 2_000,
        month,
      })),
    ];

    const result = buildBriefing(sources, OPTIONS);
    const financial = result.financial.data;

    expect(financial.revenuePeriodComparison.value).toMatchObject({
      current: 1_500,
      prior: 1_000,
      absoluteChange: 500,
      percentChange: 50,
      direction: "increased",
    });
    expect(financial.prBudgetUtilizationComparison.value).toMatchObject({
      current: 66.67,
      prior: 50,
      direction: "increased",
    });
    expect(
      result.atAGlance.data.worsened.value?.map((item) => item.label),
    ).toContain(`${PR_COMMITTED_ORDERED_SPEND_LABEL} budget utilization`);

    expect(financial.prCommittedOrderedSpendTotal.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(financial.prSpendByCostCenter.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(financial.prSpendPeriodComparison.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(financial.prSpendAgainstBudget.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(financial.prBudgetUtilizationComparison.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(result.procurement.data.prCommittedOrderedSpend.label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );
    expect(result.atAGlance.data.prCommittedOrderedSpend.value?.[0].label).toBe(
      PR_COMMITTED_ORDERED_SPEND_LABEL,
    );

    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("actual expenses");
    expect(serialized).not.toContain("paid expenses");
    expect(serialized).not.toContain("general-ledger actual");
  });

  it("uses the existing PR variance math without describing receipt amounts as expenses", () => {
    const sources = emptySources();
    sources.purchaseRequests = [
      purchaseRequest("pr-1", {
        status: "received",
        ige_amount: 100,
        actual_amount: 120,
      }),
    ];

    const variances = buildBriefing(sources, OPTIONS).financial.data
      .reconciliationVariances;

    expect(variances.availability).toBe("recorded");
    expect(variances.value).toEqual([
      {
        purchaseRequestId: "pr-1",
        submittedAmount: 100,
        recordedReceiptAmount: 120,
        dollarVariance: 20,
        percentVariance: 20,
        tone: "over",
      },
    ]);
  });
});

describe("GM leadership briefing operational source rules", () => {
  it("counts course conditions only from hole observations and reconstructs a prior snapshot", () => {
    const sources = emptySources();
    sources.holeObservations = [
      observation("still-open", {
        hole_number: 4,
        issue_type: "irrigation_issue",
        priority: "critical",
      }),
      observation("resolved-in-quarter", {
        hole_number: 7,
        issue_type: "bunker_issue",
        status: "resolved",
        resolved_at: "2026-07-20T12:00:00.000Z",
      }),
    ];

    const result = buildBriefing(sources, OPTIONS);

    expect(result.course.data.openIssues.value).toBe(1);
    expect(result.course.data.resolvedThisPeriod.value).toBe(1);
    expect(result.course.data.openIssuePeriodComparison.value).toMatchObject({
      current: 1,
      prior: 2,
      absoluteChange: -1,
      direction: "decreased",
    });
    expect(result.course.data.byCategory.value).toEqual([
      { label: "irrigation_issue", count: 1 },
    ]);
    expect(result.course.data.openIssues.source.map((item) => item.id)).toEqual([
      "hole_observations",
    ]);
    expect(result.atAGlance.data.improved.value?.[0].label).toBe(
      "Open course issues",
    );
  });

  it("reuses equipment readiness, triage, and safe-PM rules without inferring maintenance facts", () => {
    const sources = emptySources();
    sources.equipment = [
      equipment("up"),
      equipment("down", {
        status: "in_repair",
        needs_parts_ordered: true,
        triage_status: "waiting_on_parts",
      }),
      equipment("retired", { status: "retired" }),
    ];

    const result = buildBriefing(sources, OPTIONS);

    expect(result.equipment.data.total.value).toBe(2);
    expect(result.equipment.data.operational.value).toBe(1);
    expect(result.equipment.data.down.value).toBe(1);
    expect(result.equipment.data.waitingParts.value).toBe(1);
    expect(result.equipment.data.attentionUnits.value?.[0]).toMatchObject({
      id: "down",
      triageStatus: "waiting_on_parts",
      triageLabel: "Waiting on parts",
    });
    expect(result.equipment.data.pmNote).toMatchObject({
      value: null,
      availability: "not_recorded",
    });
    expect(result.equipment.data.downPeriodComparison.availability).toBe(
      "insufficient_history",
    );
    expect(result.atAGlance.data.equipmentDown.value?.[0].detail).toContain(
      "1 equipment unit is down",
    );
  });

  it("uses the obligations engine for reconstructable overdue comparisons", () => {
    const sources = emptySources();
    sources.obligations = [obligation()];
    sources.obligationCompletions = [
      completion("2026-05", "2026-05-04T12:00:00.000Z"),
      completion("2026-06", "2026-06-04T12:00:00.000Z"),
    ];

    const result = buildBriefing(
      sources,
      {
        ...OPTIONS,
        asOf: "2026-07-13",
        generatedAt: "2026-07-13T17:00:00.000Z",
      },
    );

    expect(result.compliance.data.overdue.value).toHaveLength(1);
    expect(result.compliance.data.overdue.value?.[0]).toMatchObject({
      id: "ob-1",
      status: "overdue",
    });
    expect(result.compliance.data.overduePeriodComparison.value).toMatchObject({
      current: 1,
      prior: 0,
      absoluteChange: 1,
      percentChange: null,
      direction: "increased",
    });
    expect(result.atAGlance.data.worsened.value?.map((item) => item.label)).toContain(
      "Overdue compliance obligations",
    );
  });

  it("reports active headcount only and never infers vacancies", () => {
    const sources = emptySources();
    sources.profiles = [
      { id: "active", role: "crew", is_active: true },
      { id: "inactive", role: "crew", is_active: false },
    ];
    sources.certifications = [certification()];

    const staffing = buildBriefing(sources, OPTIONS).staffing.data;

    expect(staffing.activeHeadcount.value).toBe(1);
    expect(staffing.byRole.value).toEqual([{ label: "crew", count: 1 }]);
    expect(staffing.vacancies).toMatchObject({
      value: null,
      availability: "not_recorded",
    });
    expect(staffing.certificationsExpiring.value?.[0].status).toBe("expired");
  });

  it("marks current aged work orders but leaves the period comparison unavailable", () => {
    const sources = emptySources();
    sources.workOrders = [
      {
        id: "wo-open",
        description_of_work: "Repair recorded door issue",
        status: "submitted",
        date_submitted: "2026-07-01",
        created_at: "2026-07-01T12:00:00.000Z",
        updated_at: "2026-07-01T12:00:00.000Z",
      },
      {
        id: "wo-complete",
        description_of_work: "Completed item",
        status: "completed",
        date_submitted: "2026-09-20",
        created_at: "2026-09-20T12:00:00.000Z",
        updated_at: "2026-09-25T12:00:00.000Z",
      },
    ];

    const workOrders = buildBriefing(sources, OPTIONS).workOrders.data;

    expect(AGED_WORK_ORDER_DAYS).toBe(30);
    expect(workOrders.open.value).toBe(1);
    expect(workOrders.agedOpen.value).toBe(1);
    expect(workOrders.openPeriodComparison.availability).toBe(
      "insufficient_history",
    );
  });

  it("adds deterministic decision and support findings only from recorded facts", () => {
    const sources = emptySources();
    sources.holeObservations = [
      observation("critical", { priority: "critical" }),
    ];
    sources.equipment = [
      equipment("parts", {
        status: "in_repair",
        triage_status: "waiting_on_parts",
      }),
    ];
    sources.purchaseRequests = [
      purchaseRequest("approval", { status: "submitted" }),
    ];

    const result = buildBriefing(sources, OPTIONS);

    expect(
      result.leadershipAsks.data.decisionsNeeded.value?.map(
        (item) => item.label,
      ),
    ).toContain("Prioritize course issues");
    expect(
      result.leadershipAsks.data.supportNeeded.value?.map((item) => item.label),
    ).toEqual(["Equipment repair support", "Purchase-request approvals"]);
  });
});

describe("GM leadership briefing attribution contract", () => {
  it("attributes every section and every fact to its application source", () => {
    const result = buildBriefing(emptySources(), OPTIONS);
    const sections = Object.entries(result).filter(([key]) => key !== "meta");

    for (const [name, value] of sections) {
      expect(value.source, `${name} section sources`).not.toHaveLength(0);
      expect(value.asOf, `${name} section asOf`).toBe(OPTIONS.asOf);
    }

    assertAllFactsHaveSources(result);
  });
});

function assertUnavailableFactsAreNull(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("availability" in record && "value" in record) {
    if (record.availability !== "recorded") expect(record.value).toBeNull();
  }
  for (const child of Object.values(record)) assertUnavailableFactsAreNull(child);
}

function assertAllFactsHaveSources(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("availability" in record && "value" in record) {
    expect(Array.isArray(record.source)).toBe(true);
    expect(record.source).not.toHaveLength(0);
    expect(record.asOf).toBe(OPTIONS.asOf);
  }
  for (const child of Object.values(record)) assertAllFactsHaveSources(child);
}
