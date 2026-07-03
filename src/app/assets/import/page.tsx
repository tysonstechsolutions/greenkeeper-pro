"use client";

// DPAS/ELMS CSV asset import (Operation Blueprint Phase 5).
//
// The property system only runs on the government computer, so the flow is:
// export the asset listing there BY HAND (Inquiries > Asset Management >
// Asset → CSV, or the Custodian Asset Report), bring the file over, and
// import it here. Columns are auto-guessed and adjustable; duplicates
// against the existing inventory are skipped; nothing is written until the
// preview is reviewed and Import is pressed (verify-then-commit).

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { directInsertRows, directSelectList } from "@/lib/supabase/rest";
import {
  ASSET_FIELD_LABELS,
  buildCandidates,
  guessMapping,
  parseCsv,
  type AssetField,
  type ImportCandidate,
  type ParsedCsv,
} from "@/lib/assets/csv-import";

const SITES = ["7009", "7010", "7011"] as const;
const FIELDS = Object.keys(ASSET_FIELD_LABELS) as AssetField[];

export default function AssetImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<AssetField, number>>>({});
  const [site, setSite] = useState<(typeof SITES)[number]>("7009");
  const [existing, setExisting] = useState<{ asset_number: string; serial_number: string | null }[]>([]);
  const [existingTruncated, setExistingTruncated] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skippedDup: number; skippedBad: number } | null>(null);

  const handleFile = async (f: File) => {
    setError(null);
    setDone(null);
    try {
      const text = await f.text();
      const p = parseCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setError("That file has no data rows. Export the asset listing as CSV and try again.");
        return;
      }
      setFileName(f.name);
      setParsed(p);
      setMapping(guessMapping(p.headers));

      // Existing inventory for dedupe. PostgREST caps responses at 1000 —
      // warn rather than silently under-deduping if we ever hit it.
      setLoadingExisting(true);
      const rows = await directSelectList<{ asset_number: string; serial_number: string | null }>(
        "fy26_assets",
        {
          columns: "asset_number,serial_number",
          orderBy: [{ column: "asset_number", ascending: true }],
          limit: 1000,
          label: "assetImport.existing",
        },
      );
      setExisting(rows);
      setExistingTruncated(rows.length >= 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingExisting(false);
    }
  };

  const candidates: ImportCandidate[] = useMemo(
    () => (parsed ? buildCandidates(parsed, mapping, existing) : []),
    [parsed, mapping, existing],
  );
  const importable = candidates.filter((c) => !c.problem && !c.duplicate);
  const dupes = candidates.filter((c) => c.duplicate && !c.problem);
  const bad = candidates.filter((c) => c.problem);

  const runImport = async () => {
    if (importable.length === 0 || importing) return;
    setImporting(true);
    setError(null);
    try {
      // Batches keep each request comfortably under PostgREST body limits.
      const BATCH = 100;
      let imported = 0;
      for (let i = 0; i < importable.length; i += BATCH) {
        const batch = importable.slice(i, i + BATCH).map((c) => ({
          site,
          asset_number: c.asset_number,
          sub_number: c.sub_number,
          serial_number: c.serial_number,
          description: c.description,
          manufacturer: c.manufacturer,
          model_text: c.model_text,
          cost_center: c.cost_center,
          original_value: c.original_value,
          qty: c.qty,
          status: "unverified",
          notes: `Imported from ${fileName ?? "CSV"}`,
        }));
        await directInsertRows("fy26_assets", batch, "assetImport.insert");
        imported += batch.length;
      }
      setDone({ imported, skippedDup: dupes.length, skippedBad: bad.length });
      setParsed(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(
        e instanceof Error
          ? `Import stopped: ${e.message}. Rows already imported are saved; re-running skips them as duplicates.`
          : "Import failed.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="gk-page mx-auto">
      <h1 className="mb-1">Import Assets</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Bring in the property listing exported from the government computer
        (CSV). Duplicates are skipped; new assets land as{" "}
        <span className="font-medium">unverified</span> for the barcode scan to
        confirm.
      </p>

      {done && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          <p className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 shrink-0" />
            Imported {done.imported} asset{done.imported === 1 ? "" : "s"}.
          </p>
          <p className="text-xs mt-1">
            Skipped {done.skippedDup} already in the system and {done.skippedBad} unreadable
            row{done.skippedBad === 1 ? "" : "s"}.{" "}
            <Link href="/assets" className="inline-link underline">
              Go to Assets
            </Link>{" "}
            to verify them by scan.
          </p>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {!parsed && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-8 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-muted/40 hover:border-primary/30 transition-colors"
          >
            <FileUp className="w-5 h-5" />
            Choose the exported CSV
          </button>
          <p className="text-[11px] text-muted-foreground mt-3">
            On the government computer: Inquiries → Asset Management → Asset →
            select the fields → extract as &ldquo;Text, Comma Separated&rdquo;. Never run
            automation against that system — export by hand and carry the file.
          </p>
        </div>
      )}

      {parsed && (
        <div className="space-y-5">
          {/* Mapping */}
          <div className="gk-card p-3">
            <p className="text-xs font-semibold mb-2">
              {fileName} — {parsed.rows.length} rows. Check the column matching:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FIELDS.map((field) => (
                <label key={field} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">
                    {ASSET_FIELD_LABELS[field]}
                  </span>
                  <select
                    value={mapping[field] ?? -1}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const idx = Number(e.target.value);
                        const next = { ...prev };
                        if (idx < 0) delete next[field];
                        else next[field] = idx;
                        return next;
                      })
                    }
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value={-1}>— not in file —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm mt-3">
              <span className="w-36 shrink-0 text-xs text-muted-foreground">Site (all rows)</span>
              <select
                value={site}
                onChange={(e) => setSite(e.target.value as (typeof SITES)[number])}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              >
                {SITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Summary + preview */}
          {loadingExisting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking against the existing inventory…
            </div>
          ) : (
            <>
              {existingTruncated && (
                <p className="text-xs text-warning-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  The existing-asset check hit the 1,000-row fetch cap — duplicate
                  detection may be incomplete.
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-success/10 text-success border border-success/30 font-semibold">
                  {importable.length} new
                </span>
                <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border font-semibold">
                  {dupes.length} already in the system (skipped)
                </span>
                {bad.length > 0 && (
                  <span className="px-2 py-1 rounded-md bg-warning/15 text-warning-foreground border border-warning/40 font-semibold">
                    {bad.length} unreadable (skipped)
                  </span>
                )}
              </div>

              <div className="gk-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="px-3 py-2 font-medium">Asset #</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Serial</th>
                      <th className="px-3 py-2 font-medium text-right">Cost</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, 50).map((c, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-border/40",
                          c.problem && "opacity-50",
                          c.duplicate && "text-muted-foreground",
                        )}
                      >
                        <td className="px-3 py-1.5 tabular-nums">{c.asset_number || "—"}</td>
                        <td className="px-3 py-1.5 max-w-[240px] truncate">{c.description || "—"}</td>
                        <td className="px-3 py-1.5">{c.serial_number ?? ""}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {c.original_value != null ? c.original_value.toLocaleString() : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.problem ? c.problem : c.duplicate ? "duplicate" : "new"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {candidates.length > 50 && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    Showing the first 50 of {candidates.length} rows — the counts above
                    cover the whole file.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setParsed(null);
                    setFileName(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={runImport}
                  disabled={importing || importable.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Import {importable.length} asset{importable.length === 1 ? "" : "s"} to site {site}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
