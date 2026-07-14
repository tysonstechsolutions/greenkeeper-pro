/**
 * Client wrapper for the `extract-receipt` edge function. Reads a paid
 * receipt/invoice (image or PDF) and returns the actual amounts + line items
 * so a PR can be reconciled against what was really paid.
 *
 * Mirrors the quote-extraction path: images are downscaled on-device first
 * (the edge fn reads the photo with Claude vision), PDFs pass through. The
 * body is JSON `{ image_base64, media_type }` — NOT FormData — because
 * supabase.functions.invoke + Capacitor Android crash on FormData bodies.
 */
import { callApi } from "@/lib/api/client";
import { resizeImageFile } from "@/lib/utils/image-resize";

export interface ExtractedReceiptItem {
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface ExtractedReceipt {
  vendor: string | null;
  purchase_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  items: ExtractedReceiptItem[];
  warnings: string[];
}

/** Coerce a model value into a finite number, or null. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = Number(v.replace(/[$,\s]/g, ""));
    if (Number.isFinite(cleaned)) return cleaned;
  }
  return null;
}

/** Normalize the raw edge-function payload into a strict ExtractedReceipt. */
function normalize(raw: unknown): ExtractedReceipt {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(r.items) ? r.items : [];
  const items: ExtractedReceiptItem[] = rawItems
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const qty = num(o.qty) ?? 1;
      const unitPrice = num(o.unit_price) ?? 0;
      const lineTotal = num(o.line_total) ?? Math.round(qty * unitPrice * 100) / 100;
      return {
        description: typeof o.description === "string" ? o.description : "",
        qty,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    })
    .filter((it) => it.description.trim() !== "");

  const warnings = Array.isArray(r.warnings)
    ? r.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return {
    vendor: typeof r.vendor === "string" ? r.vendor : null,
    purchase_date: typeof r.purchase_date === "string" ? r.purchase_date : null,
    subtotal: num(r.subtotal),
    tax: num(r.tax),
    total: num(r.total),
    items,
    warnings,
  };
}

/**
 * Send a receipt file to the AI and return the parsed amounts. Throws on a
 * hard failure (network/auth/API); a merely unreadable receipt comes back as
 * an ExtractedReceipt with nulls + warnings, which the caller shows.
 */
export async function extractReceipt(file: File): Promise<ExtractedReceipt> {
  // Downscale images; PDFs pass through unchanged (base64 still computed).
  const prepared = await resizeImageFile(file, { maxDim: 1800, quality: 0.85 });
  const raw = await callApi<unknown>("extract-receipt", {
    method: "POST",
    body: { image_base64: prepared.base64, media_type: prepared.mediaType },
  });
  return normalize(raw);
}
