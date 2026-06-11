/**
 * Download helpers for audited PRs, so the reviewer can sign and send them up.
 *
 * The thing he signs is the PURCHASE REQUEST itself:
 *   • If the PR was uploaded, that's the original file (PDF/photo).
 *   • If it was entered by hand (no file), we generate a one-page PDF summary
 *     with the line items, codes, total, audit result, and a signature line.
 *
 * `downloadBundle` zips up the given PRs for sending up in one go.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { directSelectRow } from "@/lib/supabase/rest";
import type { PrAudit, PurchaseRequest } from "@/types/database";
import { guessExt, prAuditFilename, prAuditBaseName } from "@/lib/pr-audit/filename";

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

/** Fetch a single stored file from the vendor-files bucket. */
async function fetchStored(path: string): Promise<Blob> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Couldn't fetch the file.");
  }
  return data;
}

/** Download one stored attachment (e.g. the quote or 889) by path. */
export async function downloadStoredFile(path: string, filename: string): Promise<void> {
  const blob = await fetchStored(path);
  triggerBlobDownload(blob, filename);
}

export interface AuditPreview {
  blob: Blob;
  kind: "pdf" | "image";
  filename: string;
}

function previewKind(name: string | null, mime?: string): "pdf" | "image" {
  const ext = (name || "").toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return (mime || "").toLowerCase().startsWith("image/") ? "image" : "pdf";
}

/**
 * Resolve the document to PREVIEW for an audited PR:
 *   • the uploaded file (PDF or photo),
 *   • the regenerated PR PDF for an imported/built PR, or
 *   • the generated summary PDF for a manual entry.
 */
export async function getAuditPreviewBlob(audit: PrAudit): Promise<AuditPreview> {
  if (audit.file_path) {
    const blob = await fetchStored(audit.file_path);
    return {
      blob,
      kind: previewKind(audit.file_name, blob.type),
      filename: prAuditFilename(audit, guessExt(audit.file_name, blob.type)),
    };
  }
  if (audit.purchase_request_id) {
    const pr = await directSelectRow<PurchaseRequest>(
      "purchase_requests",
      "id",
      audit.purchase_request_id,
      "*",
      "pr-audit.preview.linkedPr",
    );
    if (pr) {
      // Lazy-load the heavy PDF generator only when previewing a built PR.
      const { generatePurchaseRequestReport } = await import(
        "@/lib/reports/purchase-request-report"
      );
      const blob = await generatePurchaseRequestReport(pr);
      return { blob, kind: "pdf", filename: prAuditFilename(audit, "pdf") };
    }
  }
  return {
    blob: generateSummaryPdf(audit),
    kind: "pdf",
    filename: prAuditFilename(audit, "pdf"),
  };
}

/**
 * Fetch the blob to sign for one PR: the original file, the regenerated PR
 * form for an imported/built PR, or a generated summary PDF.
 */
async function blobForAudit(
  audit: PrAudit,
): Promise<{ blob: Blob; ext: string }> {
  if (audit.file_path) {
    return { blob: await fetchStored(audit.file_path), ext: guessExt(audit.file_name, "") };
  }
  if (audit.purchase_request_id) {
    try {
      const pr = await directSelectRow<PurchaseRequest>(
        "purchase_requests",
        "id",
        audit.purchase_request_id,
        "*",
        "pr-audit.download.linkedPr",
      );
      if (pr) {
        // Lazy-load the heavy PDF generator only when a built PR needs it.
        const { generatePurchaseRequestReport } = await import(
          "@/lib/reports/purchase-request-report"
        );
        return { blob: await generatePurchaseRequestReport(pr), ext: "pdf" };
      }
    } catch {
      /* linked PR unavailable — fall back to the summary PDF */
    }
  }
  return { blob: generateSummaryPdf(audit), ext: "pdf" };
}

/** True when this PR has a quote and/or 889 attached. */
function hasAttachments(audit: PrAudit): boolean {
  return !!audit.quote_path || !!audit.section_889_path;
}

/**
 * Every file to send up for one PR: the PR (or summary), the vendor quote, and
 * the Section 889 — named off the PR so they stay grouped.
 */
async function bundlePartsForAudit(
  audit: PrAudit,
): Promise<{ blob: Blob; name: string }[]> {
  const base = prAuditBaseName(audit);
  const parts: { blob: Blob; name: string }[] = [];
  const { blob, ext } = await blobForAudit(audit);
  parts.push({ blob, name: `${base} - PR.${ext}` });
  if (audit.quote_path) {
    try {
      const qb = await fetchStored(audit.quote_path);
      parts.push({ blob: qb, name: `${base} - Quote.${guessExt(audit.quote_filename, qb.type)}` });
    } catch {
      /* skip a missing quote */
    }
  }
  if (audit.section_889_path) {
    try {
      const sb = await fetchStored(audit.section_889_path);
      parts.push({ blob: sb, name: `${base} - 889.${guessExt(audit.section_889_filename, sb.type)}` });
    } catch {
      /* skip a missing 889 */
    }
  }
  return parts;
}

/**
 * Download one PR to sign. With a quote/889 attached, all three come down as a
 * zip; otherwise just the PR file (or generated summary).
 */
export async function downloadOriginalFile(audit: PrAudit): Promise<void> {
  if (!hasAttachments(audit)) {
    const { blob, ext } = await blobForAudit(audit);
    triggerBlobDownload(blob, prAuditFilename(audit, ext));
    return;
  }
  const parts = await bundlePartsForAudit(audit);
  const zip = new JSZip();
  for (const p of parts) zip.file(p.name, p.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(blob, prAuditFilename(audit, "zip"));
}

export interface BundleResult {
  count: number;
  warnings: string[];
}

/**
 * Zip the given PRs into one download. Each PR contributes its original file
 * (or a generated summary). Files that fail to fetch become warnings so the
 * rest still bundle. The caller decides which PRs to pass in.
 */
export async function downloadBundle(
  audits: PrAudit[],
  todayIso: string,
): Promise<BundleResult> {
  const warnings: string[] = [];
  if (audits.length === 0) {
    return { count: 0, warnings: ["Nothing to download."] };
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const usedFolders = new Set<string>();
  let count = 0;

  for (const audit of audits) {
    try {
      const parts = await bundlePartsForAudit(audit);
      if (parts.length === 1) {
        // PR only — keep it flat, deduping the filename.
        let name = parts[0].name;
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf(".");
          name = `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`;
        }
        usedNames.add(name);
        zip.file(name, parts[0].blob);
      } else {
        // PR + quote/889 — group them in a per-PR subfolder.
        let folder = prAuditBaseName(audit);
        let n = 2;
        while (usedFolders.has(folder)) folder = `${prAuditBaseName(audit)} (${n++})`;
        usedFolders.add(folder);
        for (const p of parts) zip.file(`${folder}/${p.name}`, p.blob);
      }
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
  triggerBlobDownload(blob, `PR Audit Bundle - ${todayIso}.zip`);
  return { count, warnings };
}
