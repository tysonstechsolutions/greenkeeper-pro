/**
 * Shared types + write logic for managing PR Audit codes (sites / cost centers /
 * G/L accounts). Used by both the Manage Lists page and the "add a missing code"
 * popup on the audit screen.
 */
import { directInsertRow, getCachedUserId } from "@/lib/supabase/rest";
import type { PrCategory, PrCode, PrCodeKind } from "@/types/database";

/** Sentinel <option> value meaning "create a new category inline". */
export const NEW_CATEGORY = "__new__";

/** Human label per code kind — used by the add-code popups and headers. */
export const KIND_LABEL: Record<PrCodeKind, string> = {
  site: "Site",
  cost_center: "Cost Center",
  gl_account: "G/L Account",
};

export interface CodeDraft {
  code: string;
  label: string;
  category_id: string | null;
  description: string;
  examples: string;
  active: boolean;
  /** Name typed when category_id === NEW_CATEGORY. */
  newCategory: string;
}

export function blankDraft(overrides: Partial<CodeDraft> = {}): CodeDraft {
  return {
    code: "",
    label: "",
    category_id: null,
    description: "",
    examples: "",
    active: true,
    newCategory: "",
    ...overrides,
  };
}

/**
 * Resolve the category id for a draft, creating a new category inline first if
 * the draft selected "New category…". Returns the id to store plus the created
 * category (if any) so callers can update local state.
 */
export async function resolveCategoryId(
  draft: CodeDraft,
  categoriesCount: number,
): Promise<{ categoryId: string | null; newCategory: PrCategory | null }> {
  if (draft.category_id !== NEW_CATEGORY) {
    return { categoryId: draft.category_id, newCategory: null };
  }
  const name = draft.newCategory.trim();
  if (!name) throw new Error("Enter a name for the new category.");
  const newCategory = await directInsertRow<PrCategory>(
    "pr_categories",
    { name, sort_order: categoriesCount, created_by: getCachedUserId() },
    "codes.inlineCategory",
  );
  return { categoryId: newCategory.id, newCategory };
}

/**
 * Insert a new code, creating its category inline first if requested. Returns
 * the inserted code and (if one was created) the new category so callers can
 * fold both into their local state.
 */
export async function createPrCode(
  kind: PrCodeKind,
  draft: CodeDraft,
  categoriesCount: number,
  existingCountForKind: number,
): Promise<{ code: PrCode; newCategory: PrCategory | null }> {
  if (!draft.code.trim()) throw new Error("A code is required.");
  const { categoryId, newCategory } = await resolveCategoryId(draft, categoriesCount);

  const code = await directInsertRow<PrCode>(
    "pr_codes",
    {
      kind,
      code: draft.code.trim(),
      label: draft.label.trim(),
      category_id: categoryId,
      description: draft.description.trim() || null,
      examples: draft.examples.trim() || null,
      active: draft.active,
      sort_order: existingCountForKind,
      created_by: getCachedUserId(),
    },
    "codes.create",
  );
  return { code, newCategory };
}
