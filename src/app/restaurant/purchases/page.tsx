"use client";

// Restaurant purchases — US Foods (and friends) invoices. Restaurant spend
// never rides a purchase request, so this log is what feeds the restaurant
// "Out" column on the per-area P&L (via restaurant_spend_monthly_rollup).
// US Foods invoice PDFs can be imported whole: every line item comes in,
// split into food, alcohol, and supplies, each line marked Restaurant or Bar
// (separate COGS targets) and coded to its cost center and G/L. Beer,
// warehouse, and requisition invoices go in from a photo the same way.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  FileUp,
  Loader2,
  Paperclip,
  PieChart,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directDeleteRow,
  directInsertRow,
  directInsertRows,
  directPatchRow,
  directSelectList,
  directUpsertRows,
  publicStorageUrl,
} from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import { todayLocal } from "@/lib/utils/date";
import {
  documentLabel,
  outletsToRemember,
  planUsFoodsImport,
  readUsFoodsFiles,
  setPlannedOutlet,
  type ImportPlan,
  type ReadResult,
} from "@/lib/restaurant/import";
import { barCogs, codeLine, type Outlet } from "@/lib/restaurant/coding";
import { InvoiceLines } from "@/components/restaurant/invoice-lines";
import { VendorInvoiceForm } from "@/components/restaurant/vendor-invoice-form";

interface RestaurantPurchase {
  id: string;
  purchase_date: string;
  vendor: string;
  amount: number;
  invoice_path: string | null;
  notes: string | null;
  created_at: string;
  // Present once the 2026-10-06 database update is run.
  kind?: "invoice" | "credit" | null;
  document_number?: string | null;
  delivery_order?: string | null;
  food_amount?: number | null;
  alcohol_amount?: number | null;
  supplies_amount?: number | null;
  // Present once the 2026-10-07 database update is run.
  bar_cogs_amount?: number | null;
}

interface PurchaseLine {
  id: string;
  line_no: number;
  product_number: string;
  description: string;
  brand: string | null;
  pack_size: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  extended: number;
  category: string;
  // Present once the 2026-10-07 database update is run.
  outlet?: Outlet | null;
  cost_ctr?: string | null;
  gl_acct?: string | null;
}

const LINE_COLUMNS = "id,line_no,product_number,description,brand,pack_size,qty,unit,unit_price,extended,category";

