import { callApi } from "@/lib/api/client";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { todayLocal } from "@/lib/utils/date";
import { parseTaskList } from "./parse-tasks";

export interface ExtractedTask {
  title: string;
  deadline?: string | null;
  detail?: string | null;
}

/** Read tasks from a photo / scan / PDF via Claude vision. */
export async function extractTasksFromFile(file: File): Promise<ExtractedTask[]> {
  const r = await resizeImageFile(file); // resizes images, passes PDFs through
  const res = await callApi<{ tasks?: ExtractedTask[] }>("bulk-tasks", {
    method: "POST",
    body: { image_base64: r.base64, media_type: r.mediaType, today: todayLocal() },
  });
  return Array.isArray(res.tasks) ? res.tasks : [];
}

/**
 * Read tasks from pasted text / CSV. Tries the AI (handles messy input +
 * deadline detection); if it isn't reachable, falls back to a plain line
 * parser so text bulk-add works without the edge function deployed.
 */
export async function extractTasksFromText(text: string): Promise<ExtractedTask[]> {
  try {
    const res = await callApi<{ tasks?: ExtractedTask[] }>("bulk-tasks", {
      method: "POST",
      body: { text, today: todayLocal() },
    });
    if (Array.isArray(res.tasks) && res.tasks.length > 0) return res.tasks;
  } catch (err) {
    console.warn("[my-day] AI text extract failed, using line parser:", err);
  }
  return parseTaskList(text).map((title) => ({ title, deadline: null }));
}
