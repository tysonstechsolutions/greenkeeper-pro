"use client";

// FUEL LOG — Reladyne delivers, Tyson signs the receipt, forwards it to the
// business office, and reports fuel purchases monthly. This page logs each
// refill (with an optional receipt photo), tracks whether the receipt has
// made it to the business office, and shows deterministic per-month totals
// so the monthly report is just "read the header row".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Fuel,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directDeleteRow,
  directInsertRow,
  directPatchRow,
  directSelectList,
  publicStorageUrl,
} from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import { todayLocal } from "@/lib/utils/date";

// Matches the fuel_refills table (already applied in the DB).
interface FuelRefill {
  id: string;
  refill_date: string; // YYYY-MM-DD
  tank: string;
  gallons: number | null;
  cost: number | null;
  vendor: string | null;
  receipt_path: string | null;
  sent_to_business_office: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// The receipts ride in the same public bucket uploadPhoto writes to.
const RECEIPT_BUCKET = "photos";

// The course's three tanks — quick picks, but tank stays free text.
const TANK_SUGGESTIONS = ["Diesel", "Gasoline", "Used cooking oil"];

const DEFAULT_VENDOR = "Reladyne";

// ── Deterministic formatting helpers ───────────────────────────────────────

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatGallons(g: number): string {
  return `${g.toLocaleString("en-US", { maximumFractionDigits: 1 })} gal`;
}

function formatCost(c: number): string {
  return c.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

interface MonthGroup {
  ym: string; // "YYYY-MM"
  rows: FuelRefill[];
  totalGallons: number;
  totalCost: number;
}

/** Group refills by calendar month, newest month first. Pure client math. */
function groupByMonth(rows: FuelRefill[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const r of rows) {
    const ym = r.refill_date.slice(0, 7);
    let g = map.get(ym);
    if (!g) {
      g = { ym, rows: [], totalGallons: 0, totalCost: 0 };
      map.set(ym, g);
    }
    g.rows.push(r);
    g.totalGallons += Number(r.gallons ?? 0);
    g.totalCost += Number(r.cost ?? 0);
  }
  return [...map.values()].sort((a, b) => b.ym.localeCompare(a.ym));
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FuelLogPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [refills, setRefills] = useState<FuelRefill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState(todayLocal());
  const [formTank, setFormTank] = useState("");
  const [formGallons, setFormGallons] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formVendor, setFormVendor] = useState(DEFAULT_VENDOR);
  const [formSent, setFormSent] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-row busy flags so a slow toggle/delete only spins its own row.
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRefills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directSelectList<FuelRefill>("fuel_refills", {
        columns: "*",
        orderBy: [
          { column: "refill_date", ascending: false },
          { column: "created_at", ascending: false },
        ],
        label: "fuel.fetchRefills",
      });
      setRefills(data);
    } catch (err) {
      console.error("[fuel] fetchRefills failed:", err);
      setError("Couldn't load the fuel log. Pull to refresh or try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRefills();
  }, [fetchRefills]);

  const months = useMemo(() => groupByMonth(refills), [refills]);

  const resetForm = () => {
    setFormDate(todayLocal());
    setFormTank("");
    setFormGallons("");
    setFormCost("");
    setFormVendor(DEFAULT_VENDOR);
    setFormSent(false);
    setFormNotes("");
    setReceiptFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!formTank.trim() || !formDate) return;
    setSaving(true);
    setError(null);

