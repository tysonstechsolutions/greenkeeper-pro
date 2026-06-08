"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Eye,
  EyeOff,
  Tag,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { PrCategory, PrCode, PrCodeKind } from "@/types/database";
import { CodeForm } from "@/components/pr-audit/code-form";
import {
  createPrCode,
  resolveCategoryId,
  type CodeDraft,
} from "@/lib/pr-audit/codes-crud";

const KIND_TABS: Array<{ kind: PrCodeKind; label: string }> = [
  { kind: "cost_center", label: "Cost Centers" },
  { kind: "gl_account", label: "G/L Accounts" },
  { kind: "site", label: "Sites" },
];

export default function ManageCodesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<PrCategory[]>([]);
  const [codes, setCodes] = useState<PrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<PrCodeKind>("cost_center");
  const [editingId, setEditingId] = useState<string | null>(null); // code id or "new"
  const [saving, setSaving] = useState(false);

  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, allCodes] = await Promise.all([
        directSelectList<PrCategory>("pr_categories", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          limit: 200,
          label: "manage.categories",
        }),
        directSelectList<PrCode>("pr_codes", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          limit: 1000,
          label: "manage.codes",
        }),
      ]);
      setCategories(cats);
      setCodes(allCodes);
    } catch (err) {
      setError(
        `Couldn't load the lists. If you just added the tables, give it a moment. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    load();
  }, [isAllowed, load]);

  const categoryName = useCallback(
    (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorized",
    [categories],
  );

  // ── Category actions ────────────────────────────────────────────────────────

  const addCategory = useCallback(async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      const inserted = await directInsertRow<PrCategory>(
        "pr_categories",
        { name, sort_order: categories.length, created_by: getCachedUserId() },
        "manage.addCategory",
      );
      setCategories((prev) => [...prev, inserted]);
      setNewCatName("");
    } catch (err) {
      alert(`Couldn't add category: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCatBusy(false);
    }
  }, [newCatName, categories.length]);

  const saveCategoryName = useCallback(async () => {
    if (!editingCatId) return;
    const name = editingCatName.trim();
    if (!name) {
      setEditingCatId(null);
      return;
    }
    setCatBusy(true);
    try {
      await directPatchRow("pr_categories", "id", editingCatId, { name }, "manage.renameCategory");
      setCategories((prev) => prev.map((c) => (c.id === editingCatId ? { ...c, name } : c)));
      setEditingCatId(null);
    } catch (err) {
      alert(`Couldn't rename: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCatBusy(false);
    }
  }, [editingCatId, editingCatName]);

  const deleteCategory = useCallback(async (cat: PrCategory) => {
    if (!confirm(`Delete category "${cat.name}"? Codes in it stay, but become Uncategorized.`)) {
      return;
    }
    setCatBusy(true);
    try {
      await directDeleteRow("pr_categories", "id", cat.id, "manage.deleteCategory");
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setCodes((prev) =>
        prev.map((c) => (c.category_id === cat.id ? { ...c, category_id: null } : c)),
      );
    } catch (err) {
      alert(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCatBusy(false);
    }
  }, []);

  // ── Code actions ────────────────────────────────────────────────────────────

  const saveCode = useCallback(
    async (id: string | null, draft: CodeDraft) => {
      setSaving(true);
      try {
        if (id && id !== "new") {
          const { categoryId, newCategory } = await resolveCategoryId(draft, categories.length);
          if (newCategory) setCategories((prev) => [...prev, newCategory]);
          const payload = {
            kind: activeKind,
            code: draft.code.trim(),
            label: draft.label.trim(),
            category_id: categoryId,
            description: draft.description.trim() || null,
            examples: draft.examples.trim() || null,
            active: draft.active,
          };
          await directPatchRow("pr_codes", "id", id, payload, "manage.updateCode");
          setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, ...payload } : c)));
        } else {
          const { code, newCategory } = await createPrCode(
            activeKind,
            draft,
            categories.length,
            codes.filter((c) => c.kind === activeKind).length,
          );
          if (newCategory) setCategories((prev) => [...prev, newCategory]);
          setCodes((prev) => [...prev, code]);
        }
        setEditingId(null);
      } catch (err) {
        alert(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [activeKind, categories.length, codes],
  );

  const toggleActive = useCallback(async (c: PrCode) => {
    try {
      await directPatchRow("pr_codes", "id", c.id, { active: !c.active }, "manage.toggleActive");
      setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    } catch (err) {
      alert(`Couldn't update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const deleteCode = useCallback(async (c: PrCode) => {
    if (!confirm(`Delete code ${c.code}? (Consider hiding it instead to keep history.)`)) return;
    try {
      await directDeleteRow("pr_codes", "id", c.id, "manage.deleteCode");
      setCodes((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      alert(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Manage Lists</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
        </div>
      </div>
    );
  }

  const kindCodes = codes.filter((c) => c.kind === activeKind);
  const kindSingular = KIND_TABS.find((t) => t.kind === activeKind)?.label.replace(/s$/, "");

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Manage Lists</h1>
          <p className="text-[11px] text-muted-foreground">
            Cost centers, G/L accounts, sites &amp; categories
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* Categories */}
      <div className="rounded-2xl border border-border bg-card p-3 mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <Tag className="w-4 h-4 text-muted-foreground" /> Categories
        </h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {categories.map((c) =>
            editingCatId === c.id ? (
              <span key={c.id} className="flex items-center gap-1">
                <input
                  type="text"
                  value={editingCatName}
                  onChange={(e) => setEditingCatName(e.target.value)}
                  className="text-sm rounded-lg border border-border bg-background px-2 py-1 w-32"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={saveCategoryName}
                  disabled={catBusy}
                  className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
                  aria-label="Save name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCatId(null)}
                  className="p-1 rounded text-muted-foreground hover:bg-muted"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ) : (
              <span
                key={c.id}
                className="flex items-center gap-1 text-sm rounded-full border border-border bg-background pl-3 pr-1.5 py-1"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => {
                    setEditingCatId(c.id);
                    setEditingCatName(c.name);
                  }}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                  aria-label={`Rename ${c.name}`}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteCategory(c)}
                  className="p-0.5 rounded text-muted-foreground hover:text-red-600"
                  aria-label={`Delete ${c.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ),
          )}
          {categories.length === 0 && !loading && (
            <span className="text-xs text-muted-foreground">No categories yet.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Add a category (e.g. Zappers)"
            className="flex-1 text-sm rounded-lg border border-border bg-background px-2 py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
            }}
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={catBusy || !newCatName.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-60"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex gap-1.5 mb-3">
        {KIND_TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => {
              setActiveKind(t.kind);
              setEditingId(null);
            }}
            className={`flex-1 text-xs font-semibold px-2 py-2 rounded-lg border transition-colors ${
              activeKind === t.kind
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Add new */}
      {editingId === "new" ? (
        <div className="mb-3">
          <CodeForm
            kind={activeKind}
            categories={categories}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSave={(d) => saveCode("new", d)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="mb-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" /> Add {kindSingular}
        </button>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : kindCodes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {kindCodes.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <CodeForm
                  kind={activeKind}
                  initial={{
                    code: c.code,
                    label: c.label,
                    category_id: c.category_id,
                    description: c.description ?? "",
                    examples: c.examples ?? "",
                    active: c.active,
                    newCategory: "",
                  }}
                  categories={categories}
                  saving={saving}
                  onCancel={() => setEditingId(null)}
                  onSave={(d) => saveCode(c.id, d)}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-xl border border-border bg-card p-3 ${
                  c.active ? "" : "opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {c.code}
                    {c.label ? <span className="font-normal"> — {c.label}</span> : null}
                    {!c.active && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        hidden
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {categoryName(c.category_id)}
                    {c.description ? ` · ${c.description}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(c)}
                  aria-label={c.active ? "Hide" : "Show"}
                  title={c.active ? "Hide from dropdowns" : "Show in dropdowns"}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted shrink-0"
                >
                  {c.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(c.id)}
                  aria-label="Edit"
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteCode(c)}
                  aria-label="Delete"
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
