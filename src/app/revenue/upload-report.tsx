"use client";

// Upload a POS / register report → AI transcribes it → HUMAN REVIEWS every
// line → save. Nothing touches the database until "Save entries" — the
// verify-then-commit rule for anything with money in it. A RecTrac Flash
// Report (Sales Statistics) is read exactly instead, item by item.

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { callApi } from "@/lib/api/client";
import { directInsertRows } from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import { areaForRevenueCategory, AREA_LABELS } from "@/lib/money/areas";
import { todayLocal } from "@/lib/utils/date";
import {
  REPORT_AREAS,
  REVENUE_CATEGORIES,
  categoryForReportLine,
  type ReportArea,
} from "@/lib/money/revenue-categories";
import { pdfTextLines } from "@/lib/pdf/text-lines";
import { flashReportArea, parseFlashReport, type FlashReport } from "@/lib/sales/rectrac-flash";
import { planFlashImport, type FlashImportPlan, type SalesOutlet } from "@/lib/sales/import";
import { FlashImport } from "./flash-import";

const CATEGORY_OPTIONS = REVENUE_CATEGORIES;

interface ExtractedRevenue {
  report_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  lines?: {
    category?: string;
    label?: string;
    amount?: number;
    rounds_count?: number | null;
  }[];
  report_total?: number | null;
  warnings?: string[];
}

interface ReviewRow {
  key: number;
  category: string;
  label: string;
  amount: string;
  rounds: string;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

// The AI's dates are transcriptions — never trust the format. A bad string
// fed to <input type="date"> is rejected SILENTLY, leaving it empty.
function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function UploadReportCard({
  userId,
  onSaved,
  areas,
}: {
  userId: string | null;
  onSaved: () => void;
  /** Which report types this person uploads (default: all). */
  areas?: ReportArea[];
}) {
  const areaChoices = REPORT_AREAS.filter((a) => !areas || areas.includes(a.value));
  // Which RecTrac report this is: restaurant, bar, and pro shop each have their own.
  const [reportArea, setReportArea] = useState<ReportArea | null>(null);
  // A RecTrac flash report, read exactly (no AI review rows).
  const [flash, setFlash] = useState<{ report: FlashReport; plan: FlashImportPlan; detected: SalesOutlet | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [reportTotal, setReportTotal] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);
  const nextKey = useRef(0);

  const reset = () => {
    setFile(null);
    setRows(null);
    setWarnings([]);
    setError(null);
    setReportTotal(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setSavedCount(null);
    setFlash(null);
    setExtracting(true);
    // A RecTrac Flash Report is read exactly, in the browser.
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      try {
        const report = parseFlashReport(await pdfTextLines(new Uint8Array(await f.arrayBuffer())));
        if (report && report.sales.length > 0) {
          const detected = flashReportArea(report);
          const outlet: SalesOutlet =
            reportArea === "restaurant" || reportArea === "bar" || reportArea === "pro_shop"
              ? reportArea
              : (detected ?? "restaurant");
          setFlash({ report, plan: planFlashImport(report, outlet), detected });
          setExtracting(false);
          return;
        }
      } catch {
        /* not readable as text: fall through to the AI reader */
      }
    }
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await callApi<ExtractedRevenue>("extract-revenue", {
        method: "POST",
        body: form,
      });

      const lines = Array.isArray(res.lines) ? res.lines : [];
      setRows(
        lines
          .filter((l) => typeof l.amount === "number" && !Number.isNaN(l.amount))
          .map((l) => ({
            key: nextKey.current++,
            category: categoryForReportLine(reportArea ?? "other", l.category ?? "other"),
            label: typeof l.label === "string" ? l.label : "",
            amount: String(l.amount),
            rounds:
              typeof l.rounds_count === "number" && l.rounds_count > 0
                ? String(l.rounds_count)
                : "",
          })),
      );
      setWarnings(Array.isArray(res.warnings) ? res.warnings.filter((w) => typeof w === "string") : []);
      setReportTotal(typeof res.report_total === "number" ? res.report_total : null);
      // Prefer the report's own date; a multi-day report falls back to its
      // end date; otherwise today. Format-checked — always editable below.
      setEntryDate(
        isYmd(res.report_date)
          ? res.report_date
          : isYmd(res.period_end)
            ? res.period_end
            : todayLocal(),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the report. Try a clearer photo.");
      setRows(null);
      // Clear the input so re-picking the SAME file fires a change event.
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setExtracting(false);
    }
  };

  const setRow = (key: number, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? prev);
  };

