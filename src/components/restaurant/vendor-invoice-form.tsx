"use client";

// A delivery invoice from a vendor other than US Foods: Lakeshore or Kloss
// (beer), the MWR Central Warehouse (sodas, supplies, some alcohol), or a
// mess requisition. Snap or pick the receipt, the AI reads the lines, you
// check them against the paper, and it saves like a US Foods invoice: every
// line food / alcohol / supplies, restaurant or bar, with its cost center and
// G/L — so bar cost and food cost count it.

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { directDeleteRow, directInsertRow, directInsertRows, directUpsertRows } from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import { extractReceipt } from "@/lib/pr/receipt-extract";
import { todayLocal } from "@/lib/utils/date";
import type { Outlet } from "@/lib/restaurant/coding";
import type { PurchaseCategory } from "@/lib/restaurant/usfoods";
import {
  VENDORS,
  classifyVendorLine,
  linesFromReceipt,
  planVendorInvoice,
  vendorProfile,
  type VendorLineInput,
} from "@/lib/restaurant/vendor-invoice";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** One editable line; numbers stay text while typing. */
interface DraftLine {
  key: number;
  item: string;
  description: string;
  qty: string;
  unit_price: string;
  extended: string;
  category: PurchaseCategory;
  outlet: Outlet;
  /** The type was picked by hand, so editing the description doesn't re-guess it. */
  picked: boolean;
}

const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

let nextKey = 1;
function draft(l: Partial<VendorLineInput> & { category: PurchaseCategory }): DraftLine {
  return {
    key: nextKey++,
    item: l.item ?? "",
    description: l.description ?? "",
    qty: l.qty != null ? String(l.qty) : "1",
    unit_price: l.unit_price != null ? String(l.unit_price) : "",
    extended: l.extended != null ? String(l.extended) : "",
    category: l.category,
    outlet: l.category === "alcohol" ? "bar" : (l.outlet ?? "restaurant"),
    picked: false,
  };
}

const UPDATE_NEEDED =
  "A database update for invoice importing hasn't been run yet. Run 20261006120000_operations_upgrade.sql and then 20261007120000_bar_and_invoice_coding.sql in Supabase, then try again.";

