/**
 * Persistence for a purchase request's Statement of Work.
 *
 * The problem this solves: a SOW filled out (and edited) from the PR
 * download screen used to be rendered to a one-off PDF and thrown away —
 * the next download re-opened the wizard and regenerated the original from
 * the AI, wiping the user's edits. We now keep two artifacts in the
 * existing `vendor-files` bucket so an edited SOW survives:
 *
 *   • quotes/{prId}/sow-{ts}.pdf   — the rendered PDF. Its path is stored on
 *                                    purchase_requests.sow_storage_path, and
 *                                    pr-bundle.ts re-downloads it on every
 *                                    later bundle so the saved SOW is reused.
 *   • quotes/{prId}/sow-form.json  — the editable SowFormData, at a stable
 *                                    path so we can always find it again and
 *                                    re-open the editor pre-filled with the
 *                                    user's last version (not the original).
 */
import type { SowFormData } from "@/lib/reports/sow-report";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

const BUCKET = "vendor-files";
const UPLOAD_TIMEOUT_MS = 30_000;

/** Shape of a supabase-js storage upload result (the client is typed `any`). */
interface StorageResult {
  error: { message?: string } | null;
}

/** Stable per-PR path for the editable SOW form data. */
function sowFormDataPath(prId: string): string {
  return `quotes/${prId}/sow-form.json`;
}

/**
 * Race a storage call against a timeout. supabase-js storage calls have been
 * observed to wedge when the auth lock is held by an abandoned holder; this
 * gives a clean failure instead of a button that spins forever (same guard
 * the PR save flow uses).
 */
function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`)),
        UPLOAD_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Upload the rendered SOW PDF and return its storage path, ready to write to
 * purchase_requests.sow_storage_path. A fresh timestamped name each time so a
 * cached copy of an older SOW never shadows the new one.
 */
export async function uploadSowPdf(
  supabase: SupabaseClient,
  prId: string,
  blob: Blob,
): Promise<string> {
  const path = `quotes/${prId}/sow-${Date.now()}.pdf`;
  // The client is typed `any` (see lib/supabase/client), so annotate the
  // upload result explicitly — otherwise `error` comes back as `unknown`.
  const upload: Promise<StorageResult> = supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  const { error } = await withTimeout(upload, "SOW PDF upload");
  if (error) throw new Error(error.message ?? "SOW PDF upload failed");
  return path;
}

/**
 * Save the editable SOW form data so the editor can be re-opened pre-filled
 * with the user's last version. Overwrites in place (stable path).
 */
export async function uploadSowFormData(
  supabase: SupabaseClient,
  prId: string,
  draft: SowFormData,
): Promise<void> {
  const json = new Blob([JSON.stringify(draft)], { type: "application/json" });
  const upload: Promise<StorageResult> = supabase.storage
    .from(BUCKET)
    .upload(sowFormDataPath(prId), json, {
      upsert: true,
      contentType: "application/json",
    });
  const { error } = await withTimeout(upload, "SOW form-data upload");
  if (error) throw new Error(error.message ?? "SOW form-data upload failed");
}

/**
 * Load previously saved SOW form data for a PR, or null if none exists yet or
 * it can't be read/parsed. Best-effort: callers fall back to the fresh wizard.
 */
export async function loadSavedSowData(
  supabase: SupabaseClient,
  prId: string,
): Promise<SowFormData | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(sowFormDataPath(prId));
    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text) as SowFormData;
  } catch {
    return null;
  }
}
