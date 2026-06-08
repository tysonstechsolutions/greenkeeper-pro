/**
 * Download helpers for audited PRs, so the reviewer can sign and send them up.
 *
 * The thing he signs is the PURCHASE REQUEST itself:
 *   • If the PR was uploaded, that's the original file (PDF/photo).
 *   • If it was entered by hand (no file), we generate a one-page PDF summary
 *     with the line items, codes, total, audit result, and a signature line.
 *
 * `downloadApprovedBundle` zips up every approved PR for sending up in one go.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import type { PrAudit } from "@/types/database";
import { guessExt, prAuditFilename } from "@/lib/pr-audit/filename";

const STORAGE_BUCKET = "vendor-files";

// ── Browser download trigger ──────────────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ── Summary PDF (for manually-entered PRs with no original file) ───────────────

/** Build a one-page signable PDF summary of an audited PR. */
export function generateSummaryPdf(audit: PrAudit): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 48;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Purchase Request — Audit Summary", left, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const headerLines = [
    `Vendor: ${audit.vendor_name || "—"}`,
    `Date prepared: ${audit.pr_date || "—"}`,
    `Requestor: ${audit.requestor_name || "—"}`,
    `Internal order: ${audit.internal_order || "—"}`,
  ];
  for (const line of headerLines) {
    doc.text(line, left, y);
    y += 15;
  }

  const status =
    audit.audit_error_count === 0 && audit.audit_warning_count === 0
      ? "Passed all checks"
      : `${audit.audit_error_count} error(s), ${audit.audit_warning_count} warning(s)`;
  doc.setFont("helvetica", "bold");
  doc.text(`Audit: ${status}`, left, y);
  y += 18;

  autoTable(doc, {
    startY: y,
    head: [["#", "Site", "Cost Ctr", "G/L", "Description", "Qty", "Unit Price", "Extended"]],
    body: (audit.items ?? []).map((it, i) => [
      String(i + 1),
      it.site || "—",
      it.cost_ctr || "—",
      it.gl_acct || "—",
      it.description || "—",
      String(it.qty ?? ""),
      money(Number(it.unit_price) || 0),
      money((Number(it.qty) || 0) * (Number(it.unit_price) || 0)),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 90] },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
  });

  // jspdf-autotable records where the table ended.
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + 20;
  let ty = finalY + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total: ${money(Number(audit.computed_total) || 0)}`, left, ty);
  ty += 40;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Approved & signed: ______________________________", left, ty);
  doc.text("Date: ________________", left + 320, ty);

  return doc.output("blob");
}

// ── Downloads ─────────────────────────────────────────────────────────────────

/** Fetch the blob to sign for one PR: the original file, or a summary PDF. */
async function blobForAudit(
  audit: PrAudit,
): Promise<{ blob: Blob; ext: string }> {
  if (audit.file_path) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(audit.file_path);
    if (error || !data) {
      throw new Error(error?.message || "Couldn't fetch the original file.");
    }
    return { blob: data, ext: guessExt(audit.file_name, data.type) };
  }
  return { blob: generateSummaryPdf(audit), ext: "pdf" };
}

/** Download a single PR (original file, or generated summary) to sign. */
export async function downloadOriginalFile(audit: PrAudit): Promise<void> {
  const { blob, ext } = await blobForAudit(audit);
  triggerBlobDownload(blob, prAuditFilename(audit, ext));
}

export interface BundleResult {
  count: number;
  warnings: string[];
}

/**
 * Zip every approved PR into one download. Each PR contributes its original
 * file (or a generated summary). Files that fail to fetch become warnings so
 * the rest still bundle.
 */
export async function downloadApprovedBundle(
  audits: PrAudit[],
  todayIso: string,
): Promise<BundleResult> {
  const approved = audits.filter((a) => a.review_status === "approved");
  const warnings: string[] = [];
  if (approved.length === 0) {
    return { count: 0, warnings: ["No approved PRs to download yet."] };
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let count = 0;

  for (const audit of approved) {
    try {
      const { blob, ext } = await blobForAudit(audit);
      let name = prAuditFilename(audit, ext);
      // De-dup identical names (same vendor + date).
      if (usedNames.has(name)) {
        name = name.replace(new RegExp(`\\.${ext}$`), ` (${count + 1}).${ext}`);
      }
      usedNames.add(name);
      zip.file(name, blob);
      count++;
    } catch (err) {
      warnings.push(
        `${audit.vendor_name || "A PR"} (${audit.pr_date}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (count === 0) {
    return { count: 0, warnings };
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(blob, `PR Audit - Approved - ${todayIso}.zip`);
  return { count, warnings };
}
