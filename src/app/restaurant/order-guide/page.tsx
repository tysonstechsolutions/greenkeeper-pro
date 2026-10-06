"use client";

// Buckley's order guide: what it usually buys from US Foods (from imported
// invoices), with the usual amount filled in. Adjust the amounts, then copy
// the list for the US Foods site or start a purchase request with it.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ClipboardCopy, FileText, Loader2, Minus, Plus, Search } from "lucide-react";
import { MANAGEMENT_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { directSelectAll } from "@/lib/supabase/rest";
import { addDaysLocal, todayLocal } from "@/lib/utils/date";
import { US_FOODS } from "@/lib/restaurant/import";
import {
  buildOrderGuide,
  orderText,
  orderToPrItems,
  orderTotal,
  savePrPrefill,
  type GuideItem,
  type GuideSourceLine,
  type OrderPick,
} from "@/lib/restaurant/order-guide";

/** Orders this far back shape the guide. */
const LOOKBACK_DAYS = 180;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface LineRow {
  purchase_id: string;
  product_number: string;
  description: string;
  brand: string | null;
  pack_size: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  category: string;
  restaurant_purchases: { purchase_date: string; kind: "invoice" | "credit" | null } | null;
}

function OrderGuideContent() {
  const router = useRouter();
  const [guide, setGuide] = useState<GuideItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = addDaysLocal(todayLocal(), -LOOKBACK_DAYS);
      const rows = await directSelectAll<LineRow>("restaurant_purchase_lines", {
        columns:
          "purchase_id,product_number,description,brand,pack_size,qty,unit,unit_price,category,restaurant_purchases!inner(purchase_date,kind)",
        filters: [`restaurant_purchases.purchase_date=gte.${since}`],
        orderBy: [{ column: "id" }],
        label: "orderGuide.lines",
      });
      const lines: GuideSourceLine[] = rows
        .filter((r) => r.restaurant_purchases)
        .map((r) => ({
          purchase_id: r.purchase_id,
          purchase_date: r.restaurant_purchases!.purchase_date,
          kind: r.restaurant_purchases!.kind === "credit" ? "credit" : "invoice",
          product_number: r.product_number,
          description: r.description,
          brand: r.brand,
          pack_size: r.pack_size,
          qty: Number(r.qty),
          unit: r.unit,
          unit_price: Number(r.unit_price),
          category: r.category,
        }));
      setGuide(buildOrderGuide(lines));
      setQty({});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /restaurant_purchase_lines|does not exist|schema cache/i.test(msg)
          ? "The order guide needs the database update (20261006120000_operations_upgrade.sql) and some imported invoices."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const picks: OrderPick[] = useMemo(
    () => guide.filter((g) => (qty[g.product_number] ?? 0) > 0).map((g) => ({ item: g, qty: qty[g.product_number] })),
    [guide, qty],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guide;
    return guide.filter(
      (g) => g.description.toLowerCase().includes(q) || g.product_number.includes(q) || (g.brand ?? "").toLowerCase().includes(q),
    );
  }, [guide, query]);

  const setItemQty = (pn: string, n: number) => setQty((m) => ({ ...m, [pn]: Math.max(0, Math.min(999, Math.round(n))) }));

  const fillUsual = () => {
    const next: Record<string, number> = {};
    // "Usual" = things bought on more than one order.
    for (const g of guide) if (g.timesOrdered > 1) next[g.product_number] = g.usualQty;
    setQty(next);
    setNotice(`Filled the usual amounts for ${Object.keys(next).length} regular items.`);
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(orderText(picks));
      setNotice("Order list copied.");
    } catch {
      setError("Couldn't copy. Select the list and copy it by hand.");
    }
  };

  const startPr = () => {
    savePrPrefill({
      vendorName: US_FOODS,
      items: orderToPrItems(picks),
      justification: "Buckley's food and beverage resale stock and kitchen supplies, from the US Foods order guide.",
    });
    router.push("/purchase-requests/new/?prefill=1");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}

      {!error && guide.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No US Foods items yet.{" "}
          <Link href="/restaurant/purchases/" className="underline font-medium">
            Import your invoices
          </Link>{" "}
          and the guide fills itself in.
        </p>
      )}

      {guide.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={fillUsual}
              className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
            >
              Fill usual amounts
            </button>
            <button
              onClick={() => setQty({})}
              disabled={picks.length === 0}
              className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an item"
              aria-label="Find an item"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm"
            />
          </div>

          <div className="gk-card divide-y divide-border/50">
            {shown.map((g) => {
              const n = qty[g.product_number] ?? 0;
              return (
                <div key={g.product_number} className={`flex items-center gap-3 px-3 py-2 text-sm ${n > 0 ? "bg-primary/5" : ""}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{g.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {[g.brand, g.pack_size].filter(Boolean).join(" · ")} · {money(g.lastPrice)}/{g.unit} · ordered{" "}
                      {g.timesOrdered}× (usually {g.usualQty}) · last {g.lastOrdered}
                      {g.category !== "food" ? ` · ${g.category}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setItemQty(g.product_number, n - 1)}
                      disabled={n === 0}
                      aria-label={`Less ${g.description}`}
                      className="p-1.5 rounded border border-border disabled:opacity-40"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={n || ""}
                      placeholder="0"
                      onChange={(e) => setItemQty(g.product_number, Number(e.target.value) || 0)}
                      aria-label={`How many ${g.description}`}
                      className="w-12 text-center rounded border border-input bg-background py-1 tabular-nums"
                    />
                    <button
                      onClick={() => setItemQty(g.product_number, n + 1)}
                      aria-label={`More ${g.description}`}
                      className="p-1.5 rounded border border-border"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-20 md:bottom-4 gk-card p-3 flex flex-wrap items-center gap-2 shadow-lg">
            <span className="flex-1 min-w-0 text-sm">
              <span className="font-semibold">{picks.length} items</span>
              <span className="text-muted-foreground"> · about {money(orderTotal(picks))} at last prices</span>
            </span>
            <button
              onClick={copyList}
              disabled={picks.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <ClipboardCopy className="w-4 h-4" />
              Copy list
            </button>
            <button
              onClick={startPr}
              disabled={picks.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Start a PR
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The PR comes filled with US Foods, every item, and the Buckley&apos;s codes (site 7011, cost center 20091,
            G/L 151110 food / 151120 alcohol / supplies by type). Check it before you submit.
          </p>
        </>
      )}
    </div>
  );
}

export default function OrderGuidePage() {
  return (
    <RoleGuard allowedRoles={withFbManager(MANAGEMENT_ROLES)}>
      <div className="gk-page mx-auto pb-24">
        <h1 className="mb-1">Order Guide</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Buckley&apos;s usual US Foods items, from the invoices you&apos;ve imported. Most-ordered first.
        </p>
        <OrderGuideContent />
      </div>
    </RoleGuard>
  );
}
