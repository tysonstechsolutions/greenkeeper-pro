"use client";

// A RecTrac Flash Report read exactly (no AI): every item, every day,
// checked against the report's own daily totals and grand total. Saving
// replaces whatever was entered for that outlet on those days, except
// reception ticket sales, which have their own report.
//
// A ticket report (graduation receptions) saves the same way as restaurant
// sales, and replaces only the ticket report saved before it.

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
import { TICKET_CATEGORY, type TicketReport } from "@/lib/sales/ticket-report";
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

/** Saved ticket reports, so a flash upload leaves their sales alone (and a ticket upload replaces them). */
async function ticketReports(): Promise<{ id: string; begin_date: string; end_date: string; grand_total: number }[]> {
  return directSelectList("sales_reports", {
    columns: "id,begin_date,end_date,grand_total",
    filters: [`category=eq.${encodeURIComponent(TICKET_CATEGORY)}`],
    limit: 500,
    label: "revenue.flash.ticketReports",
  });
}

const UPDATE_NEEDED =
  "Run the database update 20261009120000_sales_reports.sql in Supabase first (it stores the item-by-item sales). Nothing was saved.";

export function FlashImport({
  report,
  plan,
  file,
  userId,
  detectedOutlet,
  tickets,
  onSaved,
  onCancel,
}: {
  report: FlashReport;
  plan: FlashImportPlan;
  file: File | null;
  userId: string | null;
  /** What the report itself says it is (category/title), when it disagrees with the pick. */
  detectedOutlet: string | null;
  /** Set when this is a reception ticket report. */
  tickets?: TicketReport;
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
    if (tickets) {
      ticketReports()
        .then((saved) =>
          saved.length
            ? directSelectList<{ amount: number }>("revenue_entries", {
                columns: "amount",
                filters: [`sales_report_id=in.(${saved.map((r) => r.id).join(",")})`, `entry_date=gte.${plan.begin}`, `entry_date=lte.${plan.end}`],
                limit: 5000,
                label: "revenue.tickets.existing",
              })
            : [],
        )
        .then((rows) => {
          if (alive) setExisting({ count: rows.length, total: rows.reduce((s, r) => s + Number(r.amount), 0) });
        })
        .catch(() => alive && setExisting({ count: 0, total: 0 }));
      return () => {
        alive = false;
      };
    }
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
  }, [category, plan.begin, plan.end, tickets]);

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
      const saved = await ticketReports();
      if (tickets) {
        // Ticket sales already saved for these days are replaced; other days stay.
        setSaving("Replacing the ticket sales saved for these days…");
        const ids = saved.map((r) => r.id).join(",");
        if (ids) {
          await directDeleteByFilter(
            "revenue_entries",
            [`sales_report_id=in.(${ids})`, `entry_date=gte.${plan.begin}`, `entry_date=lte.${plan.end}`],
            "revenue.tickets.clear",
          );
          await directDeleteByFilter(
            "sales_item_days",
            [`report_id=in.(${ids})`, `sale_date=gte.${plan.begin}`, `sale_date=lte.${plan.end}`],
            "revenue.tickets.clearItems",
          );
          // A ticket report wholly inside these days has nothing left.
          await directDeleteByFilter(
            "sales_reports",
            [`id=in.(${ids})`, `begin_date=gte.${plan.begin}`, `end_date=lte.${plan.end}`],
            "revenue.tickets.clearReports",
          );
        }
      } else {
        setSaving("Clearing what was entered for these days…");
        // Ticket sales stay: they come from their own report.
        const keep = saved.map((r) => r.id).join(",");
        const range = [`entry_date=gte.${plan.begin}`, `entry_date=lte.${plan.end}`];
        await directDeleteByFilter(
          "revenue_entries",
          [`category=eq.${category}`, ...range, ...(keep ? [`or=(sales_report_id.is.null,sales_report_id.not.in.(${keep}))`] : [])],
          "revenue.flash.clear",
        );
        await directDeleteByFilter(
          "sales_item_days",
          [`outlet=eq.${plan.outlet}`, `sale_date=gte.${plan.begin}`, `sale_date=lte.${plan.end}`, ...(keep ? [`report_id=not.in.(${keep})`] : [])],
          "revenue.flash.clearItems",
        );
        await directDeleteByFilter(
          "sales_reports",
          [`outlet=eq.${plan.outlet}`, `begin_date=gte.${plan.begin}`, `end_date=lte.${plan.end}`, ...(keep ? [`id=not.in.(${keep})`] : [])],
          "revenue.flash.clearReports",
        );
      }
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
      const revenue = revenueRows(plan, row.id, userId, tickets ? "Reception tickets" : undefined).map((r) => ({ ...r, report_path: reportPath }));
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
        tickets
          ? `Saved ${tickets.sales.length} reception tickets (${tickets.events.length} receptions) as restaurant sales: ${money(plan.total)} over ${plan.days.length} days.`
          : `Saved ${SALES_OUTLET_LABELS[plan.outlet]} sales ${shortDate(plan.begin)} – ${shortDate(plan.end)}: ${money(plan.total)} over ${plan.days.length} days.`,
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
          <p className="font-semibold text-sm">
            {tickets ? "Reception tickets · counted as Buckley's restaurant sales" : `${SALES_OUTLET_LABELS[plan.outlet]} sales · read exactly from RecTrac`}
          </p>
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
          {exact && tickets
            ? `${tickets.sales.length} tickets for ${money(plan.total)} across ${tickets.events.length} receptions — matches every reception's total and the report's grand totals.`
            : exact
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
      {tickets && (
        <>
          {tickets.notes.map((n) => (
            <p key={n} className="text-xs text-amber-700 dark:text-amber-400">
              {n}
            </p>
          ))}
          <details className="rounded-lg border border-border/60 text-xs">
            <summary className="px-3 py-1.5 cursor-pointer font-medium">Tickets by reception ({tickets.events.length})</summary>
            <table className="w-full" aria-label="Tickets by reception">
              <thead>
                <tr className="text-muted-foreground border-t border-border/40">
                  <th className="text-left font-medium px-3 py-1">Likely reception</th>
                  <th className="text-left font-medium px-2 py-1">Ticket code</th>
                  <th className="text-right font-medium px-2 py-1">Tickets</th>
                  <th className="text-right font-medium px-3 py-1">Sales</th>
                </tr>
              </thead>
              <tbody>
                {tickets.events.map((e) => (
                  <tr key={e.ticketCode} className="border-t border-border/40">
                    <td className="px-3 py-1">Wed {shortDate(e.likelyDate)}</td>
                    <td className="px-2 py-1 text-muted-foreground tabular-nums">{e.ticketCode.replace(/^MA7009-16-166-/, "#")}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{e.tickets}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{money(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-muted-foreground border-t border-border/40">
              The report doesn&apos;t print reception dates: each is the Wednesday on or after its last ticket sale.
            </p>
          </details>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        {plan.itemDays.length} item-days ({report.sales.length} lines on the report). Each day saves as one{" "}
        {SALES_OUTLET_LABELS[plan.outlet].toLowerCase()} revenue entry; the items are kept for best sellers and prices.
      </p>

      {tickets && existing && existing.count > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {existing.count} day{existing.count === 1 ? "" : "s"} of ticket sales already saved for these dates ({money(existing.total)}) will be replaced
          by this report. Other restaurant sales stay as they are.
        </p>
      )}
      {!tickets && existing && existing.count > 0 && (
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
