/**
 * Signed SF-52s (Request for Personnel Action) filed on each employee's
 * profile. They live with the other staff documents in the private
 * staff-documents bucket; the category records what the action was.
 *
 * An SF-52 for a resignation or a transfer means the person is leaving, so
 * it takes them off the evaluation lists (an evaluation that's already final
 * stays as finished). Any other SF-52 (pay change, promotion…) is just filed.
 */
import {
  directCreateSignedUrl,
  directDeleteRow,
  directInsertRow,
  directSelectList,
  directStorageDelete,
  directStorageUpload,
  getCachedUserId,
} from "@/lib/supabase/rest";

export type Sf52Action = "resignation" | "transfer" | "other";

/** staff_documents.category for each kind of SF-52. */
export const SF52_CATEGORIES: Record<Sf52Action, string> = {
  resignation: "sf52_resignation",
  transfer: "sf52_transfer",
  other: "sf52",
};

export const SF52_ACTION_LABELS: Record<Sf52Action, string> = {
  resignation: "Resignation",
  transfer: "Transfer",
  other: "Other action",
};

const BUCKET = "staff-documents";

export interface Sf52File {
  id: string;
  employee_id: string;
  name: string;
  category: string;
  storage_path: string | null;
  file_type: string | null;
  created_at: string;
}

/** The action an SF-52 document is for, from its category (null: not an SF-52). */
export function sf52ActionOf(category: string | null | undefined): Sf52Action | null {
  for (const [action, cat] of Object.entries(SF52_CATEGORIES) as [Sf52Action, string][]) {
    if (category === cat) return action;
  }
  return null;
}

/** Does this SF-52 take the person off the evaluation lists? */
export function removesFromEvaluations(action: Sf52Action | null): action is "resignation" | "transfer" {
  return action === "resignation" || action === "transfer";
}

/** Someone leaving, by the newest resignation or transfer SF-52 on file. */
export interface Departure {
  action: "resignation" | "transfer";
  uploadedAt: string;
}

/** Each person with a resignation or transfer SF-52 on file (the newest one). */
export function departuresByEmployee(files: Pick<Sf52File, "employee_id" | "category" | "created_at">[]): Map<string, Departure> {
  const out = new Map<string, Departure>();
  for (const f of files) {
    const action = sf52ActionOf(f.category);
    if (!removesFromEvaluations(action)) continue;
    const prev = out.get(f.employee_id);
    if (!prev || f.created_at > prev.uploadedAt) out.set(f.employee_id, { action, uploadedAt: f.created_at });
  }
  return out;
}

/** Every SF-52 on file (for the people the viewer can see), newest first. */
export async function loadSf52Files(): Promise<Sf52File[]> {
  return directSelectList<Sf52File>("staff_documents", {
    columns: "id,employee_id,name,category,storage_path,file_type,created_at",
    filters: [`category=in.(${Object.values(SF52_CATEGORIES).join(",")})`],
    orderBy: [{ column: "created_at", ascending: false }],
    label: "sf52Files.list",
  });
}

/** File a signed SF-52 on the employee's profile. */
export async function uploadSf52File(employeeId: string, action: Sf52Action, file: File): Promise<void> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${employeeId}/${Date.now()}-sf52-${safe}`;
  await directStorageUpload(BUCKET, path, file, "sf52Files.upload");
  await directInsertRow(
    "staff_documents",
    {
      employee_id: employeeId,
      name: `SF-52 ${SF52_ACTION_LABELS[action]} – ${file.name}`,
      category: SF52_CATEGORIES[action],
      storage_path: path,
      url: null,
      file_type: file.type || null,
      uploaded_by: getCachedUserId(),
    },
    "sf52Files.insert",
  );
}

/** A short-lived link to open an SF-52. */
export async function sf52FileUrl(file: Pick<Sf52File, "storage_path">): Promise<string> {
  if (!file.storage_path) throw new Error("This SF-52 has no stored file to open.");
  return directCreateSignedUrl(BUCKET, file.storage_path, 300, "sf52Files.signedUrl");
}

/** Remove an SF-52 filed by mistake (a resignation or transfer puts them back on the evaluation lists). */
export async function deleteSf52File(file: Pick<Sf52File, "id" | "storage_path">): Promise<void> {
  if (file.storage_path) {
    try {
      await directStorageDelete(BUCKET, [file.storage_path], "sf52Files.deleteFile");
    } catch {
      /* the row is what counts; a stray file is harmless */
    }
  }
  await directDeleteRow("staff_documents", "id", file.id, "sf52Files.delete");
}
