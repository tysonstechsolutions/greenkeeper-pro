"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  AST_INSPECTION_ITEMS,
  AST_SECTIONS,
  isNonConforming,
} from "@/lib/ast-inspection-items";
import {
  generateAstInspectionReport,
  astInspectionFilename,
  AstInspectionReportError,
} from "@/lib/reports/ast-inspection-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import type { AstInspection } from "@/types/database";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Native-aware download lives in @/lib/utils/download-blob.

function ViewAstInspectionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { profile, loading: authLoading } = useAuth();

  const isManagement =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const [inspection, setInspection] = useState<AstInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing inspection id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("ast_inspections")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr) {
        setError(fetchErr.message);
      } else if (!data) {
        setError("Inspection not found");
      } else {
        setInspection(data as unknown as AstInspection);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDownload() {
    if (!inspection) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await generateAstInspectionReport(inspection);
      const filename = astInspectionFilename(inspection);
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
    } catch (err) {
      const msg =
        err instanceof AstInspectionReportError
          ? `PDF generation failed at "${err.step}": ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to generate PDF";
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!inspection) return;
    if (
      !confirm(
        "Delete this inspection? This is permanent and the record will not be retained for the SP001 36-month requirement.",
      )
    ) {
      return;
    }
    setDeleting(true);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("ast_inspections")
      .delete()
      .eq("id", inspection.id);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.push("/ast-inspections");
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (error && !inspection) {
    return (
      <div className="p-4 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/ast-inspections"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">Inspection</h1>
        </div>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!inspection) return null;

  // Compute summary
  let nonConforming = 0;
  let answered = 0;
  for (const def of AST_INSPECTION_ITEMS) {
    const entry = inspection.items?.[String(def.number)];
    if (entry?.status) answered++;
    if (entry && isNonConforming(def, entry.status)) nonConforming++;
  }
  const isDraft = inspection.status === "draft";
  const total = AST_INSPECTION_ITEMS.length;

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/ast-inspections"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">
            {formatDate(inspection.inspection_date)}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {inspection.tank_ids}
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div
        className={`mt-4 rounded-2xl border p-4 ${
          isDraft
            ? "border-border bg-muted/30"
            : nonConforming > 0
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-green-500/30 bg-green-500/10"
        }`}
      >
        <div className="flex items-start gap-3">
          {isDraft ? (
            <Edit className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          ) : nonConforming > 0 ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {isDraft
                ? "Draft — not yet completed"
                : nonConforming > 0
                  ? `${nonConforming} non-conforming item${nonConforming === 1 ? "" : "s"}`
                  : "All items pass"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {answered}/{total} items answered &middot; Inspector{" "}
              {inspection.inspector_name}
              {inspection.inspector_title ? `, ${inspection.inspector_title}` : ""}
            </p>
            {inspection.retain_until_date && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Retain until {formatDate(inspection.retain_until_date)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons — full width column on mobile */}
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? "Generating PDF..." : isDraft ? "Download PDF (Draft)" : "Download PDF"}
        </button>
        {isManagement && (
          <Link
            href={`/ast-inspections/new?id=${inspection.id}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border font-medium hover:bg-muted active:scale-[0.98] transition-all"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* General info — single column on mobile */}
      <section className="mt-4 rounded-xl border border-border bg-card p-3">
        <h2 className="font-semibold text-sm mb-3">General Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
          <Detail label="Inspection Date" value={formatDate(inspection.inspection_date)} />
          <Detail label="Prior Inspection" value={formatDate(inspection.prior_inspection_date)} />
          <Detail label="Retain Until" value={formatDate(inspection.retain_until_date)} />
          <Detail label="Inspector" value={inspection.inspector_name} />
          <Detail label="Title" value={inspection.inspector_title || "—"} />
          <Detail label="Signature" value={inspection.inspector_signature || "—"} italic />
          <Detail label="Tank(s)" value={inspection.tank_ids} fullWidth />
          <Detail label="Facility" value={inspection.facility_name || "—"} />
          <Detail label="Facility ID" value={inspection.facility_id || "—"} />
        </dl>
      </section>

      {/* Inspection items by section */}
      {AST_SECTIONS.map((section) => {
        const items = AST_INSPECTION_ITEMS.filter((i) => i.section === section);
        return (
          <section
            key={section}
            className="mt-3 rounded-xl border border-border bg-card overflow-hidden"
          >
            <header className="px-3 py-2 bg-muted/40 border-b border-border">
              <h2 className="font-semibold text-sm">{section}</h2>
            </header>
            <div className="divide-y divide-border">
              {items.map((def) => {
                const entry = inspection.items?.[String(def.number)];
                const status = entry?.status ?? null;
                const flagged = isNonConforming(def, status);
                return (
                  <div key={def.number} className="p-3">
                    <div className="flex items-start gap-2">
                      <span
                        className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
                          flagged
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : status
                              ? "bg-green-500/15 text-green-700 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {def.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug break-words">
                          {def.prompt}
                        </p>
                        {def.note && (
                          <p className="text-[11px] text-muted-foreground mt-1 italic break-words">
                            {def.note}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                              flagged
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : status === "yes" || status === "no"
                                  ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status === null
                              ? "—"
                              : status === "yes"
                                ? def.yesIsNonConforming
                                  ? "Yes (issue)"
                                  : "Yes"
                                : status === "no"
                                  ? def.yesIsNonConforming
                                    ? "No"
                                    : "No (issue)"
                                  : "N/A"}
                          </span>
                          {flagged && (
                            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                              Action required
                            </span>
                          )}
                        </div>
                        {entry?.comment && (
                          <p className="text-sm text-muted-foreground mt-2 leading-snug">
                            {entry.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Additional comments */}
      {inspection.additional_comments && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold text-sm mb-2">Additional Comments</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-snug">
            {inspection.additional_comments}
          </p>
        </section>
      )}

      {/* Delete (management only, push to bottom) */}
      {isManagement && (
        <div className="mt-8 pt-4 border-t border-border">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.99] transition-all disabled:opacity-50 text-sm font-medium"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {deleting ? "Deleting..." : "Delete Inspection"}
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  fullWidth,
  italic,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  italic?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd
        className={`text-sm text-foreground mt-0.5 ${italic ? "italic font-serif" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function ViewAstInspectionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <ViewAstInspectionInner />
    </Suspense>
  );
}
