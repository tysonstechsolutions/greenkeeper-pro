import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const textCalls: Array<{
    content: string | string[];
    color: number[];
    font: string;
    style: string;
    size: number;
    page: number;
  }> = [];
  const addPage = vi.fn();
  const jsPDF = vi.fn(function () {
    let page = 1;
    let color = [0, 0, 0];
    let font = "helvetica";
    let style = "normal";
    let size = 16;
    return {
      internal: { pageSize: { getWidth: () => 216, getHeight: () => 279 } },
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setFont: vi.fn((nextFont: string, nextStyle: string) => {
        font = nextFont;
        style = nextStyle;
      }),
      setFontSize: vi.fn((nextSize: number) => {
        size = nextSize;
      }),
      setTextColor: vi.fn((...nextColor: number[]) => {
        color = nextColor;
      }),
      text: vi.fn((content: string | string[]) => {
        textCalls.push({
          content,
          color: [...color],
          font,
          style,
          size,
          page,
        });
      }),
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      addPage: vi.fn(() => {
        page += 1;
        addPage();
      }),
      splitTextToSize: (content: string) =>
        content.includes("PR-LONG-CONTINUATION")
          ? Array.from(
              { length: 120 },
              (_, index) => `PR-LONG-CONTINUATION row ${index + 1}`,
            )
          : [content],
      getNumberOfPages: () => page,
      setPage: vi.fn(),
      output: () => new Blob(["briefing"], { type: "application/pdf" }),
    };
  });
  return { textCalls, addPage, jsPDF };
});

vi.mock("jspdf", () => ({ jsPDF: mocks.jsPDF }));

import { buildBriefing } from "@/lib/briefing/engine";
import { PR_COMMITTED_ORDERED_SPEND_LABEL, type BriefingSources } from "@/lib/briefing/types";
import { generateLeadershipBriefingReport } from "@/lib/reports/leadership-briefing-report";

const BODY_TEXT_COLOR = [55, 65, 81];

function renderedText(): string {
  return mocks.textCalls
    .map(({ content }) => (Array.isArray(content) ? content.join("\n") : content))
    .join("\n");
}

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
    mocks.textCalls.splice(0);
    mocks.addPage.mockClear();
    mocks.jsPDF.mockClear();
  });

  it("renders the selected BriefingData contract with exact labels and availability states", async () => {
    const briefing = buildBriefing(sources(), {
      asOf: "2026-09-30",
      generatedAt: "2026-09-30T17:00:00.000Z",
    });

    const report = generateLeadershipBriefingReport(briefing);
    const rendered = renderedText();

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
    const rendered = renderedText();

    expect(report.filename).toBe("gm-leadership-briefing-2026-09.pdf");
    expect(rendered).toContain("September 2026");
    expect(rendered).toContain("2026-09-01 to 2026-09-30");
  });

  it("restores body styling for every batch of a long fact and continues later sections", () => {
    const longSources = sources();
    longSources.purchaseRequests = [
      {
        id: "PR-LONG-CONTINUATION",
        date_prepared: "2026-09-15",
        status: "approved",
        items: [],
        ige_amount: 125,
        actual_amount: null,
      },
    ];
    const briefing = buildBriefing(longSources, {
      asOf: "2026-09-30",
      generatedAt: "2026-09-30T17:00:00.000Z",
    });

    generateLeadershipBriefingReport(briefing);

    const continuationWrites = mocks.textCalls.filter(
      ({ content }) =>
        Array.isArray(content) &&
        content.some((line) => line.startsWith("PR-LONG-CONTINUATION row")),
    );
    expect(mocks.addPage).toHaveBeenCalled();
    expect(continuationWrites.length).toBeGreaterThan(1);
    for (const write of continuationWrites) {
      expect(write.font).toBe("helvetica");
      expect(write.style).toBe("normal");
      expect(write.size).toBe(8.5);
      expect(write.color).toEqual(BODY_TEXT_COLOR);
    }
    expect(renderedText()).toContain("Staffing");
  });
});
