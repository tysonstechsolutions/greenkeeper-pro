/**
 * Final-PDF adapters for a GM-approved leadership briefing.
 *
 * Approval is a caller-provided explicit action from the review screen. This
 * module enforces that gate for both export and saved-document actions while
 * keeping the PDF itself a pure BriefingData render.
 */
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import {
  generateLeadershipBriefingReport,
  leadershipBriefingFilename,
  type LeadershipBriefingPdf,
} from "@/lib/reports/leadership-briefing-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import type { BriefingData } from "./types";

export class BriefingApprovalRequiredError extends Error {
  constructor() {
    super("Explicit GM approval is required before exporting or saving this briefing.");
    this.name = "BriefingApprovalRequiredError";
  }
}

export interface ApprovedBriefingDocument {
  docType: "leadership_briefing";
  title: string;
  filename: string;
  meta: Record<string, unknown>;
}

export function approvedBriefingDocumentDetails(
  briefing: BriefingData,
): ApprovedBriefingDocument {
  return {
    docType: "leadership_briefing",
    title: `GM Leadership Briefing — ${briefing.meta.period.label}`,
    filename: leadershipBriefingFilename(briefing),
    meta: {
      reporting_period: {
        key: briefing.meta.period.key,
        label: briefing.meta.period.label,
        kind: briefing.meta.period.kind,
        start: briefing.meta.period.start,
        end: briefing.meta.period.end,
      },
      generated_at: briefing.meta.generatedAt,
      facts_only: briefing.meta.factsOnly,
      approval_required: true,
    },
  };
}

export function approvedBriefingPdf(
  briefing: BriefingData,
  approved: boolean,
): LeadershipBriefingPdf {
  assertApproved(approved);
  return generateLeadershipBriefingReport(briefing);
}

export async function exportApprovedBriefing(
  briefing: BriefingData,
  approved: boolean,
): Promise<LeadershipBriefingPdf> {
  const pdf = approvedBriefingPdf(briefing, approved);
  await saveBlobToDevice({
    blob: pdf.blob,
    filename: pdf.filename,
    shareTitle: "GM Leadership Briefing",
  });
  return pdf;
}

export async function saveApprovedBriefing(
  briefing: BriefingData,
  approved: boolean,
): Promise<{ documentId: string | null; pdf: LeadershipBriefingPdf }> {
  const pdf = approvedBriefingPdf(briefing, approved);
  const details = approvedBriefingDocumentDetails(briefing);
  const documentId = await saveCreatedDocument({
    docType: details.docType,
    title: details.title,
    blob: pdf.blob,
    filename: details.filename,
    meta: details.meta,
  });
  return { documentId, pdf };
}

function assertApproved(approved: boolean): void {
  if (!approved) throw new BriefingApprovalRequiredError();
}
