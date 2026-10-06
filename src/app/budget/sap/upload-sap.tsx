"use client";

// Upload an SAP Budget Performance Activity Report (PDF) → read it in the
// browser → show what it found and check every cost center adds up → save.
// Nothing is saved until "Save report". The same month saved again
// replaces the old one.

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdfTextPages } from "@/lib/pdf/text-lines";
import { costCenterLabel, parseBudgetReport, type BudgetReport } from "@/lib/sap/budget-report";
import { budgetLineRows, budgetReportRow, mainBlocks, type StoredBudgetReport } from "@/lib/sap/budget-store";
import { directDeleteRow, directInsertRow, directInsertRows, directSelectList } from "@/lib/supabase/rest";
import { fiscalYearLabel } from "@/lib/performance/performance";

const CHUNK = 500;

export function UploadSapReport({ onSaved }: { onSaved: (reportId: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [replaces, setReplaces] = useState<StoredBudgetReport | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setReplaces(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    reset();
    setFile(f);
    setReading(true);
    try {
      const parsed = parseBudgetReport(await pdfTextPages(new Uint8Array(await f.arrayBuffer())));
      if (!parsed || parsed.blocks.length === 0) {
        setError("This doesn't look like an SAP Budget Performance Activity Report (ZVK/ZC01B). Run that report in SAP and save it as a PDF.");
      } else if (!parsed.fiscalYear || !parsed.period) {
        setError("Couldn't find the period and fiscal year at the top of the report.");
      } else {
        setReport(parsed);
        const existing = await directSelectList<StoredBudgetReport>("sap_budget_reports", {
          columns: "id,fiscal_year,period,period_name,run_date,source_file,created_at",
          filters: [`fiscal_year=eq.${parsed.fiscalYear}`, `period=eq.${parsed.period}`],
          limit: 1,
          label: "sap.upload.existing",
        }).catch(() => []);
        setReplaces(existing[0] ?? null);
      }
    } catch (e) {
      setError(`Couldn't read that PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
    setReading(false);
  };

  const save = async () => {
    if (!report) return;
    setSaving(true);
    setError(null);
    let newId: string | null = null;
    try {
      if (replaces) await directDeleteRow("sap_budget_reports", "id", replaces.id, "sap.upload.replace");
      const row = await directInsertRow<{ id: string }>("sap_budget_reports", budgetReportRow(report, file?.name ?? null), "sap.upload.report");
      newId = row.id;
      const lines = budgetLineRows(report, newId);
      for (let i = 0; i < lines.length; i += CHUNK) {
        await directInsertRows("sap_budget_lines", lines.slice(i, i + CHUNK), "sap.upload.lines");
      }
      reset();
      onSaved(newId);
    } catch (e) {
      // Don't leave half a report behind.
      if (newId) await directDeleteRow("sap_budget_reports", "id", newId, "sap.upload.undo").catch(() => undefined);
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /sap_budget/.test(msg) && /exist|schema cache|not find/i.test(msg)
          ? "The database update for SAP reports hasn't been run yet (20261012120000_sap_budget_reports.sql). See System Health."
          : `Couldn't save: ${msg}`,
      );
    }
    setSaving(false);
  };

  const centers = report ? mainBlocks(report.blocks) : [];
  const ok = report != null && report.mismatches.length === 0;

  return (
    <div className="gk-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Add an SAP report</h2>
          <p className="text-xs text-muted-foreground">
            Budget Performance Activity Report (ZVK/ZC01B), saved from SAP as a PDF. One a month; the same month again replaces it.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          aria-label="SAP report PDF"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || saving}>
          {reading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileUp className="w-4 h-4 mr-1.5" />}
          {reading ? "Reading…" : "Choose PDF"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {report && (
        <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
          <p className="font-semibold">
            {report.periodName} · period {report.period} of {fiscalYearLabel(report.fiscalYear)}
            {report.runDate && <span className="font-normal text-muted-foreground"> · run {report.runDate}</span>}
          </p>
          <p className="text-muted-foreground">
            {centers.length} cost center{centers.length === 1 ? "" : "s"}: {centers.map((b) => costCenterLabel(b.costCenter, b.costCenterName)).join(", ")}.
          </p>
          {ok ? (
            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Every cost center checks out: revenue minus expense equals its profit/loss.
            </p>
          ) : (
            <div className="text-destructive space-y-1">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-4 h-4" /> Some numbers didn&apos;t read right, so this can&apos;t be saved:
              </p>
              <ul className="list-disc pl-6">
                {report.mismatches.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {replaces && (
            <p className="text-amber-700 dark:text-amber-400">
              Replaces the {report.periodName} report already saved{replaces.run_date ? ` (run ${replaces.run_date})` : ""}.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" onClick={save} disabled={!ok || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Save report
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
