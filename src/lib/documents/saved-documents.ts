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
  directInsertRow,
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
  onboarding_packet: "Onboarding Packet",
  work_order: "Work Order",
  other: "Document",
};

export function docTypeLabel(t: string): string {
  return DOC_TYPE_LABELS[t] ?? "Document";
}

/** Upload a generated PDF + record it. Best-effort; swallows its own errors. */
export async function saveCreatedDocument(args: {
  docType: string;
  title: string;
  blob: Blob;
  filename: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const safe = (args.filename || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${args.docType}/${Date.now()}-${safe}`;
    const file = new File([args.blob], safe, {
      type: args.blob.type || "application/pdf",
    });
    await directStorageUpload(BUCKET, path, file, "documents.save.upload");
    await directInsertRow(
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
  } catch (err) {
    console.warn(
      "[documents] couldn't save a copy:",
      err instanceof Error ? err.message : err,
    );
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
