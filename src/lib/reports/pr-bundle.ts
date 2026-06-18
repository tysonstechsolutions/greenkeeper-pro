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
import { mergeQuotesToPdf, type QuoteSource } from "@/lib/reports/quotes-to-pdf";
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

  // ── 2. Quote(s) (if attached) ─────────────────────────────────────────
  // Prefer the multi-quote array; fall back to the legacy single path.
  const quotePaths: { path: string; filename: string }[] =
    Array.isArray(pr.quote_paths) && pr.quote_paths.length > 0
      ? pr.quote_paths
      : pr.quote_storage_path
        ? [{ path: pr.quote_storage_path, filename: pr.quote_filename || "" }]
        : [];
  if (quotePaths.length === 0) {
    warnings.push(
      "No quote attached — upload one on the PR edit screen so it's included next time.",
    );
  } else {
    // Download every quote first, then merge them into ONE PDF. Photos/PNGs
    // become PDF pages; existing PDF quotes are copied in as-is.
    const fetched: { source: QuoteSource; index: number }[] = [];
    for (let i = 0; i < quotePaths.length; i++) {
      const q = quotePaths[i];
      try {
        const { data, error } = await supabase.storage
          .from("vendor-files")
          .download(q.path);
        if (error || !data) throw error || new Error("No data");
        const bytes = new Uint8Array(await data.arrayBuffer());
        fetched.push({
          source: { bytes, filename: q.filename || "", mime: data.type },
          index: i + 1,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Couldn't fetch quote ${i + 1}: ${msg}`);
      }
    }

    if (fetched.length > 0) {
      try {
        const { pdfBytes, pageCount, failures } = await mergeQuotesToPdf(
          fetched.map((f) => f.source),
        );
        if (pageCount > 0) {
          zip.file(quoteFilename(pr, "pdf", now), pdfBytes);
        }
        // Anything that wouldn't convert gets attached in its original
        // format so a submission never silently loses a quote.
        for (const fail of failures) {
          const orig = fetched.find((f) => f.source === fail.source);
          const idx = orig ? orig.index : 0;
          addRawQuote(zip, pr, fail.source, idx, now);
          warnings.push(
            `Quote ${idx} couldn't be converted to PDF (${fail.reason}) — added it in its original format instead.`,
          );
        }
      } catch (err) {
        // The whole merge step failed — fall back to the raw originals so the
        // user still gets every quote, just unmerged.
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `Couldn't build the combined quote PDF (${msg}) — added the original quote files instead.`,
        );
        for (const f of fetched) {
          addRawQuote(zip, pr, f.source, f.index, now, fetched.length > 1);
        }
      }
    }
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

/**
 * Attach a quote to the zip in its original (un-merged) format. Used only as
 * a fallback when a quote can't be converted to PDF, so the file is never
 * lost. `suffixAlways` appends the quote index to keep names unique.
 */
function addRawQuote(
  zip: JSZip,
  pr: PurchaseRequest,
  source: QuoteSource,
  index: number,
  now: Date,
  suffixAlways = true,
): void {
  const ext =
    (source.filename || "").split(".").pop()?.toLowerCase() ||
    guessExtFromMime(source.mime || "") ||
    "bin";
  const base = quoteFilename(pr, ext, now);
  const name = suffixAlways
    ? base.replace(/(\.[^.]+)$/, ` ${index}$1`)
    : base;
  zip.file(name, source.bytes);
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
