/**
 * Bundle ingestion for the PR Audit upload flow.
 *
 * One smart dropzone accepts a `.zip` (the PR + quote + 889 inside) OR loose
 * files. This module turns whatever was dropped into PR bundles, runs the three
 * extractors (PR / quote / 889), and returns ready-to-store data for the audit
 * screen. Grouping + classification are best-effort; the confirm UI lets the
 * reviewer fix any slot.
 */
import JSZip from "jszip";
import { callApi } from "@/lib/api/client";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { extractOnePr } from "@/lib/pr-audit/extract-client";
import { classifyFileRole, type FileRole } from "@/lib/pr-audit/bundle-classify";
import type { ExtractedPr } from "@/lib/pr-audit/audit";

// ── Types ─────────────────────────────────────────────────────────────────

export interface BundleInput {
  pr: File | null;
  quote: File | null;
  section889: File | null;
}

export interface QuoteLine {
  description: string;
  qty: number;
  unit_price: number;
}

export interface QuoteExtract {
  /** Resized/stored-ready file. */
  file: File;
  vendor: string | null;
  items: QuoteLine[];
  total: number;
  failed: boolean;
  warnings: string[];
}

export interface Section889Extract {
  file: File;
  present: true;
  name: string | null;
  compliant: boolean | null;
  expiration_date: string | null;
  form_type: string | null;
  failed: boolean;
  warnings: string[];
}

export interface BundleData {
  /** Resized/stored-ready files for each slot. */
  files: { pr: File | null; quote: File | null; section889: File | null };
  /** Original display names (before resize renamed images). */
  names: { pr: string | null; quote: string | null; section889: string | null };
  pr: ExtractedPr;
  prFailed: boolean;
  quote: QuoteExtract | null;
  section889: Section889Extract | null;
  warnings: string[];
}

// ── Raw edge-function shapes ────────────────────────────────────────────────

interface RawQuote {
  vendor?: { name?: string | null } | null;
  items?: Array<{ description?: string | null; qty?: number | string | null; unit_price?: number | string | null }> | null;
  warnings?: string[] | null;
}

