import { callApi } from "@/lib/api/client";

/**
 * Ask the AI to break a task into a handful of small, ordered steps. Returns
 * step titles only — the caller schedules them with scheduleSteps(). Throws if
 * the edge function isn't reachable/deployed; the caller falls back to a single
 * step so My Day still works without the AI.
 */
export async function breakdownTask(input: {
  title: string;
  detail?: string;
  deadline?: string | null;
}): Promise<string[]> {
  const res = await callApi<{ steps?: unknown }>("task-breakdown", {
    method: "POST",
    body: {
      title: input.title,
      detail: input.detail ?? "",
      deadline: input.deadline ?? null,
    },
  });
  if (!Array.isArray(res.steps)) return [];
  return res.steps
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}
