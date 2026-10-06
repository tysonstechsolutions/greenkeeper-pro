"use client";

// One US Foods invoice's items: how it's coded (cost center + G/L totals for
// the paperwork) and each line marked Restaurant or Bar. Used in the import
// preview and on saved purchases.

import { Wine, UtensilsCrossed, Package } from "lucide-react";
import { codingSummary, OUTLET_LABELS, type Outlet } from "@/lib/restaurant/coding";

export interface InvoiceLineView {
  key: string;
  description: string;
  brand: string | null;
  pack_size: string | null;
  qty: number;
  extended: number;
  category: string;
  outlet: Outlet;
  cost_ctr: string | null;
  gl_acct: string | null;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Cost center + G/L totals for writing up the invoice. */
export function CodingTable({ lines, total }: { lines: InvoiceLineView[]; total?: number }) {
  const rows = codingSummary(lines, total);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Charge to</p>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.cost_ctr}-${r.gl_acct}`}>
              <td className="py-0.5 pr-2">{r.label}</td>
              <td className="py-0.5 text-right tabular-nums font-medium">{money(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Outlet switch for a line: alcohol is always Bar, supplies aren't COGS. */
function OutletSwitch({
  line,
  disabled,
  onChange,
}: {
  line: InvoiceLineView;
  disabled?: boolean;
  onChange?: (outlet: Outlet) => void;
}) {
  if (line.category === "supplies") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Package className="w-3 h-3" /> Supplies
      </span>
    );
  }
  if (line.category === "alcohol" || !onChange) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium">
        {line.outlet === "bar" ? <Wine className="w-3 h-3" /> : <UtensilsCrossed className="w-3 h-3" />}
        {OUTLET_LABELS[line.outlet]}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-border overflow-hidden text-[11px]" role="group" aria-label={`${line.description} goes to`}>
      {(["restaurant", "bar"] as const).map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          aria-pressed={line.outlet === o}
          onClick={() => line.outlet !== o && onChange(o)}
          className={`px-1.5 py-0.5 ${line.outlet === o ? "bg-primary text-primary-foreground" : "hover:bg-muted"} disabled:opacity-50`}
        >
          {OUTLET_LABELS[o]}
        </button>
      ))}
    </span>
  );
}

export function InvoiceLines({
  lines,
  total,
  disabled,
  onOutlet,
}: {
  lines: InvoiceLineView[];
  total?: number;
  disabled?: boolean;
  onOutlet?: (key: string, outlet: Outlet) => void;
}) {
  return (
    <div className="space-y-2">
      <CodingTable lines={lines} total={total} />
      <table className="w-full text-xs">
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t border-border/40 align-top">
              <td className="py-1 pr-2 tabular-nums text-muted-foreground">{Number(l.qty)}</td>
              <td className="py-1 pr-2">
                {l.description}
                <span className="text-muted-foreground">
                  {[l.brand, l.pack_size].filter(Boolean).length ? ` · ${[l.brand, l.pack_size].filter(Boolean).join(" · ")}` : ""}
                  {l.gl_acct ? ` · ${l.cost_ctr ?? ""}/${l.gl_acct}` : ""}
                </span>
              </td>
              <td className="py-1 pr-2 whitespace-nowrap">
                <OutletSwitch line={l} disabled={disabled} onChange={onOutlet ? (o) => onOutlet(l.key, o) : undefined} />
              </td>
              <td className="py-1 text-right tabular-nums">{money(Number(l.extended))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
