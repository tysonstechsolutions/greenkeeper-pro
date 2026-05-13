/**
 * Shared AI content generator for the Statement of Work.
 * Used by both the /purchase-requests/new and /purchase-requests/view pages.
 *
 * Pass as much quote/PR context as you have — the AI uses the actual vendor,
 * line items, part numbers, and quantities to write specific, defensible
 * contracting language. Falls back to the bare workDescription when extra
 * fields aren't available.
 */
import { callApi } from "@/lib/api/client";

export interface SowContentItem {
  description: string;
  part_number?: string | null;
  qty: number;
  unit?: string | null;
  unit_price: number;
}

export interface SowContext {
  workDescription: string;
  activityName: string;
  from: string;
  startDate: string;
  endDate: string;
  requisitionType: string;
  // Optional richer fields — pulled straight from the PR/quote when present
  vendorName?: string | null;
  vendorContact?: string | null;
  items?: SowContentItem[];
  totalAmount?: number | null;
  justification?: string | null;
}

function buildItemsBlock(items?: SowContentItem[]): string {
  if (!items || items.length === 0) return "";
  const lines = items
    .filter((it) => it.description?.trim())
    .map((it) => {
      const qty = `Qty ${it.qty} ${it.unit || "ea"}`;
      const pn = it.part_number ? ` (P/N ${it.part_number})` : "";
      const price = it.unit_price > 0 ? ` @ $${it.unit_price.toFixed(2)}/ea` : "";
      return `• ${qty} — ${it.description}${pn}${price}`;
    });
  if (lines.length === 0) return "";
  return `\nLINE ITEMS FROM VENDOR QUOTE (use these to be specific):\n${lines.join("\n")}`;
}

export async function generateSowContent(
  ctx: SowContext,
): Promise<{ expectation: string; goods: string; certifications: string }> {
  const vendorBlock = ctx.vendorName ? `\nVENDOR: ${ctx.vendorName}` : "";
  const contactBlock = ctx.vendorContact ? `\nVENDOR CONTACT: ${ctx.vendorContact}` : "";
  const justificationBlock = ctx.justification?.trim()
    ? `\nJUSTIFICATION (why this is being procured): ${ctx.justification.trim()}`
    : "";
  const totalBlock =
    ctx.totalAmount && ctx.totalAmount > 0
      ? `\nTOTAL VALUE: $${ctx.totalAmount.toFixed(2)}`
      : "";
  const itemsBlock = buildItemsBlock(ctx.items);

  const prompt = `You are a professional Navy FRSC contracting specialist writing a Statement of Work.

Generate professional government contracting language. Be SPECIFIC: when line items are provided, reference the actual quantities, part numbers, and items in the contractor duties — do not write generic boilerplate when you have concrete details available.

The contractor may be from ANY trade — irrigation, paving, roofing, landscaping, tree care, electrical, plumbing, HVAC, painting, fencing, masonry, equipment service, pest control, signage, etc. INFER the trade strictly from the line items and work description below, then tailor every section to that trade. Do not default to irrigation or any single trade unless the line items clearly indicate it.

ACTIVITY: ${ctx.activityName}
REQUESTED BY: ${ctx.from}
WORK DESCRIPTION: ${ctx.workDescription}
PERIOD OF PERFORMANCE: ${ctx.startDate} through ${ctx.endDate}
REQUISITION TYPE: ${ctx.requisitionType}${vendorBlock}${contactBlock}${justificationBlock}${totalBlock}${itemsBlock}

Provide three sections formatted EXACTLY as shown. Write full sentences and complete paragraphs — do not truncate or use ellipses. Each section must stand on its own and be ready to print on a government form:

EXPECTATION:
[Write 8-14 numbered items listing specific contractor duties as complete, self-contained sentences. Use formal government contracting language. Cover: mobilization/site preparation, specific work tasks referencing the actual quote items and quantities, safety/compliance with OSHA and Navy regulations, cleanup/disposal of debris and packaging, documentation/reporting requirements, and coordination with the COR (Contracting Officer Representative). When part numbers and quantities are provided, name them explicitly in the relevant duty items.]

DESCRIPTION_OF_GOODS:
[Write 3-5 professional sentences describing the goods/services being procured. Reference specific quantities, part numbers, and the vendor name when provided. Tie the procurement back to the operational justification if one was given.]

CERTIFICATIONS:
[Write 2-3 sentences listing minimum contractor certifications, licenses, insurance, and special skills required for this type of work. Be specific to the trade implied by the line items.]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = reply?.reply ?? "";
  const expectMatch = text.match(/EXPECTATION:\s*([\s\S]*?)(?=DESCRIPTION_OF_GOODS:|$)/i);
  const goodsMatch = text.match(/DESCRIPTION_OF_GOODS:\s*([\s\S]*?)(?=CERTIFICATIONS:|$)/i);
  const certMatch = text.match(/CERTIFICATIONS:\s*([\s\S]*?)$/i);

  return {
    expectation: expectMatch?.[1]?.trim() ?? ctx.workDescription,
    goods:
      goodsMatch?.[1]?.trim() ??
      `${ctx.requisitionType} for ${ctx.activityName}: ${ctx.workDescription}`,
    certifications:
      certMatch?.[1]?.trim() ??
      "Contractor shall possess all applicable federal, state, and local licenses, certifications, and insurance required for this type of work, including any trade-specific credentials.",
  };
}
