import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(() => ({
    blob: new Blob(["approved"], { type: "application/pdf" }),
    filename: "gm-leadership-briefing-2026-Q3.pdf",
  })),
  saveCreatedDocument: vi.fn(async (): Promise<string | null> => "created-briefing-id"),
  saveBlobToDevice: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reports/leadership-briefing-report", () => ({
  generateLeadershipBriefingReport: mocks.generate,
  leadershipBriefingFilename: () => "gm-leadership-briefing-2026-Q3.pdf",
}));
vi.mock("@/lib/documents/saved-documents", () => ({
  saveCreatedDocument: mocks.saveCreatedDocument,
}));
vi.mock("@/lib/utils/download-blob", () => ({
  saveBlobToDevice: mocks.saveBlobToDevice,
}));

import { buildBriefing } from "@/lib/briefing/engine";
import {
  BriefingApprovalRequiredError,
  BriefingSaveFailedError,
  approvedBriefingDocumentDetails,
  exportApprovedBriefing,
  saveApprovedBriefing,
} from "@/lib/briefing/approved-document";
import type { BriefingSources } from "@/lib/briefing/types";

function briefing() {
  const sources: BriefingSources = {
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
  return buildBriefing(sources, {
    asOf: "2026-09-30",
    generatedAt: "2026-09-30T17:00:00.000Z",
  });
}

describe("approved leadership briefing documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockReturnValue({
      blob: new Blob(["approved"], { type: "application/pdf" }),
      filename: "gm-leadership-briefing-2026-Q3.pdf",
    });
    mocks.saveCreatedDocument.mockResolvedValue("created-briefing-id");
    mocks.saveBlobToDevice.mockResolvedValue(undefined);
  });

  it("requires explicit approval before final PDF export or save", async () => {
    const data = briefing();

    await expect(saveApprovedBriefing(data, false)).rejects.toBeInstanceOf(
      BriefingApprovalRequiredError,
    );
    await expect(exportApprovedBriefing(data, false)).rejects.toBeInstanceOf(
      BriefingApprovalRequiredError,
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.saveCreatedDocument).not.toHaveBeenCalled();
    expect(mocks.saveBlobToDevice).not.toHaveBeenCalled();
  });

  it("saves the approved PDF with document type and reporting-period metadata", async () => {
    const data = briefing();
    const result = await saveApprovedBriefing(data, true);

    expect(result.documentId).toBe("created-briefing-id");
    expect(mocks.generate).toHaveBeenCalledWith(data);
    expect(mocks.saveCreatedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        docType: "leadership_briefing",
        title: "GM Leadership Briefing — Q3 2026",
        filename: "gm-leadership-briefing-2026-Q3.pdf",
        meta: expect.objectContaining({
          reporting_period: {
            key: "2026-Q3",
            label: "Q3 2026",
            kind: "quarterly",
            start: "2026-07-01",
            end: "2026-09-30",
          },
          facts_only: true,
          approval_required: true,
        }),
      }),
    );
  });

  it("reports a failed save when the shared persistence workflow returns no document id", async () => {
    mocks.saveCreatedDocument.mockResolvedValueOnce(null);

    await expect(saveApprovedBriefing(briefing(), true)).rejects.toBeInstanceOf(
      BriefingSaveFailedError,
    );
  });

  it("exports the approved PDF built from the supplied BriefingData", async () => {
    const data = briefing();
    const result = await exportApprovedBriefing(data, true);

    expect(result.filename).toBe("gm-leadership-briefing-2026-Q3.pdf");
    expect(mocks.saveBlobToDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "gm-leadership-briefing-2026-Q3.pdf",
        shareTitle: "GM Leadership Briefing",
      }),
    );
  });

  it("keeps only approved document metadata, not a new briefing snapshot", () => {
    const details = approvedBriefingDocumentDetails(briefing());

    expect(details.meta).toEqual({
      reporting_period: {
        key: "2026-Q3",
        label: "Q3 2026",
        kind: "quarterly",
        start: "2026-07-01",
        end: "2026-09-30",
      },
      generated_at: "2026-09-30T17:00:00.000Z",
      facts_only: true,
      approval_required: true,
    });
  });
});
