"use client";

// What was sold on one day of a RecTrac sales report: every item, how many,
// and for how much, biggest seller first. Opens under a revenue entry.

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { directSelectList } from "@/lib/supabase/rest";

export interface SaleItemDay {
  inventory_code: string | null;
  description: string;
  qty: number;
  gross: number;
  discount: number;
  net: number;
}

export interface SoldItem {
  description: string;
  qty: number;
  discount: number;
  net: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row per item (same name and code added together), biggest sales first. */
export function soldItems(rows: SaleItemDay[]): SoldItem[] {
  const map = new Map<string, SoldItem>();
  for (const r of rows) {
    const key = `${r.inventory_code ?? ""}|${r.description.trim().toUpperCase()}`;
    const it = map.get(key) ?? { description: r.description.trim(), qty: 0, discount: 0, net: 0 };
    it.qty += Number(r.qty);
    it.discount += Number(r.discount);
    it.net += Number(r.net);
    map.set(key, it);
  }
  return [...map.values()]
    .map((i) => ({ ...i, qty: r2(i.qty), discount: r2(i.discount), net: r2(i.net) }))
    .filter((i) => i.qty !== 0 || i.net !== 0)
    .sort((a, b) => b.net - a.net || b.qty - a.qty || a.description.localeCompare(b.description));
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function SaleDayItems({ reportId, date, entryAmount }: { reportId: string; date: string; entryAmount: number }) {
  const [items, setItems] = useState<SoldItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    directSelectList<SaleItemDay>("sales_item_days", {
      columns: "inventory_code,description,qty,gross,discount,net",
      filters: [`report_id=eq.${reportId}`, `sale_date=eq.${date}`],
      limit: 2000,
      label: "revenue.saleDayItems",
    })
      .then((rows) => alive && setItems(soldItems(rows)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [reportId, date]);

  if (error) {
    return (
      <p className="text-xs text-destructive flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t load the items: {error}
      </p>
    );
  }
  if (!items) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading what was sold…
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No item detail saved for this day.</p>;
  }

  const total = r2(items.reduce((s, i) => s + i.net, 0));
  const count = r2(items.reduce((s, i) => s + i.qty, 0));
  const discounts = r2(items.reduce((s, i) => s + i.discount, 0));
  return (
    <div aria-label="Items sold">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium py-1">Item</th>
            <th className="text-right font-medium py-1 w-12">Qty</th>
            <th className="text-right font-medium py-1 w-20">Sales</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={`${idx}-${i.description}`} className="border-t border-border/40">
              <td className="py-1 pr-2">
                {i.description}
                {i.discount !== 0 && <span className="text-muted-foreground"> · {money(i.discount)} off</span>}
              </td>
              <td className={`py-1 text-right tabular-nums ${i.qty < 0 ? "text-destructive" : ""}`}>{i.qty}</td>
              <td className={`py-1 text-right tabular-nums ${i.net < 0 ? "text-destructive" : ""}`}>{money(i.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="py-1">
              {items.length} different item{items.length === 1 ? "" : "s"}
              {discounts !== 0 && <span className="font-normal text-muted-foreground"> · {money(discounts)} in discounts</span>}
            </td>
            <td className="py-1 text-right tabular-nums">{count}</td>
            <td className="py-1 text-right tabular-nums">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
      {Math.abs(total - entryAmount) > 0.005 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
          The items add to {money(total)} but this entry is {money(entryAmount)}. The entry may have been changed by hand.
        </p>
      )}
    </div>
  );
}
