"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  Trash2,
  FileText,
  Download,
  Loader2,
  Building2,
  Pencil,
  X,
  Save,
  Sparkles,
  RefreshCw,
  Lightbulb,
  Plus,
  FileCheck2,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectRow,
  directSelectList,
  directPatchRow,
  directDeleteRow,
  directStorageDelete,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type {
  PrAudit,
  PrAuditReviewStatus,
  PrCodeKind,
  PurchaseRequest,
} from "@/types/database";
import {
  auditPr,
  costCenterBreakdown,
  normalizePrItems,
  money,
  type ExtractedPr,
} from "@/lib/pr-audit/audit";
import { runFitCheck, type FitFinding } from "@/lib/pr-audit/fit";
import {
  downloadOriginalFile,
  downloadStoredFile,
  getAuditPreviewBlob,
  type AuditPreview,
} from "@/lib/pr-audit/download";
import { FilePreviewOverlay } from "@/components/pr-audit/file-preview";
import { FindingsList, FindingsSummary } from "@/components/pr-audit/findings";
import { PrEditor } from "@/components/pr-audit/pr-editor";
import {
  DownloadChecklist,
  type Section889Note,
} from "@/components/pr-audit/download-checklist";
import { usePrCodes } from "@/lib/hooks/usePrCodes";
import { REVIEW_META, REVIEW_ORDER, flagsAccepted } from "@/lib/pr-audit/lifecycle";
import { buildPrBundle } from "@/lib/reports/pr-bundle";
import { createPrCode, KIND_LABEL, type CodeDraft } from "@/lib/pr-audit/codes-crud";
import { AddCodeModal } from "@/components/pr-audit/add-code-modal";

const STORAGE_BUCKET = "vendor-files";

