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

  const prompt = `You are a Navy FRSC contracting specialist writing a Statement of Work.

Infer the trade STRICTLY from the line items and work description (irrigation, paving, roofing, electrical, HVAC, tree care, painting, fencing, masonry, equipment service, etc.). Do not default to any single trade. When line items list quantities or part numbers, reference them by name in the relevant duty items — no generic boilerplate when concrete details are available.

ACTIVITY: ${ctx.activityName}
REQUESTED BY: ${ctx.from}
WORK DESCRIPTION: ${ctx.workDescription}
PERIOD: ${ctx.startDate} through ${ctx.endDate}
REQUISITION TYPE: ${ctx.requisitionType}${vendorBlock}${contactBlock}${justificationBlock}${totalBlock}${itemsBlock}

Keep it concise and defensible — no filler, no repetition, and no restating the same duty in different words. Output three sections, formatted EXACTLY as shown, with complete sentences (no ellipses or truncation):

EXPECTATION:
[4-6 numbered items covering only the essential contractor duties, written as full sentences in formal government contracting language. Across those items cover mobilization and coordination with the COR, the specific work task(s) (cite quote items and quantities when given), OSHA/Navy safety compliance, debris cleanup and disposal, and completion documentation. Combine related duties into one item instead of splitting them apart, and do not pad the list to hit a number.]

DESCRIPTION_OF_GOODS:
[2-3 sentences describing what is being procured. Reference specific quantities, part numbers, and the vendor when given; tie back to the justification if provided.]

CERTIFICATIONS:
[1-2 sentences listing the minimum certifications, licenses, insurance, and skills required for the trade implied by the line items.]`;

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
