/**
 * Build the full PR submission bundle:
 *   1. Generated PR PDF
 *   2. The vendor quote (downloaded from Supabase storage)
 *   3. The vendor's Section 889 form (downloaded from Supabase storage)
 *
 * All three are zipped with the procurement-office naming convention so
 * the user can email-attach the zip and the recipient extracts three
 * properly named files.
 */

import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import {
  generatePurchaseRequestReport,
  PurchaseRequestReportError,
} from "@/lib/reports/purchase-request-report";
import {
  prBundleZipFilename,
  purchaseRequestPdfFilename,
  quoteFilename,
  section889Filename,
  sowFilename,
} from "@/lib/reports/pr-naming";
import type { PurchaseRequest, VendorWith889 } from "@/types/database";

interface BundleResult {
  blob: Blob;
  filename: string;
  warnings: string[];
}

export class PrBundleError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "PrBundleError";
  }
}

/**
 * Build a zip with PR + quote + 889 + optional SOW. Missing pieces are
 * skipped with a warning rather than aborting — the user might not have a
 * 889 on file yet but still wants to download what they have.
 *
 * Pass `sowBlob` when `pr.attached_sow` is true and the user has filled
 * the SOW wizard — the PDF is generated in the view page and handed here.
 */
export async function buildPrBundle(
  pr: PurchaseRequest,
  sowBlob?: Blob,
): Promise<BundleResult> {
  const warnings: string[] = [];
  const now = new Date();

  // ── 1. Generate the PR PDF ────────────────────────────────────────────
  let prBlob: Blob;
  try {
    prBlob = await generatePurchaseRequestReport(pr);
  } catch (err) {
    if (err instanceof PurchaseRequestReportError) {
      throw new PrBundleError(`pr-pdf:${err.step}`, err.message);
    }
    const m = err instanceof Error ? err.message : String(err);
    throw new PrBundleError("pr-pdf", m);
  }

  const zip = new JSZip();
  zip.file(purchaseRequestPdfFilename(pr, now), prBlob);

  const supabase = createClient();

  // ── 2. Quote (if attached) ────────────────────────────────────────────
  if (pr.quote_storage_path) {
    try {
      const { data, error } = await supabase.storage
        .from("vendor-files")
        .download(pr.quote_storage_path);
      if (error || !data) throw error || new Error("No data");
      const ext =
        (pr.quote_filename || "").split(".").pop()?.toLowerCase() ||
        guessExtFromMime(data.type) ||
        "pdf";
      zip.file(quoteFilename(pr, ext, now), data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Couldn't fetch the quote file: ${msg}`);
    }
  } else {
    warnings.push(
      "No quote attached — upload one on the PR edit screen so it's included next time.",
    );
  }

  // ── 3. Section 889 (if vendor has one) ────────────────────────────────
  if (pr.vendor_id) {
    const { data: vendorRow, error: vendorErr } = await supabase
      .from("vendors")
      .select("name, section_889_path, section_889_filename, section_889_expiration_date")
      .eq("id", pr.vendor_id)
      .maybeSingle();

    if (vendorErr) {
      warnings.push(`Couldn't load vendor for 889: ${vendorErr.message}`);
    } else if (vendorRow) {
      const v = vendorRow as Pick<
        VendorWith889,
        "name" | "section_889_path" | "section_889_filename" | "section_889_expiration_date"
      >;
      if (v.section_889_path) {
        try {
          const { data, error } = await supabase.storage
            .from("vendor-files")
            .download(v.section_889_path);
          if (error || !data) throw error || new Error("No data");
          const ext =
            (v.section_889_filename || "").split(".").pop()?.toLowerCase() ||
            guessExtFromMime(data.type) ||
            "pdf";
          zip.file(section889Filename(v, ext), data);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Couldn't fetch the 889 form: ${msg}`);
        }
      } else {
        warnings.push(
          `${v.name} doesn't have a 889 form on file. Upload one in /vendors.`,
        );
      }
    }
  } else {
    warnings.push(
      "No vendor selected on this PR — pick a vendor with a 889 on file to auto-include it.",
    );
  }

  // ── 4. SOW ───────────────────────────────────────────────────────────
  // Prefer a caller-supplied blob (from the wizard); fall back to the
  // pre-generated file stored at creation time.
  if (sowBlob) {
    zip.file(sowFilename(pr, now), sowBlob);
  } else if (pr.sow_storage_path) {
    try {
      const { data, error } = await supabase.storage
        .from("vendor-files")
        .download(pr.sow_storage_path);
      if (error || !data) throw error || new Error("No data");
      zip.file(sowFilename(pr, now), data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Couldn't fetch the saved SOW: ${msg}`);
    }
  }

  // ── ZIP it up ────────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    filename: prBundleZipFilename(pr, now),
    warnings,
  };
}

function guessExtFromMime(mime: string): string | null {
  if (!mime) return null;
  const m = mime.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return null;
}
