"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Trash2,
  ShieldAlert,
  Pencil,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directInsertRow,
  directStorageUpload,
  getCachedUserId,
} from "@/lib/supabase/rest";
import {
  auditPr,
  normalizePrItems,
  money,
  type ExtractedPr,
  type AuditResult,
} from "@/lib/pr-audit/audit";
import {
  extractPrsBatch,
  MAX_PR_BATCH,
  type ExtractedPrFile,
} from "@/lib/pr-audit/extract-client";
import { FindingsSummary, FindingsList } from "@/components/pr-audit/findings";
import { emptyItem } from "@/components/pr-audit/pr-editor";
import { usePrCodes } from "@/lib/hooks/usePrCodes";
import type { PrAudit } from "@/types/database";

const STORAGE_BUCKET = "vendor-files";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "pr";
}

function formatDate(iso: string | null): string {
  if (!iso) return "date not read";
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** One row in the confirm list, with its live audit. */
interface BatchRow extends ExtractedPrFile {
  key: string;
}

function buildRowFromBlank(): ExtractedPr {
  return {
    date_prepared: todayIso(),
    vendor_name: null,
    requestor_name: null,
    internal_order: null,
    items: [emptyItem()],
    attached_other: "Vendor Quote",
    printed_total: null,
    warnings: [],
  };
}

// ── Confirm-list card ─────────────────────────────────────────────────────────

function BatchCard({
  row,
  audit,
  onRemove,
}: {
  row: BatchRow;
  audit: AuditResult;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            audit.errorCount > 0
              ? "bg-red-500/10 text-red-600"
              : audit.warningCount > 0
                ? "bg-amber-500/10 text-amber-600"
                : "bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {audit.errorCount > 0 || audit.warningCount > 0 ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">
            {row.extracted.vendor_name || "Vendor TBD"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {formatDate(row.extracted.date_prepared)} · {money(audit.computedTotal)}
            {" · "}
            {row.file.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from batch"
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-t border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"
      >
        <FindingsSummary
          errorCount={audit.errorCount}
          warningCount={audit.warningCount}
          infoCount={audit.infoCount}
        />
        {open ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      {open && (
        <div className="p-3 border-t border-border bg-muted/20">
          {row.failed && (
            <div className="mb-2">
              <p className="text-xs text-amber-600">
                Couldn&apos;t read this file automatically — open it after saving
                to fill in the details.
              </p>
              {row.warnings.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Reason: {row.warnings[0]}
                </p>
              )}
            </div>
          )}
          <FindingsList findings={audit.findings} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewPrAuditPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractCount, setExtractCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [creatingManual, setCreatingManual] = useState(false);

  const { validCodes } = usePrCodes();

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // Live audit per row.
  const audits = useMemo(
    () => rows.map((r) => auditPr(r.extracted, validCodes)),
    [rows, validCodes],
  );

  const totals = useMemo(() => {
    let errors = 0;
    let withIssues = 0;
    for (const a of audits) {
      errors += a.errorCount;
      if (a.errorCount > 0 || a.warningCount > 0) withIssues++;
    }
    return { errors, withIssues, clean: rows.length - withIssues };
  }, [audits, rows.length]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    setExtracting(true);
    setExtractCount(picked.length);
    setError(null);
    try {
      const { results, droppedForCap } = await extractPrsBatch(picked);
      const newRows: BatchRow[] = results.map((r, i) => ({
        ...r,
        key: `${Date.now()}-${i}-${r.file.name}`,
      }));
      setRows((prev) => [...prev, ...newRows]);
      if (droppedForCap > 0) {
        setError(
          `Only the first ${MAX_PR_BATCH} files were read (batch limit). Upload the rest in another batch.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the files.");
    } finally {
      setExtracting(false);
    }
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (rows.length === 0) return;
    setSaving(true);
    setSavedCount(0);
    setError(null);
    const failures: string[] = [];
    const savedKeys = new Set<string>();

    for (const row of rows) {
      try {
        const ex = row.extracted;
        const audit = auditPr(ex, validCodes);
        // Upload the original file for the record.
        const folder = crypto.randomUUID();
        const path = `pr-audit/${folder}/${sanitizeFilename(row.file.name)}`;
        await directStorageUpload(STORAGE_BUCKET, path, row.file, "pr-audit.batchUpload");

        const insertRow = {
          file_path: path,
          file_name: row.file.name,
          file_uploaded_at: new Date().toISOString(),
          pr_date: ex.date_prepared || todayIso(),
          vendor_name: ex.vendor_name,
          requestor_name: ex.requestor_name,
          internal_order: ex.internal_order,
          items: normalizePrItems(ex.items),
          attached_other: ex.attached_other,
          printed_total: ex.printed_total,
          audit_findings: audit.findings,
          audit_error_count: audit.errorCount,
          audit_warning_count: audit.warningCount,
          computed_total: audit.computedTotal,
          review_status: "pending" as const,
          created_by: getCachedUserId(),
        };
        await directInsertRow<PrAudit>("pr_audits", insertRow, "pr-audit.batchInsert");
        savedKeys.add(row.key);
        setSavedCount((c) => c + 1);
      } catch (err) {
        failures.push(
          `${row.extracted.vendor_name || row.file.name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (failures.length === 0) {
      router.push("/pr-audit");
      return;
    }
    // Keep only the ones that failed so he can retry.
    setRows((prev) => prev.filter((r) => !savedKeys.has(r.key)));
    setError(
      `Saved ${savedKeys.size}. ${failures.length} couldn't be saved:\n${failures.join("\n")}`,
    );
    setSaving(false);
  }, [rows, router, validCodes]);

  const handleManual = useCallback(async () => {
    setCreatingManual(true);
    setError(null);
    try {
      const ex = buildRowFromBlank();
      const audit = auditPr(ex, validCodes);
      const inserted = await directInsertRow<PrAudit>(
        "pr_audits",
        {
          file_path: null,
          file_name: null,
          file_uploaded_at: null,
          pr_date: ex.date_prepared,
          vendor_name: null,
          requestor_name: null,
          internal_order: null,
          items: normalizePrItems(ex.items),
          attached_other: ex.attached_other,
          printed_total: null,
          audit_findings: audit.findings,
          audit_error_count: audit.errorCount,
          audit_warning_count: audit.warningCount,
          computed_total: audit.computedTotal,
          review_status: "pending" as const,
          created_by: getCachedUserId(),
        },
        "pr-audit.manualInsert",
      );
      router.push(`/pr-audit/view?id=${inserted.id}&edit=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a PR.");
      setCreatingManual(false);
    }
  }, [router, validCodes]);

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
          <h1 className="text-lg font-bold">Upload &amp; Audit PRs</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-40 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold leading-tight">Upload &amp; Audit PRs</h1>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Upload dropzone */}
      <button
        type="button"
        disabled={extracting || saving}
        onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-border bg-card p-6 flex flex-col items-center gap-2 hover:border-primary/40 hover:bg-muted/30 transition-colors disabled:opacity-60"
      >
        {extracting ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="font-semibold text-sm">
              Reading {extractCount} PR{extractCount !== 1 ? "s" : ""}…
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-semibold text-sm">
              {rows.length > 0 ? "Add more PRs" : "Tap to upload PRs"}
            </p>
            <p className="text-[11px] text-muted-foreground text-center">
              Pick several at once — each file becomes its own PR. PDF or photo,
              up to {MAX_PR_BATCH} per batch.
            </p>
          </>
        )}
      </button>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2 whitespace-pre-line">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {rows.length === 0 && !extracting && (
        <button
          type="button"
          onClick={handleManual}
          disabled={creatingManual}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card font-medium hover:bg-muted/40 transition-colors disabled:opacity-60"
        >
          {creatingManual ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Pencil className="w-4 h-4" />
          )}
          Enter a PR manually
        </button>
      )}

      {/* Confirm list */}
      {rows.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {rows.length} PR{rows.length !== 1 ? "s" : ""} to save
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {totals.clean} clean · {totals.withIssues} with issues
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <BatchCard
                key={row.key}
                row={row}
                audit={audits[i]}
                onRemove={() => removeRow(row.key)}
              />
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            They&apos;ll be saved as <span className="font-medium">pending</span>{" "}
            and marked <span className="font-medium">not looked at</span>. Open
            each from the list to review, fix anything, approve, and download.
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Saving {savedCount}/
                {rows.length}…
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" /> Save all {rows.length} PR
                {rows.length !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