export function VendorInvoiceForm({
  existing,
  userId,
  profileId,
  onSaved,
  onCancel,
}: {
  /** Saved purchases, to stop the same invoice going in twice. */
  existing: { vendor: string; kind?: string | null; document_number?: string | null }[];
  userId: string | null;
  profileId: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [vendorKey, setVendorKey] = useState(VENDORS[0].key);
  const [otherName, setOtherName] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [number, setNumber] = useState("");
  const [kind, setKind] = useState<"invoice" | "credit">("invoice");
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const base = VENDORS.find((v) => v.key === vendorKey) ?? VENDORS[0];
  const vendorName = base.key === "other" ? otherName.trim() : base.name;
  const profile = vendorProfile(vendorName || "other");

  const linesTotal = useMemo(() => r2(lines.reduce((s, l) => s + (Number.isFinite(num(l.extended)) ? num(l.extended) : 0), 0)), [lines]);
  const totalNum = num(total);
  const difference = Number.isFinite(totalNum) ? r2(Math.abs(totalNum) - Math.abs(linesTotal)) : null;
  const badLine = lines.some((l) => !l.description.trim() || !Number.isFinite(num(l.extended)));
  const duplicate =
    !!number.trim() &&
    existing.some(
      (e) =>
        e.vendor.trim().toLowerCase() === vendorName.toLowerCase() &&
        (e.kind ?? "invoice") === kind &&
        (e.document_number ?? "").trim().toLowerCase() === number.trim().toLowerCase(),
    );
  const canSave =
    !!vendorName && !!date && !!number.trim() && lines.length > 0 && !badLine && Number.isFinite(totalNum) && !duplicate && !saving;

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Qty × price fills the amount when either changes.
        if (("qty" in patch || "unit_price" in patch) && Number.isFinite(num(next.qty)) && Number.isFinite(num(next.unit_price))) {
          next.extended = String(r2(num(next.qty) * num(next.unit_price)));
        }
        if (next.category === "alcohol") next.outlet = "bar";
        return next;
      }),
    );

  const read = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setReading(true);
    setError(null);
    setWarnings([]);
    try {
      const receipt = await extractReceipt(f);
      const read = linesFromReceipt(receipt, profile);
      if (read.length) setLines(read.map((l) => draft(l)));
      if (receipt.total != null) setTotal(String(Math.abs(receipt.total)));
      if (receipt.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchase_date)) setDate(receipt.purchase_date);
      const notes = [...receipt.warnings];
      if (!read.length) notes.push("No lines could be read. Type them in from the receipt.");
      setWarnings(notes);
    } catch (e) {
      setError(`Couldn't read the receipt: ${e instanceof Error ? e.message : String(e)}. You can type the lines in.`);
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    if (difference !== 0 && !window.confirm(`The lines add to ${money(linesTotal)} but the invoice total is ${money(Math.abs(totalNum))}. Save anyway? The ${money(Math.abs(difference ?? 0))} difference goes on the invoice's main cost.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const planned = planVendorInvoice({
        vendor: vendorName,
        kind,
        document_number: number.trim(),
        purchase_date: date,
        total: Math.abs(totalNum),
        lines: lines.map((l) => ({
          item: l.item.trim() || null,
          description: l.description,
          qty: Number.isFinite(num(l.qty)) ? num(l.qty) : 1,
          unit_price: Number.isFinite(num(l.unit_price)) ? num(l.unit_price) : num(l.extended),
          extended: num(l.extended),
          category: l.category,
          outlet: l.outlet,
        })),
      });
      let invoicePath: string | null = null;
      if (file && userId) {
        try {
          invoicePath = (await uploadPhoto(file, userId)).storagePath;
        } catch {
          invoicePath = null;
        }
      }
      const row = await directInsertRow<{ id: string }>(
        "restaurant_purchases",
        { ...planned.row, invoice_path: invoicePath, created_by: profileId },
        "restaurantPurchases.vendorInvoice",
      );
      try {
        await directInsertRows(
          "restaurant_purchase_lines",
          planned.lines.map((l) => ({ ...l, purchase_id: row.id })),
          "restaurantPurchases.vendorInvoiceLines",
        );
      } catch (lineErr) {
        // No purchase without its items.
        await directDeleteRow("restaurant_purchases", "id", row.id, "restaurantPurchases.vendorInvoiceUndo").catch(() => {});
        throw lineErr;
      }
      // Remember non-alcohol items marked Bar for next time.
      const bar = planned.lines.filter((l) => l.category !== "alcohol" && l.outlet === "bar");
      if (bar.length) {
        await directUpsertRows(
          "restaurant_product_outlets",
          bar.map((l) => ({ product_number: l.product_number, outlet: "bar" })),
          "product_number",
          "restaurantPurchases.vendorRemember",
        ).catch(() => {});
      }
      onSaved(
        `Saved ${planned.row.vendor} ${kind === "credit" ? "credit" : "invoice"} ${planned.row.document_number}: ${money(planned.row.amount)}${
          planned.row.bar_cogs_amount ? ` (bar ${money(planned.row.bar_cogs_amount)})` : ""
        }${file && !invoicePath ? ". The photo didn't upload, but the numbers are saved." : "."}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicate key|23505|restaurant_purchases_one_document/i.test(msg)) setError("That invoice is already saved.");
      else if (/column .* does not exist|could not find the .* column|relation .* does not exist|schema cache/i.test(msg)) setError(UPDATE_NEEDED);
      else setError(`Couldn't save it: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="gk-card p-3 mb-5 space-y-3" aria-label="Delivery invoice">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Add a delivery invoice</p>
          <p className="text-xs text-muted-foreground">
            Beer, warehouse, and requisition invoices. Take a photo and the lines fill in. Check them against the paper,
            then save.
          </p>
        </div>
        <button onClick={onCancel} disabled={saving} aria-label="Close delivery invoice" className="p-1.5 rounded text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium col-span-2 sm:col-span-1">
          Vendor
          <select
            aria-label="Vendor"
            value={vendorKey}
            onChange={(e) => {
              const v = VENDORS.find((x) => x.key === e.target.value) ?? VENDORS[0];
              setVendorKey(v.key);
              // Re-guess each line's type for the new vendor, unless it was picked by hand.
              setLines((ls) => ls.map((l) => (l.picked ? l : { ...l, ...categoryFor(l.description, v, l) })));
            }}
            className={`${input} mt-1`}
          >
            {VENDORS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.name || "Other vendor"} — {v.hint}
              </option>
            ))}
          </select>
        </label>
        {base.key === "other" && (
          <label className="text-xs font-medium col-span-2 sm:col-span-1">
            Vendor name
            <input value={otherName} onChange={(e) => setOtherName(e.target.value)} className={`${input} mt-1`} />
          </label>
        )}
        <label className="text-xs font-medium">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-medium">
          {base.key === "requisition" ? "Requisition #" : "Invoice #"}
          <input value={number} onChange={(e) => setNumber(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-medium">
          Invoice total
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00" className={`${input} mt-1`} />
        </label>
        <div className="text-xs font-medium">
          Type
          <div className="mt-1 flex gap-3 text-sm font-normal">
            <label className="flex items-center gap-1">
              <input type="radio" checked={kind === "invoice"} onChange={() => setKind("invoice")} /> Invoice
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={kind === "credit"} onChange={() => setKind("credit")} /> Credit / return
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading || saving}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {reading ? "Reading the receipt…" : file ? "Read a different photo" : "Photo or PDF of the receipt"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          aria-label="Receipt photo"
          onChange={(e) => read(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, draft({ category: profile.category })])}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"
        >
          <Plus className="w-4 h-4" /> Add a line
        </button>
        {file && <span className="text-xs text-muted-foreground truncate max-w-[12rem]">{file.name}</span>}
      </div>

      {warnings.length > 0 && (
        <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-4">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-lg border border-border/60 p-2 space-y-1.5" aria-label={`Line ${i + 1}`}>
              <div className="flex gap-2">
                <input
                  aria-label={`Line ${i + 1} item number`}
                  placeholder="Item #"
                  value={l.item}
                  onChange={(e) => setLine(l.key, { item: e.target.value })}
                  className={`${input} w-24 shrink-0`}
                />
                <input
                  aria-label={`Line ${i + 1} description`}
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) =>
                    setLine(l.key, { description: e.target.value, ...(l.picked ? {} : categoryFor(e.target.value, profile, l)) })
                  }
                  className={input}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={input} placeholder="Qty" />
                <input aria-label={`Line ${i + 1} price`} inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} className={input} placeholder="Price each" />
                <input aria-label={`Line ${i + 1} amount`} inputMode="decimal" value={l.extended} onChange={(e) => setLine(l.key, { extended: e.target.value })} className={input} placeholder="Amount" />
                <select
                  aria-label={`Line ${i + 1} type`}
                  value={l.category}
                  onChange={(e) => setLine(l.key, { category: e.target.value as PurchaseCategory, picked: true })}
                  className={input}
                >
                  <option value="alcohol">Alcohol</option>
                  <option value="food">Food / drink</option>
                  <option value="supplies">Supplies</option>
                </select>
                <select
                  aria-label={`Line ${i + 1} outlet`}
                  value={l.outlet}
                  disabled={l.category === "alcohol" || l.category === "supplies"}
                  onChange={(e) => setLine(l.key, { outlet: e.target.value as Outlet })}
                  className={input}
                >
                  <option value="bar">Bar</option>
                  <option value="restaurant">Restaurant</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${
            difference === 0 ? "bg-success/10 border-success/30 text-success" : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
          }`}
        >
          {difference === 0 ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>
            {difference == null
              ? `Lines add to ${money(linesTotal)}. Type the invoice total to check them.`
              : difference === 0
                ? `Lines add to ${money(linesTotal)} — matches the invoice total.`
                : `Lines add to ${money(linesTotal)}, the invoice says ${money(Math.abs(totalNum))} (${money(Math.abs(difference))} ${difference > 0 ? "missing" : "too much"}). A service or delivery charge is often the gap — add it as a line.`}
          </span>
        </div>
      )}
      {duplicate && <p className="text-xs text-destructive">That {vendorName} {kind} number is already saved.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        onClick={save}
        disabled={!canSave}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saving ? "Saving…" : "Save invoice"}
      </button>
    </div>
  );
}

/** A fresh guess at a line's type (and bar/restaurant) from its description. */
function categoryFor(
  description: string,
  vendor: { category: PurchaseCategory },
  current?: DraftLine,
): Pick<DraftLine, "category" | "outlet"> {
  const category = classifyVendorLine(description, vendor);
  const outlet: Outlet = category === "alcohol" ? "bar" : current && current.category !== "alcohol" ? current.outlet : "restaurant";
  return { category, outlet };
}
