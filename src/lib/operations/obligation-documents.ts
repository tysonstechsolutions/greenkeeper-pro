/**
 * Obligation report attachments — the real document/report sample + how-to
 * instructions + due date the GM attaches to a recurring obligation. Files go
 * to the existing 'documents' storage bucket; a row may be instructions-only
 * (no file). Mirrors saved-documents.ts and uses the lock-free direct REST
 * helpers (never supabase-js `.from()`).
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

export interface ObligationDocument {
  id: string;
  obligation_id: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  instructions: string | null;
  due_date: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * Attach a report sample (+ instructions + due date) to an obligation. When a
 * file is given it's uploaded to the 'documents' bucket first, then a row is
 * inserted. With no file, a row is inserted with storage_path = null
 * (instructions-only). Returns the new row, or null on failure.
 */
export async function uploadObligationReport(args: {
  obligationId: string;
  file: File | null;
  instructions: string;
  dueDate: string | null;
}): Promise<ObligationDocument | null> {
  try {
    let storagePath: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;

    if (args.file) {
      const safeName = (args.file.name || "report").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `obligation-reports/${args.obligationId}/${Date.now()}-${safeName}`;
      await directStorageUpload(BUCKET, path, args.file, "obligation-documents.upload");
      storagePath = path;
      fileName = args.file.name || safeName;
      mimeType = args.file.type || null;
    }

    const row = await directInsertRow<ObligationDocument>(
      "obligation_documents",
      {
        obligation_id: args.obligationId,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        instructions: args.instructions.trim() ? args.instructions.trim() : null,
        due_date: args.dueDate || null,
        uploaded_by: getCachedUserId(),
      },
      "obligation-documents.insert",
    );
    return row ?? null;
  } catch (err) {
    console.warn(
      "[obligation-documents] couldn't attach the report:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function listObligationDocuments(): Promise<ObligationDocument[]> {
  return await directSelectList<ObligationDocument>("obligation_documents", {
    columns: "*",
    orderBy: [{ column: "created_at", ascending: false }],
    label: "obligation-documents.list",
  });
}

export function obligationReportUrl(path: string | null): string | null {
  return path ? publicStorageUrl(BUCKET, path) : null;
}

export async function deleteObligationDocument(doc: ObligationDocument): Promise<void> {
  if (doc.storage_path) {
    try {
      await directStorageDelete(BUCKET, [doc.storage_path], "obligation-documents.delete.file");
    } catch {
      /* file may already be gone — still remove the row */
    }
  }
  await directDeleteRow("obligation_documents", "id", doc.id, "obligation-documents.delete.row");
}

/**
 * Pure helper: group a flat list of obligation documents by obligation_id,
 * preserving the input order within each group. Unit-tested independently of
 * the network layer.
 */
export function groupDocumentsByObligation(
  docs: ObligationDocument[],
): Map<string, ObligationDocument[]> {
  const map = new Map<string, ObligationDocument[]>();
  for (const doc of docs) {
    const existing = map.get(doc.obligation_id);
    if (existing) existing.push(doc);
    else map.set(doc.obligation_id, [doc]);
  }
  return map;
}
