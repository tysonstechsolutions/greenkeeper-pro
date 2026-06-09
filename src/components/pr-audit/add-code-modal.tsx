"use client";

import { CodeForm } from "@/components/pr-audit/code-form";
import { blankDraft, KIND_LABEL, type CodeDraft } from "@/lib/pr-audit/codes-crud";
import type { PrCategory, PrCodeKind } from "@/types/database";

/**
 * "Add a missing code" popup, shared by the upload flow and the PR detail page.
 * Pass the `{ kind, code }` found on a PR; the code field is locked so the
 * reviewer is adding exactly that code. Returns null when there's nothing to add.
 */
export function AddCodeModal({
  target,
  categories,
  saving,
  onCancel,
  onSave,
}: {
  target: { kind: PrCodeKind; code: string } | null;
  categories: PrCategory[];
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: CodeDraft) => void;
}) {
  if (!target) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      onClick={() => !saving && onCancel()}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-2">
          Add {KIND_LABEL[target.kind]} {target.code}
        </p>
        <CodeForm
          kind={target.kind}
          initial={blankDraft({ code: target.code })}
          categories={categories}
          saving={saving}
          lockCode
          onCancel={onCancel}
          onSave={onSave}
        />
      </div>
    </div>
  );
}
