"use client";

// Restaurant purchases — US Foods (and friends) invoices. Restaurant spend
// never rides a purchase request, so this log is what feeds the restaurant
// "Out" column on the per-area P&L (via restaurant_spend_monthly_rollup).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directDeleteRow,
  directInsertRow,
  directSelectList,
  publicStorageUrl,
} from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import { todayLocal } from "@/lib/utils/date";

interface RestaurantPurchase {
  id: string;
  purchase_date: string;
  vendor: string;
  amount: number;
  invoice_path: string | null;
  notes: string | null;
  created_at: string;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function RestaurantPurchasesPage() {
  const { profile, user } = useAuth();
  const [rows, setRows] = useState<RestaurantPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState(todayLocal());
  const [formVendor, setFormVendor] = useState("US Foods");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await directSelectList<RestaurantPurchase>("restaurant_purchases", {
        columns: "*",
        orderBy: [
          { column: "purchase_date", ascending: false },
          { column: "created_at", ascending: false },
        ],
        limit: 500,
        label: "restaurantPurchases.list",
      });
      setRows(data);
      setError(null);
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

      <button
        onClick={() => setShowForm((v) => !v)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all mb-5"
      >
        <Plus className="w-4 h-4" />
        Log purchase
      </button>

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
          No purchases logged yet. Each US Foods invoice you log lands in the
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
                  {list.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                        {r.purchase_date}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {r.vendor}
                        {r.notes ? ` — ${r.notes}` : ""}
                      </span>
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
                      <span className="font-semibold tabular-nums shrink-0">
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
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
