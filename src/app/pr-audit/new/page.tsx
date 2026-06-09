"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
  FileText,
  Receipt,
  ShieldCheck,
  RotateCcw,
  X,
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directInsertRow,
  directPatchRow,
  directSelectList,
  directStorageUpload,
  directStorageDelete,
  getCachedUserId,
} from "@/lib/supabase/rest";
import {
  auditPr,
  normalizePrItems,
  money,
  type AuditResult,
} from "@/lib/pr-audit/audit";
import {
  filesToBundles,
  extractBundle,
  extractBundles,
  type BundleData,
  type BundleInput,
} from "@/lib/pr-audit/bundle";
import { MAX_PR_BATCH } from "@/lib/pr-audit/extract-client";
import {
  buildBundleFindings,
  bundleIssueCounts,
  type BundleFinding,
} from "@/lib/pr-audit/bundle-check";
import {
  findExistingMatch,
  type MatchableAudit,
  type DupMatch,
} from "@/lib/pr-audit/pr-identity";
import { FindingsSummary, FindingsList } from "@/components/pr-audit/findings";
import { emptyItem } from "@/components/pr-audit/pr-editor";
import { usePrCodes } from "@/lib/hooks/usePrCodes";
import { createPrCode, KIND_LABEL, type CodeDraft } from "@/lib/pr-audit/codes-crud";
import { AddCodeModal } from "@/components/pr-audit/add-code-modal";
import { FilePreviewOverlay, type PreviewSource } from "@/components/pr-audit/file-preview";
import type { PrAudit, PrCodeKind } from "@/types/database";
import { REVIEW_META } from "@/lib/pr-audit/lifecycle";

const STORAGE_BUCKET = "vendor-files";
type SlotRole = "pr" | "quote" | "section889";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "file";
}

/** Existing audit, slimmed to what dedup matching + cleanup needs. */
interface MatchAudit extends MatchableAudit {
  review_status: string;
  revision: number | null;
  file_path: string | null;
  quote_path: string | null;
  section_889_path: string | null;
}

interface BundleRow {
  key: string;
  input: BundleInput;
  data: BundleData;
  busy: boolean;
  /** When matched to an existing PR: replace it, or add a new record. */
  mode: "new" | "update";
}

/** Compute the bundle cross-check findings for a row's extraction. */
function computeBundleFindings(data: BundleData): BundleFinding[] {
  const quoteArg =
    data.quote && !data.quote.failed
      ? { items: data.quote.items, vendor: data.quote.vendor }
      : null;
  const s889Arg =
    data.section889 && !data.section889.failed
      ? {
          present: true as const,
          compliant: data.section889.compliant,
          expirationDate: data.section889.expiration_date,
          name: data.section889.name,
        }
      : { present: false as const, compliant: null, expirationDate: null, name: null };

  const base = buildBundleFindings({
    prItems: data.pr.items,
    prVendor: data.pr.vendor_name,
    quote: quoteArg,
    section889: s889Arg,
    asOfIso: todayIso(),
  });

  const extra: BundleFinding[] = [];
  if (data.quote && data.quote.failed) {
    extra.push({
      code: "quote_unreadable",
      severity: "warning",
      title: "Couldn't read the quote",
      detail: "The quote was attached but couldn't be read automatically — check it by hand.",
      suggestion: null,
    });
  }
  if (data.section889 && data.section889.failed) {
    extra.push({
      code: "section_889_unreadable",
      severity: "warning",
      title: "Couldn't read the 889",
      detail: "The 889 was attached but couldn't be read automatically — verify it by hand.",
      suggestion: null,
    });
  }
  return [...base, ...extra];
}

// ── Bundle confirm card ───────────────────────────────────────────────────────

const SLOT_META: Record<SlotRole, { label: string; Icon: typeof FileText }> = {
  pr: { label: "Purchase Request", Icon: FileText },
  quote: { label: "Vendor Quote", Icon: Receipt },
  section889: { label: "Section 889", Icon: ShieldCheck },
};

