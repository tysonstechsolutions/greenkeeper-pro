/**
 * Saved-documents store — a single place that records every document the app
 * generates so it can be found and re-downloaded later.
 *
 * saveCreatedDocument() is best-effort: it uploads the PDF to the 'documents'
 * bucket and inserts a row, but never throws — saving a copy must not break the
 * download the user actually asked for.
 */
import {
  directStorageUpload,
  publicStorageUrl,
  directStorageDelete,
  directSelectList,
  directSelectRow,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
  getCachedUserId,
} from "@/lib/supabase/rest";

const BUCKET = "documents";

export interface CreatedDocument {
  id: string;
  doc_type: string;
  title: string;
  storage_path: string | null;
  filename: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  sole_source: "Sole Source",
  sow: "Statement of Work",
  sf52: "SF-52 (Personnel Action)",
  dd200: "DD-200 (Property Loss)",
  dd2212: "NAVCOMPT 2212 (Disposition)",
  onboarding_packet: "Onboarding Packet",
  leadership_briefing: "GM Leadership Briefing",
  work_order: "Work Order",
  other: "Document",
};

export function docTypeLabel(t: string): string {
  return DOC_TYPE_LABELS[t] ?? "Document";
}

/**
 * Upload a generated PDF + record it. Best-effort; swallows its own errors.
 * Returns the new row's id (null when saving failed) so callers can offer
 * "edit this saved copy" flows.
 */
export async function saveCreatedDocument(args: {
  docType: string;
  title: string;
  blob: Blob;
  filename: string;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const safe = (args.filename || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${args.docType}/${Date.now()}-${safe}`;
    const file = new File([args.blob], safe, {
      type: args.blob.type || "application/pdf",
    });
    await directStorageUpload(BUCKET, path, file, "documents.save.upload");
    const row = await directInsertRow<CreatedDocument>(
      "created_documents",
      {
        doc_type: args.docType,
        title: args.title,
        storage_path: path,
        filename: args.filename,
        meta: args.meta ?? {},
        created_by: getCachedUserId(),
      },
      "documents.save.insert",
    );
    return row?.id ?? null;
  } catch (err) {
    console.warn(
      "[documents] couldn't save a copy:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function getCreatedDocument(id: string): Promise<CreatedDocument | null> {
  return await directSelectRow<CreatedDocument>("created_documents", "id", id, "*", "documents.get");
}

/**
 * Replace a saved document's file + row in place (used when re-saving an
 * edited SF-52 etc.). Unlike saveCreatedDocument this THROWS on failure —
 * the user explicitly asked to save changes, so they need to know.
 */
export async function updateCreatedDocument(
  doc: CreatedDocument,
  args: { title: string; blob: Blob; filename: string; meta?: Record<string, unknown> },
): Promise<void> {
  const safe = (args.filename || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${doc.doc_type}/${Date.now()}-${safe}`;
  const file = new File([args.blob], safe, { type: args.blob.type || "application/pdf" });
  await directStorageUpload(BUCKET, path, file, "documents.update.upload");
  await directPatchRow(
    "created_documents",
    "id",
    doc.id,
    { title: args.title, storage_path: path, filename: args.filename, meta: args.meta ?? doc.meta },
    "documents.update.row",
  );
  if (doc.storage_path && doc.storage_path !== path) {
    try {
      await directStorageDelete(BUCKET, [doc.storage_path], "documents.update.cleanup");
    } catch {
      /* old file may already be gone */
    }
  }
}

export async function listCreatedDocuments(): Promise<CreatedDocument[]> {
  return await directSelectList<CreatedDocument>("created_documents", {
    columns: "*",
    orderBy: [{ column: "created_at", ascending: false }],
    label: "documents.list",
  });
}

export function createdDocUrl(path: string | null): string | null {
  return path ? publicStorageUrl(BUCKET, path) : null;
}

export async function deleteCreatedDocument(doc: CreatedDocument): Promise<void> {
  if (doc.storage_path) {
    try {
      await directStorageDelete(BUCKET, [doc.storage_path], "documents.delete.file");
    } catch {
      /* file may already be gone — still remove the row */
    }
  }
  await directDeleteRow("created_documents", "id", doc.id, "documents.delete.row");
}
