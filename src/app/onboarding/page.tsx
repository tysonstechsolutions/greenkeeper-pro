"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  GraduationCap,
  Download,
  Plus,
  Pencil,
  Eye,
  Trash2,
  X,
  Loader2,
  Search,
  RotateCcw,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { cn } from "@/lib/utils";
import { useOnboardingDocs, type OnboardingDoc } from "@/lib/onboarding/use-onboarding-docs";
import {
  CATEGORY_LABELS,
  ROLE_LABELS,
  ROLE_ORDER,
  CATEGORY_ORDER,
  type OnboardingCategory,
  type OnboardingRole,
} from "@/lib/onboarding/default-documents";
import { buildPacketPdf } from "@/lib/onboarding/build-packet-pdf";
import { callApi } from "@/lib/api/client";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { ADMIN_ROLES, RoleGuard } from "@/components/auth/role-guard";

type RoleFilter = "everyone" | OnboardingRole;

const ROLE_CHIPS: { key: RoleFilter; label: string }[] = [
  { key: "everyone", label: "All documents" },
  { key: "maintenance", label: "Maintenance" },
  { key: "fnb", label: "Food & Beverage" },
  { key: "pro-shop", label: "Pro Shop" },
  { key: "rec-aide", label: "Rec Aide" },
  { key: "manager", label: "Manager / GM" },
  { key: "all", label: "Shared (all staff)" },
];

interface Draft {
  id?: string;
  title: string;
  category: OnboardingCategory;
  roles: OnboardingRole[];
  body: string;
}

const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold text-foreground mt-1 mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-foreground mt-4 mb-1.5">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-foreground/90 leading-relaxed my-1.5">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 my-1.5 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 my-1.5 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm text-foreground/90 leading-relaxed">{children}</li>
  ),
  hr: () => <hr className="my-3 border-border" />,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border px-2 py-1 text-left bg-muted/50 font-medium">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-2 py-1">{children}</td>
  ),
};

export default function OnboardingPage() {
  return (
    <RoleGuard
      allowedRoles={ADMIN_ROLES}
      fallback={(
        <div className="gk-page mx-auto">
          <h1>Onboarding Packet</h1>
          <div role="alert" className="gk-card mt-4 p-4 text-sm text-muted-foreground">
            Onboarding definitions and packet generation are restricted to authorized management.
          </div>
        </div>
      )}
    >
      <OnboardingContent />
    </RoleGuard>
  );
}

