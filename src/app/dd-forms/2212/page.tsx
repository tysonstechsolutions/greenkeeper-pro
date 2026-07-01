"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, Plus, Trash2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { generateDd2212Report, dd2212Filename, type Dd2212Item } from "@/lib/reports/dd2212-report";
import {
  DD_SITES,
  DD_ACTIVITY_DEFAULT,
  ddMonYyyy,
  money,
  type DdSite,
} from "@/lib/dd-forms/constants";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base";

interface Row extends Dd2212Item {
  totalTouched?: boolean;
}

function emptyRow(): Row {
  return { description: "", units: "", unitCost: "", totalValue: "", reason: "" };
}

function Dd2212Content() {
  const router = useRouter();
  const params = useSearchParams();

  const qsSite = params.get("site") || "";
  const [site, setSite] = useState<DdSite>(
    (DD_SITES as readonly string[]).includes(qsSite) ? (qsSite as DdSite) : DD_SITES[0],
  );
  const [assetName, setAssetName] = useState(params.get("asset") || "");
  const [activity, setActivity] = useState(DD_ACTIVITY_DEFAULT);
  const [date, setDate] = useState(ddMonYyyy());
  const [sheetNo, setSheetNo] = useState("1");
  const [sheetOf, setSheetOf] = useState("1");
  const [rows, setRows] = useState<Row[]>(() => {
    const units = params.get("units") || "";
    const unitCost = params.get("unitCost") || "";
    const totalValue = money(units, unitCost, false) || "";
    return [
      {
        ...emptyRow(),
        description: params.get("item") || "",
        units,
        unitCost,
        totalValue,
        reason: params.get("reason") || "",
        totalTouched: !!totalValue,
      },
    ];
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        // Auto-fill total when the user hasn't typed one in this row.
        if ((patch.units !== undefined || patch.unitCost !== undefined) && !next.totalTouched) {
          const t = money(next.units || "", next.unitCost || "", false);
          if (t) next.totalValue = t;
        }
        if (patch.totalValue !== undefined) next.totalTouched = true;
        return next;
      }),
    );
  }

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const filledRows = rows.filter(
    (r) => (r.description || r.units || r.unitCost || r.totalValue || r.reason || "").trim(),
  );
  const canGenerate = !!assetName.trim() && filledRows.length > 0;

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const items: Dd2212Item[] = filledRows.map((r) => ({
        description: r.description,
        units: r.units,
        unitCost: r.unitCost,
        totalValue: r.totalValue,
        reason: r.reason,
      }));
      const filename = dd2212Filename(site, assetName);
      const { blob } = await generateDd2212Report(
        { activity, date, sheetNo, sheetOf, items },
        filename,
      );
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
      await saveCreatedDocument({
        docType: "dd2212",
        title: `NAVCOMPT 2212 — ${assetName} (Site ${site})`,
        blob,
        filename,
        meta: { site, item_count: items.length },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate the 2212.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1B4332]" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Certificate of Disposition</h1>
            <p className="text-xs text-muted-foreground">NAVCOMPT Form 2212</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="site">Site number</Label>
            <select id="site" value={site} onChange={(e) => setSite(e.target.value as DdSite)} className={selectCls}>
              {DD_SITES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset">Asset / item name (for the file name)</Label>
            <Input id="asset" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g. 55in TV" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="activity">Activity name / location</Label>
          <Input id="activity" value={activity} onChange={(e) => setActivity(e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sheetNo">Sheet</Label>
            <Input id="sheetNo" value={sheetNo} onChange={(e) => setSheetNo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sheetOf">Of</Label>
            <Input id="sheetOf" value={sheetOf} onChange={(e) => setSheetOf(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Add item
            </Button>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-border p-3 space-y-2 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-600" aria-label="Remove item">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Input value={r.description || ""} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Description of item" />
              <div className="grid grid-cols-3 gap-2">
                <Input value={r.units || ""} onChange={(e) => setRow(i, { units: e.target.value })} placeholder="Units" inputMode="decimal" />
                <Input value={r.unitCost || ""} onChange={(e) => setRow(i, { unitCost: e.target.value })} placeholder="Unit cost" inputMode="decimal" />
                <Input value={r.totalValue || ""} onChange={(e) => setRow(i, { totalValue: e.target.value })} placeholder="Total value" inputMode="decimal" />
              </div>
              <Input value={r.reason || ""} onChange={(e) => setRow(i, { reason: e.target.value })} placeholder="Reason for disposition" />
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">{error}</p>
        )}
        {done && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Saved to Documents and downloaded.
          </p>
        )}

        <Button onClick={handleGenerate} disabled={!canGenerate || busy} className="w-full">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Generate 2212 (PDF)
        </Button>
      </div>
    </div>
  );
}

export default function Dd2212Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <Dd2212Content />
    </Suspense>
  );
}