function SlotLine({
  role,
  filename,
  status,
  busy,
  onPick,
  onRemove,
  onPreview,
}: {
  role: SlotRole;
  filename: string | null;
  status: { text: string; tone: "ok" | "warn" | "muted" } | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onPreview?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = SLOT_META[role];
  const toneCls =
    status?.tone === "ok"
      ? "text-emerald-600"
      : status?.tone === "warn"
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <div className="flex items-center gap-2 py-1.5">
      <meta.Icon
        className={`w-4 h-4 shrink-0 ${filename ? "text-foreground" : "text-muted-foreground/50"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {meta.label}
        </p>
        {filename ? (
          <>
            <p className="text-sm truncate">{filename}</p>
            {status && <p className={`text-[11px] ${toneCls}`}>{status.text}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground/70 italic">none</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : filename ? (
        <div className="flex items-center gap-0.5 shrink-0">
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              aria-label={`Preview ${meta.label}`}
              title="Preview"
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${meta.label}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/50 shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      )}
    </div>
  );
}

function BundleCard({
  row,
  audit,
  bundleFindings,
  match,
  onRemove,
  onPick,
  onRemoveSlot,
  onToggleMode,
  onPreviewFile,
}: {
  row: BundleRow;
  audit: AuditResult;
  bundleFindings: BundleFinding[];
  match: DupMatch<MatchAudit> | null;
  onRemove: () => void;
  onPick: (role: SlotRole, file: File) => void;
  onRemoveSlot: (role: SlotRole) => void;
  onToggleMode: () => void;
  onPreviewFile: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const bundleCounts = bundleIssueCounts(bundleFindings);
  const errors = audit.errorCount + bundleCounts.errors;
  const warnings = audit.warningCount + bundleCounts.warnings;
  const noPr = !row.data.files.pr;

  const quoteStatus = (() => {
    if (!row.data.quote) return null;
    if (row.data.quote.failed) return { text: "couldn't read", tone: "warn" as const };
    const mismatch = bundleFindings.some((f) => f.code === "quote_total_mismatch");
    return mismatch
      ? { text: `${money(row.data.quote.total)} — differs from PR`, tone: "warn" as const }
      : { text: `${money(row.data.quote.total)} — matches`, tone: "ok" as const };
  })();
  const s889Status = (() => {
    const s = row.data.section889;
    if (!s) return null;
    if (s.failed) return { text: "couldn't read", tone: "warn" as const };
    const bad = bundleFindings.some(
      (f) => f.code === "section_889_expired" || f.code === "section_889_noncompliant",
    );
    if (bad) return { text: "invalid / expired", tone: "warn" as const };
    return {
      text: s.expiration_date ? `valid through ${s.expiration_date}` : "valid",
      tone: "ok" as const,
    };
  })();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            noPr || errors > 0
              ? "bg-red-500/10 text-red-600"
              : warnings > 0
                ? "bg-amber-500/10 text-amber-600"
                : "bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {noPr || errors > 0 || warnings > 0 ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">
            {row.data.pr.vendor_name || "Vendor TBD"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {row.data.pr.internal_order ? `${row.data.pr.internal_order} · ` : ""}
            {money(audit.computedTotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove bundle"
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Dedup banner */}
      {match && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Already in your list
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Matches {match.audit.vendor_name || "a PR"}
            {match.audit.internal_order ? ` (${match.audit.internal_order})` : ""} —{" "}
            {REVIEW_META[match.audit.review_status as keyof typeof REVIEW_META]?.short ??
              match.audit.review_status}
            , Rev {match.audit.revision ?? 1}.
          </p>
          <div className="flex gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={onToggleMode}
              className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                row.mode === "update"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              Update it (Rev {(match.audit.revision ?? 1) + 1})
            </button>
            <button
              type="button"
              onClick={onToggleMode}
              className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                row.mode === "new"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              Add as new
            </button>
          </div>
        </div>
      )}

      {/* Three slots */}
      <div className="px-3 divide-y divide-border/60 border-t border-border">
        <SlotLine
          role="pr"
          filename={row.data.names.pr}
          status={
            noPr
              ? { text: "no PR document — add one", tone: "warn" }
              : row.data.prFailed
                ? { text: "couldn't read — edit after saving", tone: "warn" }
                : null
          }
          busy={row.busy}
          onPick={(f) => onPick("pr", f)}
          onRemove={() => onRemoveSlot("pr")}
          onPreview={row.data.files.pr ? () => onPreviewFile(row.data.files.pr as File) : undefined}
        />
        <SlotLine
          role="quote"
          filename={row.data.names.quote}
          status={quoteStatus}
          busy={row.busy}
          onPick={(f) => onPick("quote", f)}
          onRemove={() => onRemoveSlot("quote")}
          onPreview={row.data.files.quote ? () => onPreviewFile(row.data.files.quote as File) : undefined}
        />
        <SlotLine
          role="section889"
          filename={row.data.names.section889}
          status={s889Status}
          busy={row.busy}
          onPick={(f) => onPick("section889", f)}
          onRemove={() => onRemoveSlot("section889")}
          onPreview={
            row.data.files.section889
              ? () => onPreviewFile(row.data.files.section889 as File)
              : undefined
          }
        />
      </div>

      {/* Findings */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-t border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"
      >
        <FindingsSummary
          errorCount={errors}
          warningCount={warnings}
          infoCount={audit.infoCount}
        />
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3 border-t border-border bg-muted/20 space-y-3">
          {bundleFindings.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Quote &amp; 889 check
              </p>
              <ul className="space-y-1.5">
                {bundleFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
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
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <span>
                      <span className="font-medium">{f.title}.</span> {f.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              PR audit
            </p>
            <FindingsList findings={audit.findings} />
          </div>
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

  const [rows, setRows] = useState<BundleRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractCount, setExtractCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [creatingManual, setCreatingManual] = useState(false);
  const [existing, setExisting] = useState<MatchAudit[]>([]);
  const [addingCode, setAddingCode] = useState<{ kind: PrCodeKind; code: string } | null>(null);
  const [savingNewCode, setSavingNewCode] = useState(false);
  const [preview, setPreview] = useState<PreviewSource | null>(null);

  const previewFile = useCallback((file: File) => {
    const isImage =
      (file.type || "").toLowerCase().startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
    setPreview({ blob: file, kind: isImage ? "image" : "pdf", filename: file.name });
  }, []);

  const { validCodes, categories, sites, costCenters, glAccounts, refresh } = usePrCodes();

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // Existing audits, for de-dup / resubmission matching.
  useEffect(() => {
    if (!isAllowed) return;
    (async () => {
      try {
        const data = await directSelectList<MatchAudit>("pr_audits", {
          columns:
            "id,internal_order,file_name,vendor_name,pr_date,computed_total,review_status,revision,file_path,quote_path,section_889_path",
          limit: 1000,
          label: "pr-audit.new.existing",
        });
        setExisting(data);
      } catch {
        setExisting([]);
      }
    })();
  }, [isAllowed]);

  const audits = useMemo(
    () => rows.map((r) => auditPr(r.data.pr, validCodes)),
    [rows, validCodes],
  );
  const bundleFindings = useMemo(
    () => rows.map((r) => computeBundleFindings(r.data)),
    [rows],
  );
  const matches = useMemo(
    () =>
      rows.map((r, i) =>
        findExistingMatch(
          {
            internal_order: r.data.pr.internal_order,
            file_name: r.data.names.pr,
            vendor_name: r.data.pr.vendor_name,
            pr_date: r.data.pr.date_prepared,
            computed_total: audits[i].computedTotal,
          },
          existing,
        ),
      ),
    [rows, existing, audits],
  );

  const totals = useMemo(() => {
    let withIssues = 0;
    rows.forEach((_, i) => {
      const bc = bundleIssueCounts(bundleFindings[i]);
      if (audits[i].errorCount + audits[i].warningCount + bc.errors + bc.warnings > 0)
        withIssues++;
    });
    return { withIssues, clean: rows.length - withIssues };
  }, [rows, audits, bundleFindings]);

  // Unknown codes across the batch (same as before — add on the fly).
  const unknownCodes = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ kind: PrCodeKind; code: string }> = [];
    for (const row of rows) {
      for (const it of row.data.pr.items ?? []) {
        const checks: Array<[PrCodeKind, string, Set<string>]> = [
          ["site", (it.site ?? "").trim(), validCodes.sites],
          ["cost_center", (it.cost_ctr ?? "").trim(), validCodes.costCenters],
          ["gl_account", (it.gl_acct ?? "").trim(), validCodes.glAccounts],
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
    }
    return out;
  }, [rows, validCodes]);

  const saveNewCode = useCallback(
    async (draft: CodeDraft) => {
      if (!addingCode) return;
      setSavingNewCode(true);
      setError(null);
      try {
        const countForKind =
          addingCode.kind === "site"
            ? sites.length
            : addingCode.kind === "cost_center"
              ? costCenters.length
              : glAccounts.length;
        await createPrCode(addingCode.kind, draft, categories.length, countForKind);
        await refresh();
        setAddingCode(null);
      } catch (err) {
        setError(`Couldn't add the code: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSavingNewCode(false);
      }
    },
    [addingCode, sites.length, costCenters.length, glAccounts.length, categories.length, refresh],
  );

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    setExtracting(true);
    setExtractCount(picked.length);
    setError(null);
    try {
      const bundles = await filesToBundles(picked);
      const capped = bundles.slice(0, MAX_PR_BATCH);
      const data = await extractBundles(capped);
      const newRows: BundleRow[] = data.map((d, i) => ({
        key: `${todayIso()}-${Math.round(performance.now())}-${i}`,
        input: capped[i],
        data: d,
        busy: false,
        mode: "update",
      }));
      setRows((prev) => [...prev, ...newRows]);
      if (bundles.length > capped.length) {
        setError(
          `Only the first ${MAX_PR_BATCH} PRs were read (batch limit). Upload the rest separately.`,
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

  const toggleMode = useCallback((key: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, mode: r.mode === "update" ? "new" : "update" } : r,
      ),
    );
  }, []);

  // Re-extract a bundle after a slot change.
  const reExtract = useCallback(async (key: string, newInput: BundleInput) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, input: newInput, busy: true } : r)),
    );
    try {
      const data = await extractBundle(newInput);
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, input: newInput, data, busy: false } : r)),
      );
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, busy: false } : r)));
      setError(err instanceof Error ? err.message : "Couldn't re-read the bundle.");
    }
  }, []);

  const pickSlot = useCallback(
    (key: string, role: SlotRole, file: File) => {
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      const next: BundleInput = { ...row.input };
      if (role === "pr") next.pr = file;
      else if (role === "quote") next.quote = file;
      else next.section889 = file;
      reExtract(key, next);
    },
    [rows, reExtract],
  );

  const removeSlot = useCallback(
    (key: string, role: SlotRole) => {
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      const next: BundleInput = { ...row.input };
      if (role === "pr") next.pr = null;
      else if (role === "quote") next.quote = null;
      else next.section889 = null;
      reExtract(key, next);
    },
    [rows, reExtract],
  );

  const handleSaveAll = useCallback(async () => {
    if (rows.length === 0) return;
    setSaving(true);
    setSavedCount(0);
    setError(null);
    const failures: string[] = [];
    const savedKeys = new Set<string>();
    const userId = getCachedUserId();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const data = row.data;
      if (!data.files.pr) {
        failures.push(`${data.pr.vendor_name || "A bundle"}: no PR document.`);
        continue;
      }
      try {
        const audit = auditPr(data.pr, validCodes);
        const bundleF = computeBundleFindings(data);
        const match = findExistingMatch(
          {
            internal_order: data.pr.internal_order,
            file_name: data.names.pr,
            vendor_name: data.pr.vendor_name,
            pr_date: data.pr.date_prepared,
            computed_total: audit.computedTotal,
          },
          existing,
        );
        const updating = !!match && row.mode === "update";

        // Upload the bundle's files into one folder.
        const folder = crypto.randomUUID();
        const prPath = `pr-audit/${folder}/${sanitizeFilename(data.names.pr || "pr")}`;
        await directStorageUpload(STORAGE_BUCKET, prPath, data.files.pr, "pr-audit.bundle.pr");
        let quotePath: string | null = null;
        if (data.files.quote) {
          quotePath = `pr-audit/${folder}/quote-${sanitizeFilename(data.names.quote || "quote")}`;
          await directStorageUpload(STORAGE_BUCKET, quotePath, data.files.quote, "pr-audit.bundle.quote");
        }
        let s889Path: string | null = null;
        if (data.files.section889) {
          s889Path = `pr-audit/${folder}/889-${sanitizeFilename(data.names.section889 || "889")}`;
          await directStorageUpload(STORAGE_BUCKET, s889Path, data.files.section889, "pr-audit.bundle.889");
        }

        const payload: Record<string, unknown> = {
          file_path: prPath,
          file_name: data.names.pr,
          file_uploaded_at: new Date().toISOString(),
          pr_date: data.pr.date_prepared || todayIso(),
          vendor_name: data.pr.vendor_name,
          requestor_name: data.pr.requestor_name,
          internal_order: data.pr.internal_order,
          items: normalizePrItems(data.pr.items),
          attached_other: data.pr.attached_other,
          printed_total: data.pr.printed_total,
          audit_findings: audit.findings,
          audit_error_count: audit.errorCount,
          audit_warning_count: audit.warningCount,
          computed_total: audit.computedTotal,
        };
        // Bundle columns are only written when there's bundle data, so a plain
        // PR upload still works before the bundle migration is applied.
        if (quotePath) {
          payload.quote_path = quotePath;
          payload.quote_filename = data.names.quote;
          payload.quote_total = data.quote && !data.quote.failed ? data.quote.total : null;
        }
        if (s889Path) {
          payload.section_889_path = s889Path;
          payload.section_889_filename = data.names.section889;
          payload.section_889_expiration_date =
            data.section889 && !data.section889.failed ? data.section889.expiration_date : null;
          payload.section_889_compliant =
            data.section889 && !data.section889.failed ? data.section889.compliant : null;
        }
        if (bundleF.length > 0) {
          payload.bundle_findings = bundleF;
          payload.bundle_checked_at = new Date().toISOString();
        }

        if (updating && match) {
          await directPatchRow(
            "pr_audits",
            "id",
            match.audit.id,
            {
              ...payload,
              revision: (match.audit.revision ?? 1) + 1,
              review_status: "pending",
              review_note: null,
              viewed_at: null,
            },
            "pr-audit.bundle.update",
          );
          // Best-effort cleanup of the superseded files.
          const old = [match.audit.file_path, match.audit.quote_path, match.audit.section_889_path].filter(
            (p): p is string => !!p,
          );
          if (old.length) {
            try {
              await directStorageDelete(STORAGE_BUCKET, old, "pr-audit.bundle.cleanup");
            } catch {
              /* non-fatal */
            }
          }
        } else {
          await directInsertRow<PrAudit>(
            "pr_audits",
            { ...payload, review_status: "pending", created_by: userId },
            "pr-audit.bundle.insert",
          );
        }
        savedKeys.add(row.key);
        setSavedCount((c) => c + 1);
      } catch (err) {
        failures.push(
          `${data.pr.vendor_name || data.names.pr || "A bundle"}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (failures.length === 0) {
      router.push("/pr-audit");
      return;
    }
    setRows((prev) => prev.filter((r) => !savedKeys.has(r.key)));
    setError(`Saved ${savedKeys.size}. ${failures.length} couldn't be saved:\n${failures.join("\n")}`);
    setSaving(false);
  }, [rows, router, validCodes, existing]);

  const handleManual = useCallback(async () => {
    setCreatingManual(true);
    setError(null);
    try {
      const audit = auditPr(
        {
          date_prepared: todayIso(),
          vendor_name: null,
          requestor_name: null,
          internal_order: null,
          items: [emptyItem()],
          attached_other: "Vendor Quote",
          printed_total: null,
          warnings: [],
        },
        validCodes,
      );
      const inserted = await directInsertRow<PrAudit>(
        "pr_audits",
        {
          file_path: null,
          file_name: null,
          file_uploaded_at: null,
          pr_date: todayIso(),
          vendor_name: null,
          requestor_name: null,
          internal_order: null,
          items: normalizePrItems([emptyItem()]),
          attached_other: "Vendor Quote",
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
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pr-audit" className="p-2 -ml-2 rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold leading-tight">Upload &amp; Audit PRs</h1>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.zip,application/zip"
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
              Reading {extractCount} file{extractCount !== 1 ? "s" : ""}…
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-semibold text-sm">
              {rows.length > 0 ? "Add more" : "Tap to upload"}
            </p>
            <p className="text-[11px] text-muted-foreground text-center">
              A <span className="font-medium">.zip</span> with the PR + quote + 889, or the
              loose files — it sorts them out. Plain PR files work too.
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

      {/* New codes across the batch */}
      {rows.length > 0 && unknownCodes.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> New codes on these PRs
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            These aren&apos;t in your lists yet. Add them so the audit and budgets recognize
            them — it updates every PR in this batch at once.
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
              <BundleCard
                key={row.key}
                row={row}
                audit={audits[i]}
                bundleFindings={bundleFindings[i]}
                match={matches[i]}
                onRemove={() => removeRow(row.key)}
                onPick={(role, file) => pickSlot(row.key, role, file)}
                onRemoveSlot={(role) => removeSlot(row.key, role)}
                onToggleMode={() => toggleMode(row.key)}
                onPreviewFile={previewFile}
              />
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Saved as <span className="font-medium">pending</span> and{" "}
            <span className="font-medium">not looked at</span>. A PR you already have is
            updated in place (not counted twice).
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Saving {savedCount}/{rows.length}…
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" /> Save all {rows.length} PR{rows.length !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}

      {/* Add-missing-code popup */}
      <AddCodeModal
        target={addingCode}
        categories={categories}
        saving={savingNewCode}
        onCancel={() => setAddingCode(null)}
        onSave={saveNewCode}
      />

      <FilePreviewOverlay source={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