/** Fill in outlet and codes for lines saved before they were stored. */
function withCoding(
  l: PurchaseLine,
  remembered: ReadonlyMap<string, Outlet>,
): PurchaseLine & { outlet: Outlet; cost_ctr: string; gl_acct: string } {
  const coded = codeLine({ product_number: l.product_number, category: l.category, description: l.description }, remembered);
  return { ...l, outlet: l.outlet ?? coded.outlet, cost_ctr: l.cost_ctr ?? coded.cost_ctr, gl_acct: l.gl_acct ?? coded.gl_acct };
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** PostgREST / Postgres error text that means the database update hasn't been run. */
function isMissingSchema(message: string): boolean {
  return /column .* does not exist|could not find the .* column|relation .* does not exist|restaurant_purchase_lines|schema cache/i.test(
    message,
  );
}

const UPDATE_NEEDED =
  "A database update for invoice importing hasn't been run yet. Run 20261006120000_operations_upgrade.sql and then 20261007120000_bar_and_invoice_coding.sql in Supabase, then try again.";

interface ImportState {
  reading: boolean;
  read: ReadResult | null;
  plan: ImportPlan | null;
  saving: boolean;
  progress: string | null;
}

const EMPTY_IMPORT: ImportState = { reading: false, read: null, plan: null, saving: false, progress: null };

export default function RestaurantPurchasesPage() {
  const { profile, user } = useAuth();
  const [rows, setRows] = useState<RestaurantPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState(todayLocal());
  const [formVendor, setFormVendor] = useState("US Foods");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportState>(EMPTY_IMPORT);

  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, PurchaseLine[] | "loading" | "error">>({});
  /** Products marked as bar items before (product number → outlet). */
  const [remembered, setRemembered] = useState<Map<string, Outlet>>(new Map());
  /** Which document in the import preview has its items open. */
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [lineBusy, setLineBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await directSelectList<RestaurantPurchase>("restaurant_purchases", {
        columns: "*",
        orderBy: [
          { column: "purchase_date", ascending: false },
          { column: "created_at", ascending: false },
        ],
        limit: 1000,
        label: "restaurantPurchases.list",
      });
      setRows(data);
      setError(null);
      // Remembered bar items; before the 2026-10-07 update there are none.
      const outlets = await directSelectList<{ product_number: string; outlet: Outlet }>("restaurant_product_outlets", {
        columns: "product_number,outlet",
        limit: 5000,
        label: "restaurantPurchases.outlets",
      }).catch(() => []);
      setRemembered(new Map(outlets.map((o) => [o.product_number, o.outlet])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const months = useMemo(() => {
    const groups = new Map<string, RestaurantPurchase[]>();
    for (const r of rows) {
      const key = r.purchase_date.slice(0, 7);
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const save = async () => {
    const amount = parseFloat(formAmount);
    if (!Number.isFinite(amount) || amount <= 0 || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Invoice photo is best-effort — the dollar record must never block.
      let invoicePath: string | null = null;
      let uploadFailed = false;
      if (invoiceFile) {
        if (!user?.id) {
          uploadFailed = true;
        } else {
          try {
            const up = await uploadPhoto(invoiceFile, user.id);
            invoicePath = up.storagePath;
          } catch {
            uploadFailed = true;
          }
        }
      }
      await directInsertRow(
        "restaurant_purchases",
        {
          purchase_date: formDate,
          vendor: formVendor.trim() || "US Foods",
          amount: Math.round(amount * 100) / 100,
          invoice_path: invoicePath,
          notes: formNotes.trim() || null,
          created_by: profile?.id ?? null,
        },
        "restaurantPurchases.insert",
      );
      setFormAmount("");
      setFormNotes("");
      setInvoiceFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowForm(false);
      await load();
      setNotice(
        uploadFailed
          ? "Purchase saved — but the invoice photo didn't upload. You can re-add it later."
          : "Purchase saved.",
      );
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `Couldn't save the purchase: ${e.message}`
          : "Couldn't save the purchase. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: RestaurantPurchase) => {
    if (!window.confirm(`Delete the ${money(Number(row.amount))} ${row.vendor} purchase from ${row.purchase_date}?`)) {
      return;
    }
    try {
      await directDeleteRow("restaurant_purchases", "id", row.id, "restaurantPurchases.delete");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // ── US Foods import ──────────────────────────────────────────────────────

  const pickImportFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setNotice(null);
    setImp({ ...EMPTY_IMPORT, reading: true });
    try {
      const files = await Promise.all(
        [...fileList].map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
      );
      const read = await readUsFoodsFiles(files);
      const plan = planUsFoodsImport(
        read,
        rows.map((r) => ({ vendor: r.vendor, kind: r.kind ?? null, document_number: r.document_number ?? null })),
        remembered,
      );
      setImp({ ...EMPTY_IMPORT, read, plan });
    } catch (e) {
      setImp(EMPTY_IMPORT);
      setError(`Couldn't read those files: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const saveImport = async () => {
    const plan = imp.plan;
    if (!plan || plan.toSave.length === 0 || imp.saving) return;
    setImp((s) => ({ ...s, saving: true }));
    setError(null);
    let saved = 0;
    let alreadyThere = 0;
    let noPdf = 0;
    const failures: string[] = [];
    for (const [i, p] of plan.toSave.entries()) {
      const label = documentLabel(p.doc);
      setImp((s) => ({ ...s, progress: `Saving ${i + 1} of ${plan.toSave.length}: ${label}` }));
      let invoicePath: string | null = null;
      if (user?.id) {
        try {
          const file = new File([p.doc.data.slice().buffer as ArrayBuffer], p.doc.fileName, { type: "application/pdf" });
          invoicePath = (await uploadPhoto(file, user.id)).storagePath;
        } catch {
          noPdf++;
        }
      }
      try {
        const row = await directInsertRow<{ id: string }>(
          "restaurant_purchases",
          { ...p.row, invoice_path: invoicePath, created_by: profile?.id ?? null },
          "restaurantPurchases.import",
        );
        try {
          await directInsertRows(
            "restaurant_purchase_lines",
            p.lines.map((l) => ({ ...l, purchase_id: row.id })),
            "restaurantPurchases.importLines",
          );
        } catch (lineErr) {
          // Keep the books whole: no purchase without its items.
          await directDeleteRow("restaurant_purchases", "id", row.id, "restaurantPurchases.importUndo").catch(() => {});
          throw lineErr;
        }
        saved++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/duplicate key|23505|restaurant_purchases_one_document/i.test(msg)) {
          alreadyThere++;
        } else if (isMissingSchema(msg)) {
          failures.push(UPDATE_NEEDED);
          break;
        } else {
          failures.push(`${label}: ${msg}`);
        }
      }
    }
    // Remember items marked Bar (or moved back) for the next invoices.
    if (saved > 0) {
      try {
        await directUpsertRows(
          "restaurant_product_outlets",
          outletsToRemember(plan, remembered),
          "product_number",
          "restaurantPurchases.rememberOutlets",
        );
      } catch {
        /* the invoices are saved; only next time's pre-marking is lost */
      }
    }
    setImp(EMPTY_IMPORT);
    setPreviewOpen(null);
    await load();
    const parts = [`Imported ${saved} document${saved === 1 ? "" : "s"}.`];
    if (alreadyThere) parts.push(`${alreadyThere} were already saved.`);
    if (noPdf) parts.push(`${noPdf} PDF${noPdf === 1 ? "" : "s"} didn't upload, but the numbers are saved.`);
    if (saved || alreadyThere) setNotice(parts.join(" "));
    if (failures.length) setError([...new Set(failures)].join(" · "));
  };

  // ── Line items ───────────────────────────────────────────────────────────

  const toggleLines = async (row: RestaurantPurchase) => {
    if (openId === row.id) {
      setOpenId(null);
      return;
    }
    setOpenId(row.id);
    if (Array.isArray(lines[row.id])) return;
    setLines((m) => ({ ...m, [row.id]: "loading" }));
    try {
      const query = (columns: string) =>
        directSelectList<PurchaseLine>("restaurant_purchase_lines", {
          columns,
          filters: [`purchase_id=eq.${row.id}`],
          orderBy: [{ column: "line_no", ascending: true }],
          limit: 500,
          label: "restaurantPurchases.lines",
        });
      // Outlet and codes arrive with the 2026-10-07 update; before it they're worked out.
      const data = await query(`${LINE_COLUMNS},outlet,cost_ctr,gl_acct`).catch(() => query(LINE_COLUMNS));
      setLines((m) => ({ ...m, [row.id]: data }));
    } catch {
      setLines((m) => ({ ...m, [row.id]: "error" }));
    }
  };

  /** Mark a saved line Restaurant or Bar: the line, the invoice's bar cost, and the product's memory. */
  const changeSavedOutlet = async (row: RestaurantPurchase, lineId: string, outlet: Outlet) => {
    const current = lines[row.id];
    if (!Array.isArray(current) || lineBusy) return;
    const target = current.find((l) => l.id === lineId);
    if (!target) return;
    const next = current.map((l) => (l.id === lineId ? { ...l, outlet } : l));
    setLineBusy(true);
    setError(null);
    try {
      const coded = withCoding(target, remembered);
      await directPatchRow(
        "restaurant_purchase_lines",
        "id",
        lineId,
        { outlet, cost_ctr: coded.cost_ctr, gl_acct: coded.gl_acct },
        "restaurantPurchases.lineOutlet",
      );
      const bar = barCogs(next.map((l) => withCoding(l, remembered)));
      await directPatchRow("restaurant_purchases", "id", row.id, { bar_cogs_amount: bar }, "restaurantPurchases.barCogs");
      await directUpsertRows(
        "restaurant_product_outlets",
        [{ product_number: target.product_number, outlet }],
        "product_number",
        "restaurantPurchases.rememberOutlet",
      );
      setLines((m) => ({ ...m, [row.id]: next }));
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, bar_cogs_amount: bar } : r)));
      setRemembered((m) => new Map(m).set(target.product_number, outlet));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(isMissingSchema(msg) ? UPDATE_NEEDED : `Couldn't change it: ${msg}`);
    } finally {
      setLineBusy(false);
    }
  };

  const plan = imp.plan;
  const planTotal = plan ? plan.toSave.reduce((s, p) => s + p.row.amount, 0) : 0;

  return (
    <div className="gk-page mx-auto">
      <h1 className="mb-1">Restaurant Purchases</h1>
      <p className="text-sm text-muted-foreground mb-5">
        US Foods orders and other F&amp;B buys — this is what the restaurant&apos;s
        &ldquo;Out&rdquo; column on the Money P&amp;L counts.
      </p>

      {notice && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => importRef.current?.click()}
          disabled={imp.reading || imp.saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {imp.reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {imp.reading ? "Reading invoices…" : "Import US Foods invoices"}
        </button>
        <input
          ref={importRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,application/zip,.zip"
          className="hidden"
          aria-label="US Foods invoice files"
          onChange={(e) => pickImportFiles(e.target.files)}
        />
        <button
          onClick={() => setShowVendor((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted active:scale-[0.98] transition-all"
        >
          <Camera className="w-4 h-4" />
          Add beer / warehouse invoice
        </button>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          Log purchase by hand
        </button>
        <Link
          href="/restaurant/food-cost/"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
        >
          <PieChart className="w-4 h-4" />
          Food cost
        </Link>
      </div>

      {!plan && !imp.reading && (
        <p className="text-xs text-muted-foreground -mt-3 mb-5">
          Pick the invoice PDFs from the US Foods site (or the whole .zip). Credit memos and the
          Bulk Funding Order cover sheets can go in the same batch — anything already imported is skipped.
        </p>
      )}

      {plan && imp.read && (
        <div className="gk-card p-3 mb-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">
                {plan.toSave.length === 0
                  ? "Nothing new to import"
                  : `Ready to import ${plan.toSave.length} document${plan.toSave.length === 1 ? "" : "s"} · ${money(planTotal)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Check the totals match your invoices. Open one to see its coding and mark bar items (alcohol is
                always Bar; the app remembers the rest), then save.
              </p>
            </div>
            <button
              onClick={() => setImp(EMPTY_IMPORT)}
              disabled={imp.saving}
              aria-label="Cancel import"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {plan.toSave.length > 0 && (
            <div className="divide-y divide-border/50 rounded-lg border border-border/60">
              {plan.toSave.map((p) => {
                const docKey = `${p.row.kind}-${p.row.document_number}`;
                const isOpen = previewOpen === docKey;
                return (
                <div key={docKey} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0 tabular-nums">{p.row.purchase_date}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(isOpen ? null : docKey)}
                      aria-expanded={isOpen}
                      className="flex-1 min-w-0 flex items-center gap-1 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{documentLabel(p.doc)}</span>
                    </button>
                    <span className={`font-semibold tabular-nums ${p.row.amount < 0 ? "text-success" : ""}`}>
                      {money(p.row.amount)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 pl-[5.5rem]">
                    {p.lines.length} items · food {money(p.row.food_amount)}
                    {p.row.alcohol_amount ? ` · alcohol ${money(p.row.alcohol_amount)}` : ""}
                    {p.row.supplies_amount ? ` · supplies ${money(p.row.supplies_amount)}` : ""}
                    {p.row.bar_cogs_amount ? ` · bar ${money(p.row.bar_cogs_amount)}` : ""}
                    {p.row.delivery_order ? ` · DO ${p.row.delivery_order}` : ""}
                    {p.row.site ? ` · site ${p.row.site}` : ""}
                  </p>
                  {isOpen && (
                    <div className="mt-2">
                      <InvoiceLines
                        lines={p.lines.map((l) => ({ ...l, key: String(l.line_no) }))}
                        total={p.row.amount}
                        disabled={imp.saving}
                        onOutlet={(key, outlet) =>
                          setImp((st) =>
                            st.plan
                              ? { ...st, plan: setPlannedOutlet(st.plan, p.row.document_number, p.row.kind, Number(key), outlet) }
                              : st,
                          )
                        }
                      />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {plan.duplicates.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Skipping (already saved or in the batch twice): {plan.duplicates.join(", ")}
            </p>
          )}
          {imp.read.coverSheets.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Read {imp.read.coverSheets.length} Bulk Funding Order cover sheet
              {imp.read.coverSheets.length === 1 ? "" : "s"} for the delivery order and site.
            </p>
          )}
          {imp.read.unreadable.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Not a US Foods invoice, so left out: {imp.read.unreadable.join(", ")}
            </p>
          )}

          {plan.toSave.length > 0 && (
            <button
              onClick={saveImport}
              disabled={imp.saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {imp.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {imp.saving ? imp.progress ?? "Saving…" : `Save ${plan.toSave.length} document${plan.toSave.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}

      {showVendor && (
        <VendorInvoiceForm
          existing={rows}
          userId={user?.id ?? null}
          profileId={profile?.id ?? null}
          onCancel={() => setShowVendor(false)}
          onSaved={async (message) => {
            setShowVendor(false);
            setError(null);
            await load();
            setNotice(message);
          }}
        />
      )}

      {showForm && (
        <div className="gk-card p-3 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Vendor</label>
              <input
                value={formVendor}
                onChange={(e) => setFormVendor(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Amount ($)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Invoice photo (optional)
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-muted-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="e.g. weekly food order"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={save}
            disabled={saving || !formAmount}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save purchase
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : months.length === 0 ? (
        <div className="gk-card p-6 text-center text-sm text-muted-foreground">
          No purchases logged yet. Import your US Foods invoices above — each one lands in the
          restaurant&apos;s monthly spend automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(([key, list]) => {
            const total = list.reduce((s, r) => s + Number(r.amount), 0);
            const [y, m] = key.split("-").map(Number);
            const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            });
            return (
              <section key={key}>
                <div className="flex items-center justify-between mb-2">
                  <p className="gk-section-label">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{money(total)}</p>
                </div>
                <div className="gk-card divide-y divide-border/50">
                  {list.map((r) => {
                    const hasLines = !!r.document_number;
                    const open = openId === r.id;
                    const rowLines = lines[r.id];
                    return (
                      <div key={r.id}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                            {r.purchase_date}
                          </span>
                          {hasLines ? (
                            <button
                              onClick={() => toggleLines(r)}
                              className="flex-1 min-w-0 flex items-center gap-1 text-left"
                              aria-expanded={open}
                            >
                              {open ? (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">
                                {r.vendor}
                                {r.notes ? ` — ${r.notes}` : ""}
                              </span>
                            </button>
                          ) : (
                            <span className="flex-1 min-w-0 truncate">
                              {r.vendor}
                              {r.notes ? ` — ${r.notes}` : ""}
                            </span>
                          )}
                          {r.invoice_path && (
                            <a
                              href={publicStorageUrl("photos", r.invoice_path)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-link p-1.5 rounded text-muted-foreground hover:text-foreground shrink-0"
                              aria-label="View invoice"
                            >
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}
                          <span
                            className={`font-semibold tabular-nums shrink-0 ${Number(r.amount) < 0 ? "text-success" : ""}`}
                          >
                            {money(Number(r.amount))}
                          </span>
                          <button
                            onClick={() => remove(r)}
                            aria-label="Delete purchase"
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {open && (
                          <div className="px-4 pb-3 text-xs">
                            {r.food_amount != null && (
                              <p className="text-muted-foreground mb-1.5">
                                Food {money(Number(r.food_amount))}
                                {Number(r.alcohol_amount) ? ` · Alcohol ${money(Number(r.alcohol_amount))}` : ""}
                                {Number(r.supplies_amount) ? ` · Supplies ${money(Number(r.supplies_amount))}` : ""}
                                {Number(r.bar_cogs_amount) ? ` · Bar ${money(Number(r.bar_cogs_amount))}` : ""}
                                {r.delivery_order ? ` · DO ${r.delivery_order}` : ""}
                              </p>
                            )}
                            {rowLines === "loading" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            {rowLines === "error" && <p className="text-destructive">Couldn&apos;t load the items.</p>}
                            {Array.isArray(rowLines) && (
                              <InvoiceLines
                                lines={rowLines.map((l) => ({ ...withCoding(l, remembered), key: l.id }))}
                                total={Number(r.amount)}
                                disabled={lineBusy}
                                onOutlet={(key, outlet) => void changeSavedOutlet(r, key, outlet)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
