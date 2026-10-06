"use client";

// A RecTrac Flash Report read exactly (no AI): every item, every day,
// checked against the report's own daily totals and grand total. Saving
// replaces whatever was entered for that outlet on those days.

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  directDeleteByFilter,
  directInsertRow,
  directInsertRows,
  directSelectList,
} from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import type { FlashReport } from "@/lib/sales/rectrac-flash";
import {
  SALES_CATEGORY,
  SALES_OUTLET_LABELS,
  revenueRows,
  type FlashImportPlan,
} from "@/lib/sales/import";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const CHUNK = 500;

const UPDATE_NEEDED =
  "Run the database update 20261009120000_sales_reports.sql in Supabase first (it stores the item-by-item sales). Nothing was saved.";

export function FlashImport({
  report,
  plan,
  file,
  userId,
  detectedOutlet,
  onSaved,
  onCancel,
}: {
  report: FlashReport;
  plan: FlashImportPlan;
  file: File | null;
  userId: string | null;
  /** What the report itself says it is (category/title), when it disagrees with the pick. */
  detectedOutlet: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [existing, setExisting] = useState<{ count: number; total: number } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const category = SALES_CATEGORY[plan.outlet];
  const exact = report.mismatches.length === 0;

  // What's already entered for these days (it gets replaced).
  useEffect(() => {
    let alive = true;
    directSelectList<{ amount: number }>("revenue_entries", {
      columns: "amount",
      filters: [`category=eq.${category}`, `entry_date=gte.${plan.begin}`, `entry_date=lte.${plan.end}`],
      limit: 5000,
      label: "revenue.flash.existing",
    })
      .then((rows) => {
        if (alive) setExisting({ count: rows.length, total: rows.reduce((s, r) => s + Number(r.amount), 0) });
      })
      .catch(() => alive && setExisting({ count: 0, total: 0 }));
    return () => {
      alive = false;
    };
  }, [category, plan.begin, plan.end]);

  const save = async () => {
    setError(null);
    try {
      setSaving("Keeping a copy of the report…");
      let reportPath: string | null = null;
      if (file && userId) {
        try {
          reportPath = (await uploadPhoto(file, userId)).storagePath;
        } catch {
          reportPath = null;
        }
      }
      setSaving("Clearing what was entered for these days…");
      const range = [`entry_date=gte.${plan.begin}`, `entry_date=lte.${plan.end}`];
      await directDeleteByFilter("revenue_entries", [`category=eq.${category}`, ...range], "revenue.flash.clear");
      await directDeleteByFilter(
        "sales_item_days",
        [`outlet=eq.${plan.outlet}`, `sale_date=gte.${plan.begin}`, `sale_date=lte.${plan.end}`],
        "revenue.flash.clearItems",
      );
      await directDeleteByFilter(
        "sales_reports",
        [`outlet=eq.${plan.outlet}`, `begin_date=gte.${plan.begin}`, `end_date=lte.${plan.end}`],
        "revenue.flash.clearReports",
      );
      setSaving("Saving the report…");
      const row = await directInsertRow<{ id: string }>(
        "sales_reports",
        {
          outlet: plan.outlet,
          title: report.title,
          category: report.category,
          begin_date: plan.begin,
          end_date: plan.end,
          grand_total: report.grandTotal ?? plan.total,
          transactions: report.transactions,
          source_file: reportPath ?? file?.name ?? null,
        },
        "revenue.flash.report",
      );
      const revenue = revenueRows(plan, row.id, userId).map((r) => ({ ...r, report_path: reportPath }));
      for (let i = 0; i < revenue.length; i += CHUNK) {
        setSaving(`Saving daily sales ${Math.min(i + CHUNK, revenue.length)} of ${revenue.length}…`);
        await directInsertRows("revenue_entries", revenue.slice(i, i + CHUNK), "revenue.flash.days");
      }
      const items = plan.itemDays.map((it) => ({ ...it, report_id: row.id, outlet: plan.outlet }));
      for (let i = 0; i < items.length; i += CHUNK) {
        setSaving(`Saving item sales ${Math.min(i + CHUNK, items.length)} of ${items.length}…`);
        await directInsertRows("sales_item_days", items.slice(i, i + CHUNK), "revenue.flash.items");
      }
      onSaved(
        `Saved ${SALES_OUTLET_LABELS[plan.outlet]} sales ${shortDate(plan.begin)} – ${shortDate(plan.end)}: ${money(plan.total)} over ${plan.days.length} days.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/sales_report|sales_item_days|report_area|schema cache|does not exist|revenue_entries_category_check/i.test(msg) ? UPDATE_NEEDED : msg);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3" aria-label="RecTrac report">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{SALES_OUTLET_LABELS[plan.outlet]} sales · read exactly from RecTrac</p>
          <p className="text-xs text-muted-foreground">
            {report.title}
            {report.category ? ` · ${report.category}` : ""} · {shortDate(plan.begin)} – {shortDate(plan.end)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={!!saving} aria-label="Discard report">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${
          exact ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}
      >
        {exact ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
        <span>
          {exact
            ? `${money(plan.total)} over ${plan.days.length} days — matches the report's grand total and every daily total.`
            : `The report doesn't add up to its own totals: ${report.mismatches.slice(0, 3).join("; ")}`}
        </span>
      </div>

      {detectedOutlet && detectedOutlet !== plan.outlet && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The report itself looks like {detectedOutlet.replace("_", " ")} sales, but you picked {plan.outlet.replace("_", " ")}. Check
          the report type above before saving.
        </p>
      )}

      <div className="rounded-lg border border-border/60">
        <table className="w-full text-xs">
          <tbody>
            {plan.months.map((m) => (
              <tr key={m.month} className="border-t border-border/40 first:border-t-0">
                <td className="px-3 py-1">{monthLabel(m.month)}</td>
                <td className="px-3 py-1 text-right tabular-nums">{money(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {plan.itemDays.length} item-days ({report.sales.length} lines on the report). Each day saves as one{" "}
        {SALES_OUTLET_LABELS[plan.outlet].toLowerCase()} revenue entry; the items are kept for best sellers and prices.
      </p>

      {existing && existing.count > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {existing.count} {SALES_OUTLET_LABELS[plan.outlet].toLowerCase()} revenue entr{existing.count === 1 ? "y" : "ies"} already on
          these dates ({money(existing.total)}) will be replaced by this report.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={!!saving || !exact} onClick={save}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        {saving ?? `Save ${plan.days.length} days of sales`}
      </Button>
    </div>
  );
}
