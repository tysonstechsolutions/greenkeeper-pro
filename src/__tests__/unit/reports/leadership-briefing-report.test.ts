import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const text = vi.fn();
  const addPage = vi.fn();
  const jsPDF = vi.fn(function () {
    return {
      internal: { pageSize: { getWidth: () => 216, getHeight: () => 279 } },
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      text,
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      addPage,
      splitTextToSize: (content: string) => [content],
      getNumberOfPages: () => 1,
      setPage: vi.fn(),
      output: () => new Blob(["briefing"], { type: "application/pdf" }),
    };
  });
  return { text, addPage, jsPDF };
});

vi.mock("jspdf", () => ({ jsPDF: mocks.jsPDF }));

import { buildBriefing } from "@/lib/briefing/engine";
import { PR_COMMITTED_ORDERED_SPEND_LABEL, type BriefingSources } from "@/lib/briefing/types";
import { generateLeadershipBriefingReport } from "@/lib/reports/leadership-briefing-report";

function sources(): BriefingSources {
  return {
    revenueRollups: [{ month: "2026-09-01", category: "green_fees", total: 1500 }],
    prSpendRollups: [{ month: "2026-09-01", cost_ctr: "11000", total: 400 }],
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

describe("generateLeadershipBriefingReport", () => {
  beforeEach(() => {
    mocks.text.mockClear();
    mocks.addPage.mockClear();
    mocks.jsPDF.mockClear();
  });

  it("renders the selected BriefingData contract with exact labels and availability states", async () => {
    const briefing = buildBriefing(sources(), {
      asOf: "2026-09-30",
      generatedAt: "2026-09-30T17:00:00.000Z",
    });

    const report = generateLeadershipBriefingReport(briefing);
    const rendered = mocks.text.mock.calls
      .map(([content]) => (Array.isArray(content) ? content.join("\n") : String(content)))
      .join("\n");

    expect(report.filename).toBe("gm-leadership-briefing-2026-Q3.pdf");
    expect(report.blob.type).toBe("application/pdf");
    expect(rendered).toContain("GM Leadership Briefing");
    expect(rendered).toContain("Q3 2026");
    expect(rendered).toContain(PR_COMMITTED_ORDERED_SPEND_LABEL);
    expect(rendered).toContain("Not recorded");
    expect(rendered).toContain("Insufficient history");
    expect(rendered).toContain("$1,500.00");
    expect(rendered).toContain("$400.00");
    expect(rendered).not.toContain("$0.00");
    expect(mocks.addPage).toHaveBeenCalled();
  });

  it("uses the selected monthly period from BriefingData", () => {
    const briefing = buildBriefing(sources(), {
      asOf: "2026-09-30",
      generatedAt: "2026-09-30T17:00:00.000Z",
      period: { kind: "monthly", anchor: "2026-09-30" },
    });

    const report = generateLeadershipBriefingReport(briefing);
    const rendered = mocks.text.mock.calls
      .map(([content]) => (Array.isArray(content) ? content.join("\n") : String(content)))
      .join("\n");

    expect(report.filename).toBe("gm-leadership-briefing-2026-09.pdf");
    expect(rendered).toContain("September 2026");
    expect(rendered).toContain("2026-09-01 to 2026-09-30");
  });
});
