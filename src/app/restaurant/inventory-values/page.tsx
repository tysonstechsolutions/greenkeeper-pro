"use client";

// Month-end inventory: the monthly count sheets for Buckley's food (151110),
// Buckley's bar (151120), and pro shop retail (151130), imported from the
// Excel files. What was on hand at month end is what turns purchases into
// real cost of goods sold (starting + purchases − ending).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, X } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { directDeleteByFilter, directInsertRow, directInsertRows, directSelectList } from "@/lib/supabase/rest";
import { readInventoryFiles, type InventoryReadResult } from "@/lib/inventory/read-files";
import { INVENTORY_OUTLET_LABELS, type InventoryOutlet } from "@/lib/inventory/valuation";
import { useAuth } from "@/lib/hooks/useAuth";

interface SavedValuation {
  id: string;
  outlet: InventoryOutlet;
  month_end: string;
  total: number;
  stated_total: number | null;
  item_count: number;
  source_file: string | null;
}

const OUTLETS: InventoryOutlet[] = ["restaurant", "bar", "pro_shop"];

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const UPDATE_NEEDED =
  "The database update for month-end inventory hasn't been run yet. Run 20261008120000_inventory_valuations.sql in Supabase, then try again.";

function InventoryValuesContent() {
  const { isFbManager } = useAuth();
  // The F&B Manager handles Buckley's food and bar, not the pro shop.
  const outlets = isFbManager ? OUTLETS.filter((o) => o !== "pro_shop") : OUTLETS;
  const [saved, setSaved] = useState<SavedValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<InventoryReadResult | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    directSelectList<SavedValuation>("inventory_valuations", {
      columns: "id,outlet,month_end,total,stated_total,item_count,source_file",
      orderBy: [{ column: "month_end", ascending: false }],
      limit: 1000,
      label: "inventoryValues.list",
    })
      .then((rows) => {
        setSaved(rows);
        setError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(/inventory_valuations|does not exist|schema cache/i.test(msg) ? UPDATE_NEEDED : msg);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setReading(true);
    setNotice(null);
    setError(null);
    try {
      const files = await Promise.all([...list].map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      const result = await readInventoryFiles(files);
      // Only the outlets this person handles.
      setRead({ ...result, kept: result.kept.filter((k) => outlets.includes(k.valuation.outlet)) });
    } catch (e) {
      setError(`Couldn't read those files: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toSave = useMemo(() => (read?.kept ?? []).filter((k) => k.valuation.total > 0), [read]);
  const notCounted = useMemo(() => (read?.kept ?? []).filter((k) => k.valuation.total <= 0), [read]);
  const savedKey = useMemo(() => new Set(saved.map((s) => `${s.outlet}|${s.month_end}`)), [saved]);

  const save = async () => {
    if (toSave.length === 0 || saving) return;
    setError(null);
    let done = 0;
    try {
      for (const [i, f] of toSave.entries()) {
        const v = f.valuation;
        setSaving(`Saving ${i + 1} of ${toSave.length}: ${INVENTORY_OUTLET_LABELS[v.outlet]} ${monthLabel(v.monthEnd)}`);
        // Importing a month again replaces it (its lines go with it).
        await directDeleteByFilter(
          "inventory_valuations",
          [`outlet=eq.${v.outlet}`, `month_end=eq.${v.monthEnd}`],
          "inventoryValues.replace",
        );
        const row = await directInsertRow<{ id: string }>(
          "inventory_valuations",
          {
            outlet: v.outlet,
            account: v.account,
            cost_center: v.costCenter,
            month_end: v.monthEnd,
            total: v.total,
            stated_total: v.statedTotal,
            item_count: v.lines.length,
            source_file: f.fileName,
            counted_by: v.countedBy,
            notes: v.notes.join(" ") || null,
          },
          "inventoryValues.insert",
        );
        if (v.lines.length) {
          await directInsertRows(
            "inventory_valuation_lines",
            v.lines.map((l, n) => ({
              valuation_id: row.id,
              line_no: n + 1,
              description: l.description,
              category: l.category,
              unit: l.unit,
              qty: l.qty,
              unit_cost: l.unitCost,
              value: l.value,
              inventory_code: l.inventoryCode,
            })),
            "inventoryValues.lines",
          );
        }
        done++;
      }
      setNotice(`Saved ${done} month-end count${done === 1 ? "" : "s"}.`);
      setRead(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/inventory_valuation|does not exist|schema cache/i.test(msg) ? UPDATE_NEEDED : `Saved ${done}, then stopped: ${msg}`);
    } finally {
      setSaving(null);
      load();
    }
  };

  // Month × outlet grid of what's saved.
  const grid = useMemo(() => {
    const months = [...new Set(saved.map((s) => s.month_end.slice(0, 7)))].sort().reverse();
    const at = new Map(saved.map((s) => [`${s.outlet}|${s.month_end.slice(0, 7)}`, s]));
    return months.map((m) => ({ month: m, cells: outlets.map((o) => at.get(`${o}|${m}`) ?? null) }));
  }, [saved, outlets]);

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={reading || !!saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {reading ? "Reading the count sheets…" : "Import count sheets"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xlsm,.zip,application/zip"
          className="hidden"
          aria-label="Inventory count spreadsheets"
          onChange={(e) => pick(e.target.files)}
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Pick the monthly Excel count sheets (or a .zip of them). The account on each sheet (151110 food, 151120
          bar, 151130 retail) and its MONTH ENDING decide where it goes. Importing a month again replaces it.
        </p>
      </div>

      {read && (
        <section className="gk-card p-3 space-y-3" aria-label="Count sheets to import">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {toSave.length === 0 ? "Nothing to import" : `Ready to import ${toSave.length} month-end count${toSave.length === 1 ? "" : "s"}`}
            </p>
            <button onClick={() => setRead(null)} disabled={!!saving} aria-label="Cancel import" className="p-1.5 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-border/50 rounded-lg border border-border/60">
            {toSave.map((f) => {
              const v = f.valuation;
              const replaces = savedKey.has(`${v.outlet}|${v.monthEnd}`);
              return (
                <div key={`${v.outlet}-${v.monthEnd}`} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">{monthLabel(v.monthEnd)}</span>
                    <span className="flex-1 min-w-0 truncate">{INVENTORY_OUTLET_LABELS[v.outlet]}</span>
                    <span className="font-semibold tabular-nums">{money(v.total)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-[5.5rem]">
                    {v.lines.length ? `${v.lines.length} items counted` : "total only"} · {f.fileName}
                    {replaces ? " · replaces the saved count" : ""}
                  </p>
                  {v.notes.map((n) => (
                    <p key={n} className="text-[11px] text-amber-700 dark:text-amber-400 pl-[5.5rem]">
                      {n}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
          {notCounted.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Not counted (empty sheet, left out):{" "}
              {notCounted.map((k) => `${INVENTORY_OUTLET_LABELS[k.valuation.outlet]} ${monthLabel(k.valuation.monthEnd)}`).join(", ")}
            </p>
          )}
          {read.setAside.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Duplicates set aside: {read.setAside.map((s) => s.fileName).join(", ")}
            </p>
          )}
          {read.unreadable.length > 0 && (
            <p className="text-xs text-muted-foreground">Not a count sheet, left out: {read.unreadable.join(", ")}</p>
          )}
          {toSave.length > 0 && (
            <button
              onClick={save}
              disabled={!!saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ?? `Save ${toSave.length} count${toSave.length === 1 ? "" : "s"}`}
            </button>
          )}
        </section>
      )}

      <section>
        <p className="gk-section-label mb-2">Month-end inventory on file</p>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : grid.length === 0 ? (
          <p className="text-sm text-muted-foreground">No counts imported yet.</p>
        ) : (
          <div className="gk-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Month end</th>
                  {outlets.map((o) => (
                    <th key={o} className="text-right px-3 py-2 font-medium">
                      {INVENTORY_OUTLET_LABELS[o]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((g) => (
                  <tr key={g.month} className="border-t border-border/50">
                    <td className="px-3 py-1.5 tabular-nums">{monthLabel(`${g.month}-01`)}</td>
                    {g.cells.map((c, i) => (
                      <td key={outlets[i]} className="px-3 py-1.5 text-right tabular-nums">
                        {c ? money(Number(c.total)) : <span className="text-amber-700 dark:text-amber-400 text-xs">missing</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-1.5">
          These turn purchases into true cost of goods on{" "}
          <Link href="/restaurant/food-cost/" className="underline">
            Food &amp; Bar Cost
          </Link>
          : starting inventory + purchases − ending inventory.
        </p>
      </section>
    </div>
  );
}

export default function InventoryValuesPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="gk-page mx-auto">
        <h1 className="mb-1">Month-End Inventory</h1>
        <p className="text-sm text-muted-foreground mb-5">
          The monthly count sheets for Buckley&apos;s food, the bar, and pro shop retail.
        </p>
        <InventoryValuesContent />
      </div>
    </RoleGuard>
  );
}
