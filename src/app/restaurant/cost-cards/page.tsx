"use client";

// Cost cards: what each Buckley's menu item costs to plate, ingredient by
// ingredient, at the latest US Foods invoice price, against the 35% standard,
// with its build sheet. Open any item for its card; print for the line.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, Printer } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { COST_CARDS, priceCard, type LatestPrice, type PricedCard } from "@/lib/restaurant/cost-cards";
import { loadCardPrices } from "@/lib/restaurant/load-card-prices";

const STANDARD = 0.35;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Card({ p }: { p: PricedCard }) {
  return (
    <div className="px-3 pb-4 pt-1 space-y-3 bg-muted/30">
      <table className="w-full text-sm" aria-label={`${p.card.name} ingredients`}>
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            <th className="text-left font-medium py-1.5">Ingredient</th>
            <th className="text-left font-medium px-2">Portion</th>
            <th className="text-left font-medium px-2">Bought as</th>
            <th className="text-left font-medium px-2">Price from</th>
            <th className="text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.key} className="border-b border-border/40">
              <td className="py-1">{l.label}</td>
              <td className="px-2 tabular-nums">
                {l.qty} {l.unit}
              </td>
              <td className="px-2 text-muted-foreground">{l.purchase}</td>
              <td className="px-2 text-muted-foreground">
                {l.source === "invoice" && l.priceDate ? `Invoice ${shortDate(l.priceDate)}` : l.unitDiffers ? "Card (invoice unit differs)" : "Card"}
              </td>
              <td className="text-right tabular-nums">{money(l.cost)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">Plate cost</td>
            <td colSpan={3} />
            <td className="text-right tabular-nums">{money(p.cost)}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Build</p>
        <ol className="list-decimal pl-5 text-sm space-y-0.5">
          {p.card.build.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CostCardsContent() {
  const [prices, setPrices] = useState<Map<string, LatestPrice> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    loadCardPrices()
      .catch(() => new Map<string, LatestPrice>())
      .then((m) => live && setPrices(m));
    return () => {
      live = false;
    };
  }, []);

  const priced = useMemo(() => (prices ? COST_CARDS.map((c) => priceCard(c, prices, STANDARD)) : []), [prices]);

  if (!prices) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const fromInvoices = priced.flatMap((p) => p.lines).filter((l) => l.source === "invoice").length;
  const over = priced.filter((p) => p.costPct > STANDARD * 100);
  const toggle = (name: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {over.length === 0
          ? "Every item is at or under the 35% standard at its card's portions."
          : `${over.length} item${over.length === 1 ? " is" : "s are"} over the 35% standard: ${over.map((p) => p.card.name).join(", ")}.`}
      </p>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-pressed={all}
          className={`px-3 py-1.5 rounded-full border text-sm ${all ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
        >
          {all ? "Hide every card" : "Show every card"}
        </button>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>
      <div className="gk-card overflow-x-auto">
        <table className="w-full text-sm" aria-label="Cost cards">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-3 py-2">Item</th>
              <th className="text-right font-medium px-2 py-2">Menu price</th>
              <th className="text-right font-medium px-2 py-2">Plate cost</th>
              <th className="text-right font-medium px-2 py-2">Cost %</th>
              <th className="text-right font-medium px-3 py-2">Price at 35%</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((p) => {
              const isOpen = all || open.has(p.card.name);
              const overStd = p.costPct > STANDARD * 100;
              return [
                <tr key={p.card.name} className="border-b border-border/40 cursor-pointer hover:bg-muted/40" onClick={() => toggle(p.card.name)}>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 print:hidden" /> : <ChevronRight className="w-3.5 h-3.5 print:hidden" />}
                      <span>{p.card.name}</span>
                      {p.card.estimated && <span className="text-[11px] text-muted-foreground ml-1">(estimated portions)</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(p.card.menuPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(p.cost)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${overStd ? "text-red-700 dark:text-red-400 font-semibold" : ""}`}>{p.costPct.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(p.priceAtStandard)}</td>
                </tr>,
                isOpen && (
                  <tr key={`${p.card.name}-card`} className="border-b border-border/40">
                    <td colSpan={5} className="p-0">
                      <Card p={p} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Costs use the latest US Foods invoice for each product ({fromInvoices} ingredient prices from invoices on file); anything without an invoice
        yet uses the price on the card (September 2026). &ldquo;Price at 35%&rdquo; is the lowest price that meets the standard. Items marked
        estimated have no agreed build yet. Upload invoices on <Link href="/restaurant/purchases/" className="underline">Purchases</Link>.
      </p>
    </div>
  );
}

export default function CostCardsPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="gk-page mx-auto">
        <h1 className="mb-1">Cost Cards</h1>
        <p className="text-sm text-muted-foreground mb-5">What every menu item costs to plate, at today&apos;s US Foods prices, and how to build it.</p>
        <CostCardsContent />
      </div>
    </RoleGuard>
  );
}
