/**
 * Shared AI content generator for the Statement of Work.
 * Used by both the /purchase-requests/new and /purchase-requests/view pages.
 */
import { callApi } from "@/lib/api/client";

export async function generateSowContent(
  workDescription: string,
  activityName: string,
  from: string,
  startDate: string,
  endDate: string,
  requisitionType: string,
): Promise<{ expectation: string; goods: string; certifications: string }> {
  const prompt = `You are a professional Navy FRSC contracting specialist writing a Statement of Work.

Based on the following details, generate professional government contracting language.

ACTIVITY: ${activityName}
REQUESTED BY: ${from}
WORK DESCRIPTION: ${workDescription}
PERIOD OF PERFORMANCE: ${startDate} through ${endDate}
REQUISITION TYPE: ${requisitionType}

Provide three sections formatted EXACTLY as shown:

EXPECTATION:
[Write 8-12 numbered items listing specific contractor duties. Use formal government contracting language. Cover: mobilization/site preparation, specific work tasks, safety/compliance, cleanup/disposal, documentation requirements, and coordination with the COR. Be specific and detailed.]

DESCRIPTION_OF_GOODS:
[Write 2-3 professional sentences describing the goods/services being procured for this contract.]

CERTIFICATIONS:
[Write 1-2 sentences listing minimum contractor certifications, licenses, or skills required for this type of work. Be specific to the trade.]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = reply?.reply ?? "";
  const expectMatch = text.match(/EXPECTATION:\s*([\s\S]*?)(?=DESCRIPTION_OF_GOODS:|$)/i);
  const goodsMatch = text.match(/DESCRIPTION_OF_GOODS:\s*([\s\S]*?)(?=CERTIFICATIONS:|$)/i);
  const certMatch = text.match(/CERTIFICATIONS:\s*([\s\S]*?)$/i);

  return {
    expectation: expectMatch?.[1]?.trim() ?? workDescription,
    goods: goodsMatch?.[1]?.trim() ?? `${requisitionType} for ${activityName}: ${workDescription}`,
    certifications: certMatch?.[1]?.trim() ?? "Contractor shall possess all applicable federal, state, and local licenses and certifications required for this type of work.",
  };
}
