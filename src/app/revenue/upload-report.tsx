"use client";

// Upload a POS / register report → AI transcribes it → HUMAN REVIEWS every
// line → save. Nothing touches the database until "Save entries" — the
// verify-then-commit rule for anything with money in it.

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

const CATEGORY_OPTIONS = [
  { value: "greens_fees", label: "Greens Fees" },
  { value: "cart_rentals", label: "Cart Rentals" },
  { value: "pro_shop", label: "Pro Shop" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "events", label: "Events" },
  { value: "memberships", label: "Memberships" },
  { value: "driving_range", label: "Driving Range" },
  { value: "other", label: "Other" },
] as const;

const VALID_CATEGORIES = new Set(CATEGORY_OPTIONS.map((c) => c.value as string));

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
}: {
  userId: string | null;
  onSaved: () => void;
}) {
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
    setExtracting(true);
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
            category: VALID_CATEGORIES.has(l.category ?? "") ? (l.category as string) : "other",
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

      await directInsertRows(
        "revenue_entries",
        parsedRows.map((r) => ({
          entry_date: entryDate,
          category: r.category,
          amount: r.amountNum,
          rounds_count:
            r.category === "greens_fees" && r.rounds ? parseInt(r.rounds, 10) || null : null,
          description: r.label || null,
          source: "pos_upload",
          report_path: reportPath,
          created_by: userId,
        })),
        "revenue.uploadSave",
      );
      setSavedCount(parsedRows.length);
      reset();
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
              RecTrac / GolfNow report, register tape, or a photo of the daily sheet —
              you review every number before it saves.
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

        {!rows && (
          <div>
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
              disabled={extracting}
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
                  Choose photo or PDF
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
