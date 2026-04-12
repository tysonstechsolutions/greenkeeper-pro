"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  mapToILRupRecord,
  validateILRupRecord,
  IL_RUP_TOTAL_FIELDS,
  type ILRupRecord,
  type ILRupValidationResult,
} from "@/lib/compliance/illinois-rup";
import type {
  ChemicalApplication,
  ChemicalProduct,
  Profile,
} from "@/types/database";
import {
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface PreviewRow {
  id: string;
  record: ILRupRecord;
  validation: ILRupValidationResult;
}

export default function CompliancePage() {
  const { profile } = useAuth();
  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director";

  const [since, setSince] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [until, setUntil] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("chemical_applications")
        .select(`
          *,
          product:chemical_products!product_id(*),
          applicator:profiles!applied_by(*)
        `)
        .gte("application_date", since)
        .lte("application_date", until)
        .order("application_date", { ascending: true });

      if (fetchErr) throw new Error(fetchErr.message);

      const apps = (data || []) as (ChemicalApplication & {
        product: ChemicalProduct | null;
        applicator: Profile | null;
      })[];

      const previewRows: PreviewRow[] = apps.map((app) => {
        const record = mapToILRupRecord(app, app.product, app.applicator);
        const validation = validateILRupRecord(record);
        return { id: app.id, record, validation };
      });

      setRows(previewRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  }, [since, until]);

  const downloadPdf = () => {
    window.open(`/api/reports/illinois-rup?since=${since}&until=${until}`, "_blank");
  };

  // ── Role Guard ──
  if (!isAllowed) {
    return (
      <div className="p-4 pb-24 max-w-2xl mx-auto text-center">
        <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-2">Access Restricted</h1>
        <p className="text-muted-foreground">
          Illinois RUP compliance records are available to superintendents,
          assistant superintendents, and directors only.
        </p>
      </div>
    );
  }

  const completeCount = rows.filter((r) => r.validation.valid).length;
  const incompleteCount = rows.length - completeCount;

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/more"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Illinois RUP Records</h1>
          <p className="text-sm text-muted-foreground">
            Restricted Use Pesticide application records per 415 ILCS 60
          </p>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              From
            </label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              To
            </label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={fetchPreview}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              {loading ? "Loading..." : "Preview"}
            </button>
            {rows.length > 0 && (
              <button
                onClick={downloadPdf}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 mb-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Summary Stats */}
      {searched && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold">{rows.length}</p>
            <p className="text-xs text-muted-foreground">Applications</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completeCount}</p>
            <p className="text-xs text-muted-foreground">Complete</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{incompleteCount}</p>
            <p className="text-xs text-muted-foreground">Incomplete</p>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {searched && rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/30">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Application Records
            </h2>
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <div key={row.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {row.record.applicationDate}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {row.record.productName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{row.record.applicatorName}</span>
                      <span>&middot;</span>
                      <span>{row.record.location}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {row.validation.valid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {row.validation.completedFields}/{IL_RUP_TOTAL_FIELDS} fields
                      </span>
                    )}
                  </div>
                </div>
                {!row.validation.valid && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Missing: {row.validation.missingFields.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {searched && rows.length === 0 && !loading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium mb-1">No Applications Found</p>
          <p className="text-sm text-muted-foreground">
            No chemical applications were recorded in this date range.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 p-3">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Per 415 ILCS 60, restricted-use pesticide application records must be
          retained for 7 years. This report maps your spray data to the Illinois
          Department of Agriculture record format. Incomplete fields are
          highlighted — fill them in before filing.
        </p>
      </div>
    </div>
  );
}
