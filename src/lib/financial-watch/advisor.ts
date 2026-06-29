import { callApi } from "@/lib/api/client";
import { serializeForAdvisor } from "./advisor-context";
import type { FinancialWatch } from "./types";

export interface AdvisorMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask the financial analyst a question. The computed FinancialWatch is
 * serialized into a grounded snapshot and sent to the financial-advisor edge
 * function — the analyst reasons over those numbers, never its own.
 */
export async function askFinancialAdvisor(
  question: string,
  watch: FinancialWatch,
  history: AdvisorMessage[],
): Promise<string> {
  const res = await callApi<{ reply?: string }>("financial-advisor", {
    method: "POST",
    body: {
      question,
      snapshot: serializeForAdvisor(watch),
      history: history.slice(-8),
    },
  });
  return res.reply ?? "I couldn't generate a response.";
}
