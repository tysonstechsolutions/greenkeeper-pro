"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Trash2,
  FileText,
  Download,
  Loader2,
  Building2,
  Pencil,
  X,
  Save,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectRow,
  directPatchRow,
  directDeleteRow,
  directStorageDelete,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type {
  PrAudit,
  PrAuditReviewStatus,
} from "@/types/database";
import {
  auditPr,
  costCenterBreakdown,
  normalizePrItems,
  money,
  type ExtractedPr,
} from "@/lib/pr-audit/audit";
import { downloadOriginalFile } from "@/lib/pr-audit/download";
import { FindingsList, FindingsSummary } from "@/components/pr-audit/findings";
import { PrEditor } from "@/components/pr-audit/pr-editor";

const STORAGE_BUCKET = "vendor-files";

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Stored row → editable draft. */
function rowToDraft(r: PrAudit): ExtractedPr {
  return {
    date_prepared: r.pr_date,
    vendor_name: r.vendor_name,
    requestor_name: r.requestor_name,
    internal_order: r.internal_order,
    items: (r.items ?? []).map((it) => ({
      description: it.description,
      part_number: it.part_number ?? null,
      qty: it.qty,
      unit: it.unit ?? null,
      unit_price: it.unit_price,
      site: it.site || null,
      cost_ctr: it.cost_ctr || null,
      gl_acct: it.gl_acct || null,
      extended_price: null,
    })),
    attached_other: r.attached_other,
    printed_total: r.printed_total,
    warnings: [],
  };
}

const REVIEW_OPTIONS: Array<{
  value: PrAuditReviewStatus;
  label: string;
  icon: typeof Clock;
  active: string;
}> = [
  {
    value: "approved",
    label: "Approve",
    icon: ShieldCheck,
    active: "bg-emerald-500 text-white border-emerald-500",
  },
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    active: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "sent_back",
    label: "Send Back",
    icon: AlertTriangle,
    active: "bg-red-500 text-white border-red-500",
  },
];

function ViewPrAuditInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const startEditing = searchParams.get("edit") === "1";
  const { profile, loading: authLoading } = useAuth();

  const [audit, setAudit] = useState<PrAudit | null>(null);
  const [draft, setDraft] = useState<ExtractedPr | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  useEffect(() => {
    if (!isAllowed) return;
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await directSelectRow<PrAudit>(
          "pr_audits",
          "id",
          id,
          "*",
          "pr-audit.view.fetch",
        );
        if (cancelled) return;
        if (!row) {
          setNotFound(true);
          return;
        }
        setAudit(row);
        setDraft(rowToDraft(row));
        setNote(row.review_note ?? "");
        if (startEditing) setEditing(true);
        // Mark "looked at" the first time it's opened.
        if (!row.viewed_at) {
          const viewedAt = new Date().toISOString();
          directPatchRow(
            "pr_audits",
            "id",
            row.id,
            { viewed_at: viewedAt },
            "pr-audit.view.markViewed",
          ).catch(() => {
            /* non-fatal */
          });
          setAudit((prev) => (prev ? { ...prev, viewed_at: viewedAt } : prev));
        }
      } catch (err) {
        console.error("[pr-audit] view fetch failed:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAllowed, id, startEditing]);

  // Live audit of the current draft (used while editing + for persisting edits).
  const liveAudit = useMemo(
    () => (draft ? auditPr(draft) : null),
    [draft],
  );

  const breakdown = useMemo(
    () => (audit ? costCenterBreakdown(audit.items ?? []) : []),
    [audit],
  );

  /** Patch payload capturing the current edited PR contents + fresh audit. */
  const draftPatch = useCallback(() => {
    if (!draft || !liveAudit) return {};
    return {
      pr_date: draft.date_prepared || audit?.pr_date,
      vendor_name: draft.vendor_name,
      requestor_name: draft.requestor_name,
      internal_order: draft.internal_order,
      items: normalizePrItems(draft.items),
      attached_other: draft.attached_other,
      printed_total: draft.printed_total,
      audit_findings: liveAudit.findings,
      audit_error_count: liveAudit.errorCount,
      audit_warning_count: liveAudit.warningCount,
      computed_total: liveAudit.computedTotal,
    };
  }, [draft, liveAudit, audit]);

  const saveEdits = useCallback(async () => {
    if (!audit || !draft) return;
    if (!draft.date_prepared) {
      setError("Set the Date Prepared before saving — it drives the budget month.");
      return;
    }
    setSavingEdits(true);
    setError(null);
    try {
      const patch = draftPatch();
      await directPatchRow("pr_audits", "id", audit.id, patch, "pr-audit.view.saveEdits");
      setAudit({ ...audit, ...(patch as Partial<PrAudit>) });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingEdits(false);
    }
  }, [audit, draft, draftPatch]);

  const setStatus = useCallback(
    async (status: PrAuditReviewStatus) => {
      if (!audit) return;
      setSavingStatus(true);
      setError(null);
      try {
        // Persist any on-screen edits along with the status so nothing is lost.
        const patch = {
          ...(editing ? draftPatch() : {}),
          review_status: status,
          review_note: note || null,
          reviewed_by: getCachedUserId(),
          reviewed_at: new Date().toISOString(),
        };
        await directPatchRow(
          "pr_audits",
          "id",
          audit.id,
          patch,
          "pr-audit.view.setStatus",
        );
        setAudit({ ...audit, ...(patch as Partial<PrAudit>) });
        if (editing) setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update the status.");
      } finally {
        setSavingStatus(false);
      }
    },
    [audit, note, editing, draftPatch],
  );

  const handleDownload = useCallback(async () => {
    if (!audit) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadOriginalFile(audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't download the file.");
    } finally {
      setDownloading(false);
    }
  }, [audit]);

  const handleDelete = useCallback(async () => {
    if (!audit) return;
    if (
      !confirm(
        `Delete this audited PR (${audit.vendor_name || "Vendor TBD"}, ${formatDate(
          audit.pr_date,
        )})? This can't be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await directDeleteRow("pr_audits", "id", audit.id, "pr-audit.view.delete");
      if (audit.file_path) {
        try {
          await directStorageDelete(
            STORAGE_BUCKET,
            [audit.file_path],
            "pr-audit.view.deleteFile",
          );
        } catch {
          /* non-fatal — row is gone; an orphaned file is harmless */
        }
      }
      router.push("/pr-audit");
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    }
  }, [audit, router]);

  const cancelEdit = useCallback(() => {
    if (audit) setDraft(rowToDraft(audit));
    setEditing(false);
    setError(null);
  }, [audit]);

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
          <h1 className="text-lg font-bold">PR Audit</h1>
        </div>
        <p className="text-sm text-muted-foreground">Access restricted.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (notFound || !audit || !draft || !liveAudit) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Not found</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            This audited PR no longer exists.
          </p>
          <Link
            href="/pr-audit"
            className="inline-block mt-3 text-primary font-medium underline"
          >
            Back to PR Audit
          </Link>
        </div>
      </div>
    );
  }

  // Display audit: live while editing, stored otherwise.
  const errorCount = editing ? liveAudit.errorCount : audit.audit_error_count;
  const warningCount = editing ? liveAudit.warningCount : audit.audit_warning_count;
  const total = editing ? liveAudit.computedTotal : audit.computed_total;
  const clean = errorCount === 0 && warningCount === 0;

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight truncate">
            {audit.vendor_name || "Vendor TBD"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(audit.pr_date)}
            {audit.internal_order ? ` · ${audit.internal_order}` : ""}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit"
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <Pencil className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete"
          className="p-2 rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-600 shrink-0 disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Trash2 className="w-5 h-5" />
          )}
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2 whitespace-pre-line">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <FindingsSummary errorCount={errorCount} warningCount={warningCount} />
          <span className="text-lg font-bold shrink-0">{money(total)}</span>
        </div>
        {audit.requestor_name && (
          <p className="text-xs text-muted-foreground">
            Requested by {audit.requestor_name}
          </p>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download to sign
          {!audit.file_path && " (summary PDF)"}
        </button>
      </div>

      {/* Review controls */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Review</h2>
        <div className="grid grid-cols-3 gap-2">
          {REVIEW_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = audit.review_status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={savingStatus}
                onClick={() => setStatus(opt.value)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-60 ${
                  isActive
                    ? opt.active
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (e.g. what to fix before resubmitting)…"
          rows={2}
          className="mt-3 w-full text-sm rounded-lg border border-border bg-background px-2 py-2 resize-none"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Only <span className="font-medium">Approved</span> PRs count toward the
          budget. Approve, then{" "}
          <span className="font-medium">Download to sign</span> and send it up.
        </p>
      </div>

      {editing ? (
        // ── Edit mode ──────────────────────────────────────────────────────
        <div>
          <PrEditor draft={draft} audit={liveAudit} onChange={setDraft} />
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card font-medium hover:bg-muted/40 transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              type="button"
              disabled={savingEdits}
              onClick={saveEdits}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {savingEdits ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" /> Save changes
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        // ── Read-only mode ─────────────────────────────────────────────────
        <>
          {/* Findings */}
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Audit findings
            </h2>
            <FindingsList findings={audit.audit_findings ?? []} />
          </div>

          {/* Cost-center breakdown */}
          {breakdown.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                By cost center
              </h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {breakdown.map((b) => (
                  <div
                    key={b.cost_ctr || "unassigned"}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{b.label}</p>
                      {b.cost_ctr && (
                        <p className="text-[11px] text-muted-foreground">
                          {b.cost_ctr}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      {money(b.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Line items */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Line items ({audit.items?.length ?? 0})
              </h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b border-border">
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Site</th>
                    <th className="px-2 py-2 font-medium">CC</th>
                    <th className="px-2 py-2 font-medium">G/L</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 font-medium text-right">Qty</th>
                    <th className="px-2 py-2 font-medium text-right">Price</th>
                    <th className="px-2 py-2 font-medium text-right">Ext.</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.items ?? []).map((it, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2">{it.site || "—"}</td>
                      <td className="px-2 py-2">{it.cost_ctr || "—"}</td>
                      <td className="px-2 py-2">{it.gl_acct || "—"}</td>
                      <td className="px-2 py-2 min-w-[140px]">
                        {it.description || "—"}
                        {it.part_number ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {it.part_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right">{it.qty}</td>
                      <td className="px-2 py-2 text-right">{money(it.unit_price)}</td>
                      <td className="px-2 py-2 text-right font-medium">
                        {money((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 pr-2">
              <span className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold">{money(audit.computed_total)}</span>
              </span>
            </div>
          </div>

          {clean && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 rounded-xl px-3 py-2">
              <ShieldCheck className="w-4 h-4" />
              This PR passed every audit check.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ViewPrAuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <ViewPrAuditInner />
    </Suspense>
  );
}