interface Raw889 {
  name?: string | null;
  compliant?: boolean | null;
  expiration_date?: string | null;
  form_type?: string | null;
  warnings?: string[] | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function num(v: unknown, dflt = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
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

function isZip(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  return t.includes("zip") || /\.zip$/i.test(file.name);
}

function inferMime(name: string): string {
  const ext = (name.toLowerCase().split(".").pop() || "").trim();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "application/octet-stream";
  }
}

/** Expand a zip into real File objects, skipping junk + directories. */
async function unzipToFiles(file: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(file);
  const out: File[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (entry.name.includes("__MACOSX")) continue;
    const base = entry.name.split("/").pop() || entry.name;
    if (!base || base.startsWith(".")) continue;
    const blob = await entry.async("blob");
    out.push(new File([blob], base, { type: inferMime(base) }));
  }
  return out;
}

/** Slot a small set of files (one bundle's worth) into PR / quote / 889. */
function groupOneBundle(files: File[]): BundleInput {
  const out: BundleInput = { pr: null, quote: null, section889: null };
  const leftover: File[] = [];
  for (const f of files) {
    const role = classifyFileRole(f.name);
    if (role === "pr" && !out.pr) out.pr = f;
    else if (role === "quote" && !out.quote) out.quote = f;
    else if (role === "section_889" && !out.section889) out.section889 = f;
    else leftover.push(f);
  }
  // Fill empty slots from leftover/unknown files: PR first, then quote, then 889.
  for (const f of leftover) {
    if (!out.pr) out.pr = f;
    else if (!out.quote) out.quote = f;
    else if (!out.section889) out.section889 = f;
  }
  return out;
}

/** Group loose (non-zip) files: a batch of plain PRs, or one bundle. */
function groupLooseFiles(files: File[]): BundleInput[] {
  const roles = files.map((f) => ({ file: f, role: classifyFileRole(f.name) as FileRole }));
  const quotes = roles.filter((r) => r.role === "quote").map((r) => r.file);
  const s889s = roles.filter((r) => r.role === "section_889").map((r) => r.file);
  const prish = roles
    .filter((r) => r.role === "pr" || r.role === "unknown")
    .map((r) => r.file);

  const hasAttachments = quotes.length > 0 || s889s.length > 0;
  if (!hasAttachments) {
    // No quote/889 in the drop → a quick batch: each file is its own PR.
    return prish.map((pr) => ({ pr, quote: null, section889: null }));
  }
  if (prish.length <= 1) {
    return [{ pr: prish[0] ?? null, quote: quotes[0] ?? null, section889: s889s[0] ?? null }];
  }
  // Several PRs plus attachments: each PR its own bundle, attachments on the
  // first (the reviewer can re-slot in the confirm UI).
  return prish.map((pr, i) => ({
    pr,
    quote: i === 0 ? quotes[0] ?? null : null,
    section889: i === 0 ? s889s[0] ?? null : null,
  }));
}

/** Turn whatever was dropped into one or more PR bundles. */
export async function filesToBundles(files: File[]): Promise<BundleInput[]> {
  const bundles: BundleInput[] = [];
  const loose: File[] = [];
  for (const f of files) {
    if (isZip(f)) {
      try {
        const inner = await unzipToFiles(f);
        if (inner.length > 0) bundles.push(groupOneBundle(inner));
      } catch {
        loose.push(f); // unreadable zip — let it show as an unknown loose file
      }
    } else {
      loose.push(f);
    }
  }
  if (loose.length > 0) bundles.push(...groupLooseFiles(loose));
  return bundles;
}

// ── Extraction ──────────────────────────────────────────────────────────────

async function toPayload(file: File): Promise<{ base64: string; mediaType: string; file: File }> {
  const r = await resizeImageFile(file); // resizes images, passes PDFs through
  return { base64: r.base64, mediaType: r.mediaType, file: r.file };
}

export async function extractQuoteFile(file: File): Promise<QuoteExtract> {
  let ready = file;
  try {
    const p = await toPayload(file);
    ready = p.file;
    const raw = await callApi<RawQuote>("extract-quote", {
      method: "POST",
      body: { image_base64: p.base64, media_type: p.mediaType },
    });
    const items: QuoteLine[] = (raw.items ?? []).map((q) => ({
      description: String(q.description ?? ""),
      qty: num(q.qty, 1),
      unit_price: num(q.unit_price, 0),
    }));
    const total = r2(items.reduce((s, it) => s + it.qty * it.unit_price, 0));
    return {
      file: ready,
      vendor: raw.vendor?.name ?? null,
      items,
      total,
      failed: items.length === 0,
      warnings: (raw.warnings ?? []).filter((w): w is string => !!w && !!w.trim()),
    };
  } catch (err) {
    return {
      file: ready,
      vendor: null,
      items: [],
      total: 0,
      failed: true,
      warnings: [`Couldn't read the quote: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

export async function extract889File(file: File): Promise<Section889Extract> {
  let ready = file;
  try {
    const p = await toPayload(file);
    ready = p.file;
    const raw = await callApi<Raw889>("extract-889", {
      method: "POST",
      body: { image_base64: p.base64, media_type: p.mediaType },
    });
    return {
      file: ready,
      present: true,
      name: raw.name ?? null,
      compliant: typeof raw.compliant === "boolean" ? raw.compliant : null,
      expiration_date: raw.expiration_date ?? null,
      form_type: raw.form_type ?? null,
      failed: !raw.name && !raw.expiration_date,
      warnings: (raw.warnings ?? []).filter((w): w is string => !!w && !!w.trim()),
    };
  } catch (err) {
    return {
      file: ready,
      present: true,
      name: null,
      compliant: null,
      expiration_date: null,
      form_type: null,
      failed: true,
      warnings: [`Couldn't read the 889: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/** Extract every file in a bundle concurrently. */
export async function extractBundle(input: BundleInput): Promise<BundleData> {
  const [prRes, quoteRes, s889Res] = await Promise.all([
    input.pr ? extractOnePr(input.pr) : Promise.resolve(null),
    input.quote ? extractQuoteFile(input.quote) : Promise.resolve(null),
    input.section889 ? extract889File(input.section889) : Promise.resolve(null),
  ]);

  return {
    files: {
      pr: prRes?.file ?? null,
      quote: quoteRes?.file ?? null,
      section889: s889Res?.file ?? null,
    },
    names: {
      pr: input.pr?.name ?? null,
      quote: input.quote?.name ?? null,
      section889: input.section889?.name ?? null,
    },
    pr: prRes ? prRes.extracted : emptyExtracted(),
    prFailed: prRes ? prRes.failed : false,
    quote: quoteRes,
    section889: s889Res,
    warnings: [
      ...(prRes?.warnings ?? []),
      ...(quoteRes?.warnings ?? []),
      ...(s889Res?.warnings ?? []),
    ],
  };
}

/** Extract several bundles with limited concurrency. */
export async function extractBundles(inputs: BundleInput[]): Promise<BundleData[]> {
  return mapWithConcurrency(inputs, 2, (b) => extractBundle(b));
}