function OnboardingContent() {
  const { docs, loading, error, saveDoc, createDoc, deleteDoc, restoreDefaults } =
    useOnboardingDocs();

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("everyone");
  const [catFilter, setCatFilter] = useState<OnboardingCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<OnboardingDoc | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiUndo, setAiUndo] = useState<string | null>(null);

  const matchesRole = (d: OnboardingDoc, f: RoleFilter) =>
    f === "everyone" ||
    d.roles.includes(f) ||
    (f !== "all" && f !== "manager" && d.roles.includes("all"));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (!matchesRole(d, roleFilter)) return false;
      if (catFilter !== "all" && d.category !== catFilter) return false;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, roleFilter, catFilter, search]);

  const pickRole = (f: RoleFilter) => {
    setRoleFilter(f);
    setCatFilter("all");
    if (f === "everyone") {
      setSelected(new Set());
    } else {
      setSelected(new Set(docs.filter((d) => matchesRole(d, f)).map((d) => d.id)));
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllShown = () =>
    setSelected((prev) => new Set([...prev, ...visible.map((d) => d.id)]));
  const clearSel = () => setSelected(new Set());

  const download = async () => {
    const chosen = docs
      .filter((d) => selected.has(d.id))
      .sort((a, b) => a.sort_order - b.sort_order);
    if (chosen.length === 0) return;
    const roleLabel = roleFilter === "everyone" ? null : ROLE_LABELS[roleFilter];
    const subtitle =
      roleFilter === "everyone"
        ? "Full staff document library"
        : roleFilter === "all"
          ? "Shared — all staff"
          : `New ${roleLabel} hire`;
    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const pdf = buildPacketPdf(
      chosen.map((d) => ({
        title: d.title,
        body: d.body,
        categoryLabel: CATEGORY_LABELS[d.category],
      })),
      { title: "New Hire Packet", subtitle, dateStr },
    );
    const part =
      roleFilter === "everyone"
        ? "All-Staff"
        : ROLE_LABELS[roleFilter].replace(/[^a-z0-9]+/gi, "-");
    const filename = `VMGC-${part}-Packet.pdf`;
    pdf.save(filename);
    // Save a copy to the Documents library so it can be retrieved later.
    try {
      await saveCreatedDocument({
        docType: "onboarding_packet",
        title: `Onboarding packet — ${roleLabel || "All staff"}`,
        blob: pdf.output("blob"),
        filename,
        meta: { role: roleFilter, count: chosen.length },
      });
    } catch {
      /* best-effort */
    }
  };

  const resetAi = () => {
    setAiInstruction("");
    setAiError(null);
    setAiApplied(false);
    setAiUndo(null);
  };
  const openNew = () => {
    resetAi();
    setDraft({ title: "", category: "sop", roles: ["all"], body: "# New document\n\n" });
  };
  const openEdit = (d: OnboardingDoc) => {
    resetAi();
    setDraft({ id: d.id, title: d.title, category: d.category, roles: [...d.roles], body: d.body });
  };

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    try {
      if (draft.id) {
        await saveDoc(draft.id, {
          title: draft.title.trim(),
          category: draft.category,
          roles: draft.roles,
          body: draft.body,
        });
      } else {
        await createDoc({
          title: draft.title.trim(),
          category: draft.category,
          roles: draft.roles,
          body: draft.body,
        });
      }
      setDraft(null);
    } catch {
      // keep the editor open on failure
    } finally {
      setSaving(false);
    }
  };

  const applyAiEdit = async () => {
    if (!draft || !aiInstruction.trim()) return;
    const before = draft.body;
    setAiBusy(true);
    setAiError(null);
    try {
      const prompt = `I maintain the written SOP and training documents for Veterans Memorial Golf Course. Update the document below to reflect my requested change, and return the COMPLETE updated document.

Rules:
- Keep the same Markdown structure and formatting (#/## headings, "- " bullets, "1." numbered steps, **bold**, tables).
- Apply my change accurately and adjust any related wording so the document stays consistent (e.g. remove steps that no longer apply, update related sections).
- Leave everything my change doesn't affect exactly as it is.
- Output ONLY the updated document text — no preamble, no commentary, no code fences.

DOCUMENT TITLE: ${draft.title || "(untitled)"}

MY REQUESTED CHANGE:
${aiInstruction.trim()}

CURRENT DOCUMENT:
${draft.body}`;
      const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
        method: "POST",
        body: { message: prompt, history: [] },
      });
      let text = (reply?.reply ?? "").trim();
      const fence = text.match(/^```(?:markdown)?\s*([\s\S]*?)\s*```$/);
      if (fence) text = fence[1].trim();
      if (!text) {
        setAiError("The AI didn't return anything. Try rewording your request.");
        return;
      }
      setDraft((prev) => (prev ? { ...prev, body: text } : prev));
      setAiUndo(before);
      setAiInstruction("");
      setAiApplied(true);
    } catch {
      setAiError("Couldn't reach the AI. You can still edit the document by hand above.");
    } finally {
      setAiBusy(false);
    }
  };

  const undoAiEdit = () => {
    if (aiUndo === null) return;
    setDraft((prev) => (prev ? { ...prev, body: aiUndo } : prev));
    setAiUndo(null);
    setAiApplied(false);
  };

  const removeDraft = async () => {
    if (!draft?.id) return;
    if (!window.confirm(`Retire "${draft.title}"? Its audit history will be preserved.`)) return;
    setSaving(true);
    try {
      await deleteDoc(draft.id);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(draft.id!);
        return n;
      });
      setDraft(null);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  };

  const doRestore = async () => {
    if (!window.confirm("Restore all default documents to their original wording? Your custom documents are kept, but edits to the built-in ones will be overwritten."))
      return;
    setRestoring(true);
    try {
      await restoreDefaults();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-40 max-w-3xl mx-auto">
      <PageHeader
        title="Onboarding & SOPs"
        description="Build a new-hire packet — pick a role, adjust, and download as one PDF"
        icon={GraduationCap}
      />

      {/* Role chips */}
      <div className="gk-scroll-x flex gap-2 mb-3 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        {ROLE_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => pickRole(c.key)}
            className={cn(
              "shrink-0 px-3.5 py-2 rounded-full text-sm font-medium transition-colors border",
              roleFilter === c.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Secondary controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value as OnboardingCategory | "all")}
          className="h-10 px-3 rounded-lg border border-input bg-background text-sm"
        >
          <option value="all">All types</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <button onClick={selectAllShown} className="text-primary font-medium hover:underline">
            Select shown
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button onClick={clearSel} className="text-muted-foreground hover:underline">
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New
          </button>
          <button
            onClick={doRestore}
            disabled={restoring}
            title="Restore default documents"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-sm text-muted-foreground"
          >
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load documents: {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No documents match. Try a different role or type.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => {
            const isSel = selected.has(d.id);
            return (
              <div
                key={d.id}
                className={cn(
                  "gk-card p-3 flex items-start gap-3 transition-colors",
                  isSel && "ring-1 ring-primary/40 bg-primary/[0.03]",
                )}
              >
                <button
                  onClick={() => toggle(d.id)}
                  aria-label={isSel ? "Deselect" : "Select"}
                  className="mt-0.5 shrink-0 text-primary"
                >
                  {isSel ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground/50" />}
                </button>
                <button onClick={() => toggle(d.id)} className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-sm text-foreground leading-snug">{d.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {CATEGORY_LABELS[d.category]}
                    </span>
                    {d.roles.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setPreview(d)}
                    aria-label="Preview"
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(d)}
                    aria-label="Edit"
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Spacer so the sticky download bar can't hide the last documents */}
      {selected.size > 0 && <div aria-hidden className="h-24" />}

      {/* Sticky download bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 z-40 bottom-[calc(72px_+_env(safe-area-inset-bottom,0px))] md:bottom-0 bg-background/95 backdrop-blur-md border-t border-border">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-semibold">{selected.size}</span>{" "}
              <span className="text-muted-foreground">
                document{selected.size !== 1 ? "s" : ""} selected
              </span>
            </span>
            <button
              onClick={download}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition"
            >
              <Download className="w-4 h-4" /> Download packet (PDF)
            </button>
          </div>
        </div>
      )}

      {/* Preview overlay */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-card w-full sm:max-w-2xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-semibold text-sm truncate pr-2">{preview.title}</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const d = preview;
                    setPreview(null);
                    openEdit(d);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-sm text-muted-foreground"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Close"
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <ReactMarkdown components={mdComponents}>{preview.body}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Editor overlay */}
      {draft && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="bg-card w-full sm:max-w-2xl max-h-[92dvh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-semibold text-sm">{draft.id ? "Edit document" : "New document"}</h3>
              <button
                onClick={() => setDraft(null)}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                  placeholder="Document title"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value as OnboardingCategory })
                    }
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Applies to</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {ROLE_ORDER.map((r) => {
                      const on = draft.roles.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              roles: on
                                ? draft.roles.filter((x) => x !== r)
                                : [...draft.roles, r],
                            })
                          }
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-medium border",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-muted-foreground border-border",
                          )}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Content <span className="text-muted-foreground/60">(Markdown — #, ##, -, 1., **bold**)</span>
                </label>
                <AutoResizeTextarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono leading-relaxed min-h-[22rem]"
                />
              </div>
            </div>
            {/* AI edit box — pinned below the scrolling document so you can read
                the SOP and still type a change request at any time. */}
            <div className="shrink-0 border-t border-border bg-primary/5 px-4 py-3 space-y-2">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Ask AI to change this document
              </label>
              <textarea
                value={aiInstruction}
                onChange={(e) => {
                  setAiInstruction(e.target.value);
                  if (aiApplied) setAiApplied(false);
                }}
                rows={2}
                placeholder="e.g. We pressure wash the carts after every round and wipe them dry — we don't clean them again at end of day."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
              />
              {aiError && <p className="text-xs text-destructive">{aiError}</p>}
              {aiApplied && !aiError && (
                <p className="text-xs text-green-600">Updated — review the document above, then Save.</p>
              )}
              <div className="flex items-center justify-between gap-2">
                {aiUndo !== null ? (
                  <button
                    onClick={undoAiEdit}
                    disabled={aiBusy}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo last AI change
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={applyAiEdit}
                  disabled={aiBusy || !aiInstruction.trim()}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
                >
                  {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiBusy ? "Updating…" : "Update with AI"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border shrink-0">
              {draft.id ? (
                <button
                  onClick={removeDraft}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDraft}
                  disabled={saving || !draft.title.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
