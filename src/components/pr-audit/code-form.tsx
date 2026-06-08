"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import type { PrCategory, PrCodeKind } from "@/types/database";
import { NEW_CATEGORY, blankDraft, type CodeDraft } from "@/lib/pr-audit/codes-crud";

/** Add/edit form for a single code (site / cost center / G/L account). */
export function CodeForm({
  kind,
  initial,
  categories,
  saving,
  lockCode = false,
  onCancel,
  onSave,
}: {
  kind: PrCodeKind;
  initial?: CodeDraft;
  categories: PrCategory[];
  saving: boolean;
  /** When true, the code field is read-only (used by the "add this exact code" popup). */
  lockCode?: boolean;
  onCancel: () => void;
  onSave: (draft: CodeDraft) => void;
}) {
  const [draft, setDraft] = useState<CodeDraft>(initial ?? blankDraft());
  const isCostCenter = kind === "cost_center";
  const addingCategory = draft.category_id === NEW_CATEGORY;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Code *</label>
          <input
            type="text"
            value={draft.code}
            disabled={lockCode}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder={kind === "site" ? "7009" : kind === "gl_account" ? "701000" : "25581"}
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2 disabled:opacity-70"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-muted-foreground">Label</label>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Short name"
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground">Category</label>
        <select
          value={draft.category_id ?? ""}
          onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}
          className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>➕ New category…</option>
        </select>
        {addingCategory && (
          <input
            type="text"
            value={draft.newCategory}
            onChange={(e) => setDraft({ ...draft, newCategory: e.target.value })}
            placeholder="New category name (e.g. Zappers)"
            className="mt-2 w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        )}
      </div>

      {isCostCenter && (
        <>
          <div>
            <label className="text-[10px] text-muted-foreground">
              Description (helps the AI catch wrong cost centers)
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              placeholder="What this cost center is for…"
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2 resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Example items</label>
            <textarea
              value={draft.examples}
              onChange={(e) => setDraft({ ...draft, examples: e.target.value })}
              rows={2}
              placeholder="e.g. fertilizer, mower parts, irrigation fittings, fuel"
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2 resize-none"
            />
          </div>
        </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
        />
        Active (uncheck to hide it from the dropdowns)
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/40"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="button"
          disabled={saving || !draft.code.trim()}
          onClick={() => onSave(draft)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
}