    try {
      // Receipt photo is BEST-EFFORT — a flaky upload must never block the
      // refill record itself (the gallons/cost are what monthly reporting
      // needs; the photo can be re-added later).
      let receiptPath: string | null = null;
      let uploadFailed = false;
      if (receiptFile) {
        if (!userId) {
          uploadFailed = true;
        } else {
          try {
            const { storagePath } = await uploadPhoto(receiptFile, userId);
            receiptPath = storagePath;
          } catch (err) {
            console.error("[fuel] receipt upload failed:", err);
            uploadFailed = true;
          }
        }
      }

      const gallons = parseFloat(formGallons);
      const cost = parseFloat(formCost);

      await directInsertRow(
        "fuel_refills",
        {
          refill_date: formDate,
          tank: formTank.trim(),
          gallons: Number.isFinite(gallons) ? gallons : null,
          cost: Number.isFinite(cost) ? cost : null,
          vendor: formVendor.trim() || DEFAULT_VENDOR,
          receipt_path: receiptPath,
          sent_to_business_office: formSent,
          notes: formNotes.trim() || null,
          created_by: userId,
        },
        "fuel.insertRefill",
      );

      resetForm();
      setShowForm(false);
      await fetchRefills();
      if (uploadFailed) {
        setError(
          "Refill saved — but the receipt photo didn't upload. You can re-add it later.",
        );
      }
    } catch (err) {
      // Only the INSERT can land here now — report what actually happened.
      console.error("[fuel] insertRefill failed:", err);
      setError(
        err instanceof Error && err.message
          ? `Couldn't save the refill: ${err.message}`
          : "Couldn't save the refill. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSent = async (row: FuelRefill) => {
    if (busyId) return;
    const next = !row.sent_to_business_office;
    setBusyId(row.id);
    // Optimistic flip; revert on failure.
    setRefills((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, sent_to_business_office: next } : r,
      ),
    );
    try {
      await directPatchRow(
        "fuel_refills",
        "id",
        row.id,
        { sent_to_business_office: next },
        "fuel.toggleSent",
      );
    } catch (err) {
      // Don't blindly revert: a client-side timeout can fire AFTER the PATCH
      // actually landed, and a revert would then show the opposite of the
      // database. Re-fetch to resync with whatever the server really has.
      console.error("[fuel] toggleSent failed:", err);
      setError("Couldn't confirm the receipt status — resynced from the server.");
      await fetchRefills();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: FuelRefill) => {
    if (busyId) return;
    const what = `${formatDay(row.refill_date)} — ${row.tank}`;
    if (!window.confirm(`Delete the refill (${what})? This can't be undone.`)) {
      return;
    }
    setBusyId(row.id);
    try {
      await directDeleteRow("fuel_refills", "id", row.id, "fuel.deleteRefill");
      setRefills((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      console.error("[fuel] deleteRefill failed:", err);
      setError("Couldn't delete that refill. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="gk-page mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 gk-animate-in gk-animate-in-1">
        <div>
          <h1 className="mb-0.5">Fuel Log</h1>
          <p className="text-sm text-muted-foreground">
            Reladyne refills — sign the receipt, send it to the business
            office, report monthly.
          </p>
        </div>
        <button
          onClick={() => {
            if (!showForm) resetForm();
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all shrink-0"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Close" : "Log refill"}
        </button>
      </div>

      {/* Log refill form */}
      {showForm && (
        <div className="gk-card p-4 space-y-3 mb-6 gk-animate-in gk-animate-in-2">
          <h3 className="font-semibold text-sm">New refill</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Date *
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Vendor
              </label>
              <input
                value={formVendor}
                onChange={(e) => setFormVendor(e.target.value)}
                placeholder={DEFAULT_VENDOR}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Tank *
            </label>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {TANK_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormTank(t)}
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                    formTank === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              value={formTank}
              onChange={(e) => setFormTank(e.target.value)}
              placeholder="Pick a tank above or type one"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Gallons
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={formGallons}
                onChange={(e) => setFormGallons(e.target.value)}
                placeholder="e.g. 250"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Cost ($)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                placeholder="e.g. 812.40"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Receipt photo
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-muted transition-colors">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                {receiptFile ? "Change photo" : "Attach receipt"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {receiptFile && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                  <span className="truncate max-w-[12rem]">{receiptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="p-1 rounded-md hover:bg-muted"
                    aria-label="Remove receipt photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFormSent((v) => !v)}
            className="flex items-center gap-2.5 text-left"
          >
            <span
              className={cn(
                "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                formSent
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {formSent && <Check className="w-3.5 h-3.5" />}
            </span>
            <span className="text-sm">Receipt sent to business office</span>
          </button>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Notes
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth remembering about this delivery..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !formTank.trim() || !formDate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving..." : "Save refill"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-destructive gk-animate-in">{error}</p>
      )}

      {/* Refills grouped by month */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : refills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gk-animate-in gk-animate-in-2">
          <Fuel className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No refills logged yet</p>
          <p className="text-xs mt-1">
            Tap &quot;Log refill&quot; when Reladyne delivers.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {months.map((month, idx) => (
            <section
              key={month.ym}
              className={cn(
                "gk-animate-in",
                idx < 7 && `gk-animate-in-${idx + 2}`,
              )}
            >
              <p className="gk-section-label mb-2">{monthLabel(month.ym)}</p>
              <div className="gk-card overflow-hidden">
                {/* Month totals header row */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/40">
                  <span className="text-xs font-semibold">
                    {month.rows.length}{" "}
                    {month.rows.length === 1 ? "refill" : "refills"}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {formatGallons(month.totalGallons)}
                    <span className="text-muted-foreground font-medium">
                      {" "}
                      &middot;{" "}
                    </span>
                    {formatCost(month.totalCost)}
                  </span>
                </div>

                <div className="divide-y divide-border/50">
                  {month.rows.map((row) => {
                    const busy = busyId === row.id;
                    return (
                      <div key={row.id} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {row.tank}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDay(row.refill_date)}
                              </span>
                              <button
                                onClick={() => toggleSent(row)}
                                disabled={busy}
                                className={cn(
                                  "text-[11px] font-semibold px-1.5 py-0.5 rounded-md border transition-colors",
                                  row.sent_to_business_office
                                    ? "bg-success/10 text-success border-success/30"
                                    : "bg-warning/15 text-warning-foreground border-warning/40",
                                )}
                                title="Tap to flip whether the receipt went to the business office"
                              >
                                {busy ? (
                                  <Loader2 className="w-3 h-3 animate-spin inline" />
                                ) : row.sent_to_business_office ? (
                                  "Sent to BO"
                                ) : (
                                  "Not sent"
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                              {[
                                row.gallons != null
                                  ? formatGallons(Number(row.gallons))
                                  : null,
                                row.cost != null
                                  ? formatCost(Number(row.cost))
                                  : null,
                                row.vendor,
                                row.notes,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {!row.sent_to_business_office && (
                              <p className="text-[11px] text-warning-foreground mt-0.5">
                                Receipt not sent to the business office yet
                              </p>
                            )}
                          </div>

                          {row.receipt_path && (
                            <a
                              href={publicStorageUrl(
                                RECEIPT_BUCKET,
                                row.receipt_path,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-link p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
                              aria-label="Open receipt photo"
                            >
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            onClick={() => handleDelete(row)}
                            disabled={busy}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                            aria-label="Delete refill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
