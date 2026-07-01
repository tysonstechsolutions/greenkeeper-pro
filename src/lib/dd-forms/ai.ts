/**
 * Optional AI drafting for the DD-200 narratives (blocks 9 & 10). Reuses the
 * already-deployed `ai-assistant` edge function, framed as helping the golf
 * course so it stays inside the assistant's persona. Best-effort: returns null
 * on any error so the filler still works entirely by hand.
 */
import { callApi } from "@/lib/api/client";

export interface Dd200NarrativeInput {
  item: string;
  disposition: string;
  whatHappened: string;
}

export async function draftDd200Narratives(
  input: Dd200NarrativeInput,
): Promise<{ circumstances: string; actions: string } | null> {
  const prompt = `You are helping the golf course (MWR N92, Naval Station Great Lakes) complete a DD Form 200, Financial Liability Investigation of Property Loss, for a piece of course property. Write two short, factual, professional narratives in plain English. No markdown, no bullet points, no headers other than the two labels requested.

Item: ${input.item || "(unspecified property item)"}
Disposition: ${input.disposition || "(not specified)"}
What happened (staff notes): ${input.whatHappened || "(none provided)"}

Return EXACTLY this, filling in the brackets:
CIRCUMSTANCES:
[2-4 sentences describing the circumstances under which the property was lost, damaged, or destroyed]
ACTIONS:
[1-3 sentences describing the actions taken to correct the circumstances and prevent future occurrences]`;

  try {
    const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
      method: "POST",
      body: { message: prompt, history: [] },
    });
    const norm = (reply?.reply ?? "").replace(/\*\*/g, "").replace(/__/g, "");
    const grab = (label: string, next: string): string =>
      (norm.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${next}|$)`, "i"))?.[1] ?? "").trim();
    const circumstances = grab("CIRCUMSTANCES", "ACTIONS\\s*:?");
    const actions = grab("ACTIONS", "$");
    if (!circumstances && !actions) return null;
    return { circumstances, actions };
  } catch {
    return null;
  }
}
