/**
 * Client side of PR extraction. Each uploaded FILE is treated as its own
 * Purchase Request: we resize it (images) or pass it through (PDFs), send it to
 * the `extract-pr` edge function, and map the result into an ExtractedPr the
 * audit screen can use. Batch upload reads many files concurrently — one PR per
 * file — so the boss can drop in a whole stack at once.
 *
 * A multi-page PR should be a single PDF (the edge function reads every page of
 * one PDF in a single call). Multiple separate image files are read as separate
 * PRs by design.
 */
import { callApi } from "@/lib/api/client";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import type { ExtractedPr, ExtractedPrItem } from "@/lib/pr-audit/audit";

/** Raw shape returned by the edge function (loosely typed; values coerced). */
interface RawExtractedPr {
  date_prepared?: string | null;
  vendor_name?: string | null;
  requestor_name?: string | null;
  internal_order?: string | null;
  items?: Array<{
    description?: string | null;
    part_number?: string | null;
    qty?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    site?: string | null;
    cost_ctr?: string | null;
    gl_acct?: string | null;
    extended_price?: number | string | null;
  }> | null;
  attached_other?: string | null;
  printed_total?: number | string | null;
  warnings?: string[] | null;
}

/** Max files accepted in one batch upload. */
export const MAX_PR_BATCH = 20;
const EXTRACT_CONCURRENCY = 3;

/** One PR read from one file. */
export interface ExtractedPrFile {
  /** The resized/kept file, ready to upload as the stored original. */
  file: File;
  extracted: ExtractedPr;
  warnings: string[];
  /** True when the read failed and the fields are blank (needs manual entry). */
  failed: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.trim() === "" ? "" : v;
}

function mapItem(it: NonNullable<RawExtractedPr["items"]>[number]): ExtractedPrItem {
  return {
    description: (it.description ?? "").toString(),
    part_number: it.part_number ? String(it.part_number) : null,
    qty: it.qty == null || it.qty === "" ? 1 : num(it.qty),
    unit: it.unit ? String(it.unit) : null,
    unit_price: num(it.unit_price),
    site: it.site ? String(it.site).trim() : null,
    cost_ctr: it.cost_ctr ? String(it.cost_ctr).trim() : null,
    gl_acct: it.gl_acct ? String(it.gl_acct).trim() : null,
    extended_price: numOrNull(it.extended_price),
  };
}

function mapExtracted(raw: RawExtractedPr): ExtractedPr {
  return {
    date_prepared: str(raw.date_prepared) || null,
    vendor_name: str(raw.vendor_name) || null,
    requestor_name: str(raw.requestor_name) || null,
    internal_order: str(raw.internal_order) || null,
    items: (raw.items ?? []).map(mapItem),
    attached_other: str(raw.attached_other),
    printed_total: numOrNull(raw.printed_total),
    warnings: (raw.warnings ?? []).filter((w): w is string => !!w && !!w.trim()),
  };
}

function emptyExtracted(): ExtractedPr {
  return {
    date_prepared: null,
    vendor_name: null,
    requestor_name: null,
    internal_order: null,
    items: [],
    attached_other: null,
    printed_total: null,
    warnings: [],
  };
}

/** Resize + read a single file into one ExtractedPr. */
export async function extractOnePr(file: File): Promise<ExtractedPrFile> {
  let resized: { file: File; base64: string; mediaType: string };
  try {
    const r = await resizeImageFile(file);
    resized = { file: r.file, base64: r.base64, mediaType: r.mediaType };
  } catch (err) {
    return {
      file,
      extracted: {
        ...emptyExtracted(),
        warnings: [
          `Couldn't read "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
        ],
      },
      warnings: [`Couldn't read "${file.name}".`],
      failed: true,
    };
  }

  try {
    const raw = await callApi<RawExtractedPr>("extract-pr", {
      method: "POST",
      body: { image_base64: resized.base64, media_type: resized.mediaType },
    });
    const extracted = mapExtracted(raw);
    return {
      file: resized.file,
      extracted,
      warnings: extracted.warnings ?? [],
      failed: extracted.items.length === 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      file: resized.file,
      extracted: { ...emptyExtracted(), warnings: [`Couldn't read this PR: ${msg}`] },
      warnings: [`Couldn't read "${file.name}": ${msg}`],
      failed: true,
    };
  }
}

/**
 * Read a batch of files — one PR per file — concurrently. The first
 * MAX_PR_BATCH files are read; anything beyond is dropped (reported by the
 * caller via `droppedForCap`).
 */
export async function extractPrsBatch(
  files: File[],
): Promise<{ results: ExtractedPrFile[]; droppedForCap: number }> {
  const capped = files.slice(0, MAX_PR_BATCH);
  const droppedForCap = files.length - capped.length;
  const results = await mapWithConcurrency(
    capped,
    EXTRACT_CONCURRENCY,
    (file) => extractOnePr(file),
  );
  return { results, droppedForCap };
}