  const addRow = () => {
    setRows((prev) => [
      ...(prev ?? []),
      { key: nextKey.current++, category: "other", label: "", amount: "", rounds: "" },
    ]);
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev?.filter((r) => r.key !== key) ?? prev);
  };

  const parsedRows = (rows ?? [])
    .map((r) => ({ ...r, amountNum: parseFloat(r.amount) }))
    .filter((r) => !Number.isNaN(r.amountNum) && r.amountNum !== 0);
  const sum = parsedRows.reduce((s, r) => s + r.amountNum, 0);
  const totalMatches = reportTotal == null || Math.abs(sum - reportTotal) <= 1;

  const handleSave = async () => {
    if (!rows || parsedRows.length === 0 || saving) return;
    if (!isYmd(entryDate)) {
      setError("Pick a valid entry date before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Keep the original report file for the audit trail (best-effort —
      // a failed upload shouldn't block saving the verified numbers).
      let reportPath: string | null = null;
      if (file && userId) {
        try {
          const up = await uploadPhoto(file, userId);
          reportPath = up.storagePath;
        } catch {
          reportPath = null;
        }
      }

      const entries = parsedRows.map((r) => ({
        entry_date: entryDate,
        category: r.category,
        amount: r.amountNum,
        rounds_count:
          r.category === "greens_fees" && r.rounds ? parseInt(r.rounds, 10) || null : null,
        description: r.label || null,
        source: "pos_upload",
        report_path: reportPath,
        report_area: reportArea,
        created_by: userId,
      }));
      try {
        await directInsertRows("revenue_entries", entries, "revenue.uploadSave");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/report_area|revenue_entries_category_check|schema cache/i.test(msg)) {
          throw new Error(
            "Run the database update 20261007120000_bar_and_invoice_coding.sql in Supabase first (it adds the Bar category and the report type). Nothing was saved.",
          );
        }
        throw e;
      }
      setSavedCount(parsedRows.length);
      reset();
      // Next upload is usually a different report: make them pick again.
      setReportArea(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed — nothing was recorded.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Upload a sales report</p>
            <p className="text-xs text-muted-foreground">
              One RecTrac report at a time: restaurant, bar, and pro shop each upload separately.
              You review every number before it saves.
            </p>
          </div>
          {rows && (
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Discard extraction">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {savedCount !== null && !rows && (
          <p className="text-sm text-success flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            Saved {savedCount} entr{savedCount === 1 ? "y" : "ies"}.
          </p>
        )}

        {flash && (
          <FlashImport
            report={flash.report}
            plan={flash.plan}
            file={file}
            userId={userId}
            detectedOutlet={flash.detected}
            onCancel={() => {
              setFlash(null);
              reset();
            }}
            onSaved={(message) => {
              setFlash(null);
              reset();
              setReportArea(null);
              setFlashNotice(message);
              onSaved();
            }}
          />
        )}

        {flashNotice && !flash && !rows && (
          <p className="text-sm text-success flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            {flashNotice}
          </p>
        )}

        {!rows && !flash && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Which report is this?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Which report is this?">
              {areaChoices.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={reportArea === a.value}
                  onClick={() => setReportArea(a.value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm font-medium",
                    reportArea === a.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {reportArea && (
              <p className="text-[11px] text-muted-foreground">
                {REPORT_AREAS.find((a) => a.value === reportArea)?.hint}
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={extracting || !reportArea}
              onClick={() => fileRef.current?.click()}
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reading the report…
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 mr-2" />
                  {reportArea ? "Choose photo or PDF" : "Pick the report type first"}
                </>
              )}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}

        {rows && (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 space-y-0.5">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-warning-foreground flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground shrink-0">
                Entry date
              </label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-9 max-w-[180px]"
              />
            </div>

            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="rounded-lg border border-border p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={r.label}
                      placeholder="Line description"
                      onChange={(e) => setRow(r.key, { label: e.target.value })}
                      className="h-9 flex-1 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(r.key)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={r.category}
                      onValueChange={(v) => setRow(r.key, { category: v })}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground shrink-0 w-20 truncate">
                      {AREA_LABELS[areaForRevenueCategory(r.category)]}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={r.amount}
                      onChange={(e) => setRow(r.key, { amount: e.target.value })}
                      className="h-9 w-28 text-right tabular-nums"
                    />
                    {r.category === "greens_fees" && (
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="rounds"
                        value={r.rounds}
                        onChange={(e) => setRow(r.key, { rounds: e.target.value })}
                        className="h-9 w-24"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={addRow} className="text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add line
            </Button>

            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm border",
                totalMatches
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-destructive/10 border-destructive/30 text-destructive",
              )}
            >
              <span className="font-medium">
                {parsedRows.length} line{parsedRows.length === 1 ? "" : "s"} · {money(sum)}
              </span>
              <span className="text-xs">
                {reportTotal == null
                  ? "no printed total to check against"
                  : totalMatches
                    ? `matches the report's ${money(reportTotal)}`
                    : `report prints ${money(reportTotal)} — off by ${money(sum - reportTotal)}`}
              </span>
            </div>

            <Button
              className="w-full"
              disabled={saving || parsedRows.length === 0}
              onClick={handleSave}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save {parsedRows.length} entr{parsedRows.length === 1 ? "y" : "ies"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