function formatDate(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One labelled line in the built-PR details card. Hidden when empty. */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

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

function ViewPrAuditInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const startEditing = searchParams.get("edit") === "1";
  const { profile, loading: authLoading } = useAuth();
  const codes = usePrCodes();

  const [audit, setAudit] = useState<PrAudit | null>(null);
  const [draft, setDraft] = useState<ExtractedPr | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI fit-check
  const [fitRunning, setFitRunning] = useState(false);
  const fitAutoRan = useRef(false);

  // Add-missing-code popup
  const [addingCode, setAddingCode] = useState<{ kind: PrCodeKind; code: string } | null>(null);
  const [savingNewCode, setSavingNewCode] = useState(false);

  // Bundle attachment download (quote / 889)
  const [dlAttachment, setDlAttachment] = useState<string | null>(null);

  // Linked built PR (when imported from the PR builder) + accepted-flags toggle.
  const [linkedPr, setLinkedPr] = useState<PurchaseRequest | null>(null);
  const [showFlags, setShowFlags] = useState(false);

  // In-app PR document preview.
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Download checklist
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [section889, setSection889] = useState<Section889Note>({
    tone: "muted",
    text: "Confirm the vendor's Section 889 is on file and not expired.",
  });

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
        if (!row.viewed_at) {
          const viewedAt = new Date().toISOString();
          directPatchRow(
            "pr_audits",
            "id",
            row.id,
            { viewed_at: viewedAt },
            "pr-audit.view.markViewed",
          ).catch(() => {});
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

  // Fetch the linked built PR (for the rich details section + zip regeneration).
  useEffect(() => {
    const pid = audit?.purchase_request_id;
    if (!pid) {
      setLinkedPr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pr = await directSelectRow<PurchaseRequest>(
          "purchase_requests",
          "id",
          pid,
          "*",
          "pr-audit.view.linkedPr",
        );
        if (!cancelled) setLinkedPr(pr);
      } catch {
        if (!cancelled) setLinkedPr(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audit?.purchase_request_id]);

  const liveAudit = useMemo(
    () => (draft ? auditPr(draft, codes.validCodes) : null),
    [draft, codes.validCodes],
  );

  const breakdown = useMemo(() => {
    if (!audit) return [];
    return costCenterBreakdown(audit.items ?? []).map((b) => ({
      ...b,
      label: b.cost_ctr ? codes.labelFor("cost_center", b.cost_ctr) || b.label : b.label,
    }));
  }, [audit, codes]);

  const glBreakdown = useMemo(() => {
    if (!audit) return [];
    const map = new Map<string, number>();
    for (const it of audit.items ?? []) {
      const gl = (it.gl_acct ?? "").trim() || "Unassigned";
      const amt = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      map.set(gl, (map.get(gl) ?? 0) + amt);
    }
    return Array.from(map.entries())
      .map(([gl, amount]) => ({ gl, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [audit]);

  // Codes on this PR that aren't in the app's lists yet (so he can add them).
  const unknownCodes = useMemo(() => {
    if (!audit || codes.loading) return [];
    const seen = new Set<string>();
    const out: Array<{ kind: PrCodeKind; code: string }> = [];
    for (const it of audit.items ?? []) {
      const checks: Array<[PrCodeKind, string, Set<string>]> = [
        ["site", (it.site ?? "").trim(), codes.validCodes.sites],
        ["cost_center", (it.cost_ctr ?? "").trim(), codes.validCodes.costCenters],
        ["gl_account", (it.gl_acct ?? "").trim(), codes.validCodes.glAccounts],
      ];
      for (const [kind, code, set] of checks) {
        if (code && !set.has(code)) {
          const key = `${kind}:${code}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ kind, code });
          }
        }
      }
    }
    return out;
  }, [audit, codes.loading, codes.validCodes]);

  const saveNewCode = useCallback(
    async (draft: CodeDraft) => {
      if (!addingCode || !audit) return;
      setSavingNewCode(true);
      setError(null);
      try {
        const countForKind =
          addingCode.kind === "site"
            ? codes.sites.length
            : addingCode.kind === "cost_center"
              ? codes.costCenters.length
              : codes.glAccounts.length;
        const { code } = await createPrCode(
          addingCode.kind,
          draft,
          codes.categories.length,
          countForKind,
        );
        // Re-audit the PR with the newly-valid code so the stored findings update.
        const updated = {
          sites: new Set(codes.validCodes.sites),
          costCenters: new Set(codes.validCodes.costCenters),
          glAccounts: new Set(codes.validCodes.glAccounts),
        };
        if (addingCode.kind === "site") updated.sites.add(code.code);
        else if (addingCode.kind === "cost_center") updated.costCenters.add(code.code);
        else updated.glAccounts.add(code.code);
        const fresh = auditPr(rowToDraft(audit), updated);
        const patch = {
          audit_findings: fresh.findings,
          audit_error_count: fresh.errorCount,
          audit_warning_count: fresh.warningCount,
          computed_total: fresh.computedTotal,
        };
        await directPatchRow("pr_audits", "id", audit.id, patch, "pr-audit.addCode.reaudit");
        setAudit((prev) => (prev ? { ...prev, ...patch } : prev));
        await codes.refresh();
        setAddingCode(null);
      } catch (err) {
        setError(`Couldn't add the code: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSavingNewCode(false);
      }
    },
    [addingCode, audit, codes],
  );

  const downloadAttachment = useCallback(async (path: string, filename: string) => {
    setDlAttachment(path);
    setError(null);
    try {
      await downloadStoredFile(path, filename);
    } catch (err) {
      setError(`Couldn't download: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDlAttachment(null);
    }
  }, []);

  // ── AI fit-check ─────────────────────────────────────────────────────────

  const runFit = useCallback(
    async (
      forItems: ReadonlyArray<{ description: string; cost_ctr?: string | null }>,
    ) => {
      if (!audit) return;
      setFitRunning(true);
      setError(null);
      try {
        const items = (forItems ?? []).map((it, i) => ({
          index: i,
          description: it.description,
          cost_ctr: it.cost_ctr || null,
        }));
        const ref = codes.costCenters.map((c) => ({
          code: c.code,
          label: c.rawLabel,
          description: c.description,
          examples: c.examples,
        }));
        const findings = await runFitCheck(items, ref);
        const patch = {
          fit_findings: findings,
          fit_suggestion_count: findings.length,
          fit_checked_at: new Date().toISOString(),
        };
        await directPatchRow("pr_audits", "id", audit.id, patch, "pr-audit.fit");
        setAudit((prev) => (prev ? { ...prev, ...patch } : prev));
      } catch (err) {
        setError(
          `Cost-center AI check failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setFitRunning(false);
      }
    },
    [audit, codes.costCenters],
  );

  // Auto-run the fit-check once, when a PR is opened that hasn't been checked.
  useEffect(() => {
    if (!audit || codes.loading || fitAutoRan.current) return;
    fitAutoRan.current = true;
    if (audit.fit_checked_at) return; // already has stored results
    if (codes.costCenters.every((c) => !c.description && !c.examples)) return;
    runFit(audit.items ?? []);
  }, [audit, codes.loading, codes.costCenters, runFit]);

  const applyFit = useCallback(
    (f: FitFinding) => {
      if (!f.suggestedCode) return;
      setDraft((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it, i) =>
          i === f.itemIndex ? { ...it, cost_ctr: f.suggestedCode } : it,
        );
        return { ...prev, items };
      });
      setEditing(true);
    },
    [],
  );

  // ── Save / status / download / delete ──────────────────────────────────────

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
        const patch = {
          ...(editing ? draftPatch() : {}),
          review_status: status,
          review_note: note || null,
          reviewed_by: getCachedUserId(),
          reviewed_at: new Date().toISOString(),
        };
        await directPatchRow("pr_audits", "id", audit.id, patch, "pr-audit.view.setStatus");
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

  /** Compute the 889 note for the checklist, best-effort matching the vendor. */
  const openChecklist = useCallback(async () => {
    setChecklistOpen(true);
    const vendor = (audit?.vendor_name || "").trim();
    if (!vendor) {
      setSection889({
        tone: "muted",
        text: "No vendor on this PR — confirm the Section 889 is on file and not expired.",
      });
      return;
    }
    try {
      const rows = await directSelectList<{
        name: string;
        section_889_expiration_date: string | null;
      }>("vendors", {
        columns: "name,section_889_expiration_date",
        filters: [`name=ilike.${encodeURIComponent(vendor)}`],
        limit: 1,
        label: "pr-audit.vendor889",
      });
      const v = rows[0];
      if (!v) {
        setSection889({
          tone: "muted",
          text: `Confirm ${vendor}'s Section 889 is on file and not expired (no vendor match found).`,
        });
        return;
      }
      if (!v.section_889_expiration_date) {
        setSection889({
          tone: "muted",
          text: `${vendor} is on file but has no 889 expiration recorded — verify it's valid.`,
        });
        return;
      }
      const exp = new Date(v.section_889_expiration_date + "T12:00:00");
      const expired = exp.getTime() < Date.now();
      const expStr = formatDate(v.section_889_expiration_date);
      setSection889(
        expired
          ? { tone: "warn", text: `⚠ ${vendor}'s 889 EXPIRED ${expStr} — update it before sending up.` }
          : { tone: "ok", text: `${vendor}'s 889 is valid (expires ${expStr}).` },
      );
    } catch {
      setSection889({
        tone: "muted",
        text: `Confirm ${vendor}'s Section 889 is on file and not expired.`,
      });
    }
  }, [audit]);

  const confirmDownload = useCallback(async () => {
    if (!audit) return;
    setDownloading(true);
    setError(null);
    try {
      if (linkedPr) {
        // Imported from the builder — rebuild the real PR + quote + 889 zip.
        const { blob, filename } = await buildPrBundle(linkedPr);
        triggerDownload(blob, filename);
      } else {
        await downloadOriginalFile(audit);
      }
      setChecklistOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't download the file.");
    } finally {
      setDownloading(false);
    }
  }, [audit, linkedPr]);

  const openPreview = useCallback(async () => {
    if (!audit) return;
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(await getAuditPreviewBlob(audit));
    } catch (err) {
      setError(`Couldn't open the preview: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPreviewLoading(false);
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
          await directStorageDelete(STORAGE_BUCKET, [audit.file_path], "pr-audit.view.deleteFile");
        } catch {
          /* non-fatal */
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
    return <Centered>Loading...</Centered>;
  }
  if (!isAllowed) {
    return (
      <Shell title="PR Audit">
        <p className="text-sm text-muted-foreground">Access restricted.</p>
      </Shell>
    );
  }
  if (loading) {
    return <Centered>Loading...</Centered>;
  }
  if (notFound || !audit || !draft || !liveAudit) {
    return (
      <Shell title="Not found">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">This audited PR no longer exists.</p>
          <Link href="/pr-audit" className="inline-block mt-3 text-primary font-medium underline">
            Back to PR Audit
          </Link>
        </div>
      </Shell>
    );
  }

  const errorCount = editing ? liveAudit.errorCount : audit.audit_error_count;
  const warningCount = editing ? liveAudit.warningCount : audit.audit_warning_count;
  const total = editing ? liveAudit.computedTotal : audit.computed_total;
  const fitFindings = audit.fit_findings ?? [];
  const bundleFindings = audit.bundle_findings ?? [];
  const hasAttachments = !!audit.quote_path || !!audit.section_889_path;
  const hasBundle = hasAttachments || bundleFindings.length > 0;
  // Once sent up, the AI flags were accepted — collapse them out of the way.
  const accepted = flagsAccepted(audit.review_status);
  const hideFlags = accepted && !showFlags;

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
            {audit.revision > 1 ? ` · Rev ${audit.revision}` : ""}
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
          {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2 whitespace-pre-line">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          {hideFlags ? (
            <button
              type="button"
              onClick={() => setShowFlags(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Flags accepted (sent up) · show
            </button>
          ) : (
            <FindingsSummary errorCount={errorCount} warningCount={warningCount} />
          )}
          <span className="text-lg font-bold shrink-0">{money(total)}</span>
        </div>
        {audit.requestor_name && (
          <p className="text-xs text-muted-foreground">Requested by {audit.requestor_name}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={openPreview}
            disabled={previewLoading}
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-60"
          >
            {previewLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Preview
          </button>
          <button
            type="button"
            onClick={openChecklist}
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
          >
            <Download className="w-4 h-4" />
            Download to sign
            {linkedPr
              ? " (rebuilds PR + quote + 889)"
              : hasAttachments
                ? " (zip: PR + quote + 889)"
                : !audit.file_path
                  ? " (summary PDF)"
                  : ""}
          </button>
        </div>
      </div>

      {/* Built-PR details (imported from the Purchase Request app) */}
      {linkedPr && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" /> Built-PR details
          </h2>
          <div className="space-y-2 text-sm">
            <DetailRow
              label="Requestor"
              value={[linkedPr.requestor_name, linkedPr.requestor_email, linkedPr.requestor_phone]
                .filter(Boolean)
                .join(" · ")}
            />
            <DetailRow
              label="Vendor"
              value={[
                linkedPr.vendor1_name,
                linkedPr.vendor1_poc,
                linkedPr.vendor1_email,
                linkedPr.vendor1_phone,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <DetailRow
              label="Invoice to"
              value={[
                linkedPr.invoice_address,
                linkedPr.invoice_line2,
                linkedPr.invoice_city_state_zip,
              ]
                .filter(Boolean)
                .join(", ")}
            />
            <DetailRow
              label="Deliver to"
              value={[
                linkedPr.delivery_address,
                linkedPr.delivery_line2,
                linkedPr.delivery_city_state_zip,
              ]
                .filter(Boolean)
                .join(", ")}
            />
            <DetailRow label="Justification" value={linkedPr.justification} />
            <DetailRow
              label="IGE"
              value={[
                linkedPr.ige_amount != null ? money(linkedPr.ige_amount) : null,
                linkedPr.ige_based_on ? `based on ${linkedPr.ige_based_on}` : null,
                linkedPr.ige_excess_pct != null ? `${linkedPr.ige_excess_pct}% excess` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
        </div>
      )}

      {/* Quote & 889 cross-check */}
      {hasBundle && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-primary" /> Quote &amp; 889 check
          </h2>

          {hideFlags ? (
            <p className="text-xs text-muted-foreground mb-3">
              Quote &amp; 889 reviewed — flags accepted when sent up.
            </p>
          ) : bundleFindings.length > 0 ? (
            <ul className="space-y-2 mb-3">
              {bundleFindings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 shrink-0 ${
                      f.severity === "error"
                        ? "text-red-600"
                        : f.severity === "warning"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {f.severity === "info" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                  </span>
                  <span>
                    <span className="font-medium">{f.title}.</span> {f.detail}
                    {f.suggestion ? ` ${f.suggestion}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">
              No quote/889 issues found.
            </p>
          )}

          <div className="space-y-1.5">
            {audit.quote_path && (
              <button
                type="button"
                disabled={dlAttachment === audit.quote_path}
                onClick={() =>
                  downloadAttachment(
                    audit.quote_path as string,
                    audit.quote_filename || "quote",
                  )
                }
                className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/40 disabled:opacity-60"
              >
                <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 text-left truncate">
                  Quote: {audit.quote_filename || "attached"}
                  {audit.quote_total != null ? ` · ${money(audit.quote_total)}` : ""}
                </span>
                {dlAttachment === audit.quote_path ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            )}
            {audit.section_889_path && (
              <button
                type="button"
                disabled={dlAttachment === audit.section_889_path}
                onClick={() =>
                  downloadAttachment(
                    audit.section_889_path as string,
                    audit.section_889_filename || "889",
                  )
                }
                className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/40 disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 text-left truncate">
                  889: {audit.section_889_filename || "attached"}
                  {audit.section_889_expiration_date
                    ? ` · exp ${audit.section_889_expiration_date}`
                    : ""}
                </span>
                {dlAttachment === audit.section_889_path ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unknown codes on this PR */}
      {unknownCodes.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 mb-4">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Codes not in your lists
          </h2>
          <p className="text-xs text-muted-foreground mb-2">
            These are on the PR but aren&apos;t set up yet. Add them so the audit and
            budget recognize them.
          </p>
          <div className="flex flex-wrap gap-2">
            {unknownCodes.map((u) => (
              <button
                key={`${u.kind}:${u.code}`}
                type="button"
                onClick={() => setAddingCode(u)}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-card border border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-500/10"
              >
                <Plus className="w-3.5 h-3.5" /> Add {u.code}
                <span className="text-muted-foreground font-normal">({KIND_LABEL[u.kind]})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Review lifecycle */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Status</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {REVIEW_ORDER.map((s) => {
            const meta = REVIEW_META[s];
            const active = audit.review_status === s;
            return (
              <button
                key={s}
                type="button"
                disabled={savingStatus}
                onClick={() => setStatus(s)}
                className={`shrink-0 text-xs font-semibold px-2.5 py-2 rounded-xl border transition-all disabled:opacity-60 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {meta.short}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 gap-2">
          <p className="text-[11px] text-muted-foreground">
            {REVIEW_META[audit.review_status].hint}
          </p>
          <button
            type="button"
            disabled={savingStatus}
            onClick={() => setStatus("sent_back")}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-60 ${
              audit.review_status === "sent_back"
                ? "border-red-500 bg-red-500 text-white"
                : "border-border text-red-600 hover:bg-red-500/10"
            }`}
          >
            Send Back
          </button>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (e.g. what to fix before resubmitting)…"
          rows={2}
          className="mt-3 w-full text-sm rounded-lg border border-border bg-background px-2 py-2 resize-none"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Committed/spent counts once it&apos;s <span className="font-medium">Ordered</span> or
          beyond. Approve &amp; <span className="font-medium">Download to sign</span> when ready.
        </p>
      </div>

      {/* AI cost-center fit-check */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-violet-500" /> Cost-center check
          </h2>
          <button
            type="button"
            onClick={() => runFit(draft.items)}
            disabled={fitRunning}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-60"
          >
            {fitRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-check
          </button>
        </div>
        {fitRunning && fitFindings.length === 0 ? (
          <p className="text-xs text-muted-foreground">Checking cost centers against your descriptions…</p>
        ) : fitFindings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {audit.fit_checked_at
              ? "No cost-center concerns — every line looks correctly assigned."
              : "Not checked yet. Add descriptions/examples to your cost centers (Manage Lists) for this to work."}
          </p>
        ) : (
          <ul className="space-y-2">
            {fitFindings.map((f, i) => (
              <li key={i} className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{f.reason}</p>
                    {f.suggestedCode && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          Suggest: {f.suggestedCode}
                          {codes.labelFor("cost_center", f.suggestedCode)
                            ? ` — ${codes.labelFor("cost_center", f.suggestedCode)}`
                            : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => applyFit(f)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <div>
          <PrEditor
            draft={draft}
            audit={liveAudit}
            codes={{
              sites: codes.sites,
              costCenters: codes.costCenters,
              glAccounts: codes.glAccounts,
            }}
            onChange={setDraft}
          />
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
              {savingEdits ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {savingEdits ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Audit findings
            </h2>
            {hideFlags ? (
              <button
                type="button"
                onClick={() => setShowFlags(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Accepted when sent up — show flags anyway
              </button>
            ) : (
              <FindingsList findings={audit.audit_findings ?? []} />
            )}
          </div>

          {breakdown.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                By cost center
              </h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {breakdown.map((b) => (
                  <div key={b.cost_ctr || "unassigned"} className="flex items-center gap-2 px-3 py-2.5">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{b.label}</p>
                      {b.cost_ctr && <p className="text-[11px] text-muted-foreground">{b.cost_ctr}</p>}
                    </div>
                    <span className="text-sm font-semibold shrink-0">{money(b.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {glBreakdown.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                By G/L account
              </h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {glBreakdown.map((g) => (
                  <div key={g.gl} className="flex items-center gap-2 px-3 py-2.5">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {codes.labelFor("gl_account", g.gl) || g.gl}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{g.gl}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{money(g.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                          <span className="text-muted-foreground"> · {it.part_number}</span>
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
        </>
      )}

      <DownloadChecklist
        open={checklistOpen}
        prTotalText={money(audit.computed_total)}
        section889={section889}
        confirming={downloading}
        onConfirm={confirmDownload}
        onCancel={() => setChecklistOpen(false)}
      />

      {/* Add-missing-code popup */}
      <AddCodeModal
        target={addingCode}
        categories={codes.categories}
        saving={savingNewCode}
        onCancel={() => setAddingCode(null)}
        onSave={saveNewCode}
      />

      <FilePreviewOverlay source={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 pb-32 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export default function ViewPrAuditPage() {
  return (
    <Suspense fallback={<Centered>Loading...</Centered>}>
      <ViewPrAuditInner />
    </Suspense>
  );
}
