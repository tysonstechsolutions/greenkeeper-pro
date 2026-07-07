/**
 * Saved-SF-52 form-data round-trip. The create form's inputs are stored in
 * the created_documents row's meta (like the SOW's per-PR form JSON) so a
 * saved SF-52 can be reopened, edited, and re-saved from /documents.
 */
import { EMPTY_SF52_INPUTS, type Sf52FormInputs } from "./actions";

export interface Sf52DocForm {
  actionKey: string;
  employeeId: string;
  inputs: Sf52FormInputs;
}

/** meta payload for a saved SF-52 (keeps the older action/employee_id keys too). */
export function buildSf52DocMeta(form: Sf52DocForm): Record<string, unknown> {
  return {
    action: form.actionKey,
    employee_id: form.employeeId || null,
    form,
  };
}

/** Parse a saved doc's meta back into form state; null if it has no form data. */
export function parseSf52DocMeta(meta: Record<string, unknown> | null | undefined): Sf52DocForm | null {
  const form = meta?.form as Partial<Sf52DocForm> | undefined;
  if (!form || typeof form !== "object") return null;
  if (typeof form.actionKey !== "string" || !form.actionKey) return null;
  const inputs = (form.inputs || {}) as Partial<Sf52FormInputs>;
  return {
    actionKey: form.actionKey,
    employeeId: typeof form.employeeId === "string" ? form.employeeId : "",
    // Merge over the empty template so fields added later default sanely.
    inputs: { ...EMPTY_SF52_INPUTS, ...inputs },
  };
}
