"use client";

// Hand-count inventory (Operation Blueprint Phase 4) — the monthly count the
// obligations nag about, turned into a tap-to-count sheet:
//   • keep a per-area item catalog with optional par levels
//   • start a count, type quantities, finish
//   • finishing shows variance vs the last count, flags below-par items for
//     the order list, and checks off the month's count obligation on Today
// Deterministic client math; every write goes through the direct REST layer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Loader2,
  Plus,
  ShoppingCart,
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
} from "@/lib/supabase/rest";
import { periodKey } from "@/lib/operations/engine";

type Area = "restaurant" | "pro_shop";

interface InventoryItem {
  id: string;
  area: Area;
  name: string;
  unit: string | null;
  par_level: number | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

interface InventoryCount {
  id: string;
  area: Area;
  count_date: string;
  status: "in_progress" | "completed";
  completed_at: string | null;
  notes: string | null;
}

interface CountLine {
  id: string;
  count_id: string;
  item_id: string;
  qty: number;
}

const OBLIGATION_SLUG: Record<Area, string> = {
  restaurant: "restaurant-inventory",
  pro_shop: "pro-shop-inventory",
};

export function InventoryCountPage({ area, title }: { area: Area; title: string }) {
  const { profile, user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [activeCount, setActiveCount] = useState<InventoryCount | null>(null);
  const [lines, setLines] = useState<Map<string, CountLine>>(new Map());
  const [prevLines, setPrevLines] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-item form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newPar, setNewPar] = useState("");

  const savingLines = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [itemRows, countRows] = await Promise.all([
        directSelectList<InventoryItem>("inventory_items", {
          columns: "*",
          filters: [`area=eq.${area}`, "is_active=eq.true"],
          orderBy: [{ column: "sort_order" }, { column: "name" }],
          limit: 500,
          label: "inventory.items",
        }),
        directSelectList<InventoryCount>("inventory_counts", {
          columns: "*",
          filters: [`area=eq.${area}`],
          orderBy: [{ column: "count_date", ascending: false }, { column: "created_at", ascending: false }],
          limit: 24,
          label: "inventory.counts",
        }),
      ]);
      setItems(itemRows);
      setCounts(countRows);

      // Resume an in-progress count if one exists.
      const open = countRows.find((c) => c.status === "in_progress") ?? null;
      setActiveCount(open);
      if (open) {
        const lineRows = await directSelectList<CountLine>("inventory_count_lines", {
          columns: "*",
          filters: [`count_id=eq.${open.id}`],
          limit: 1000,
          label: "inventory.lines",
        });
        setLines(new Map(lineRows.map((l) => [l.item_id, l])));
      } else {
        setLines(new Map());
      }

      // Previous completed count → variance baseline.
      const lastDone = countRows.find((c) => c.status === "completed");
      if (lastDone) {
        const prev = await directSelectList<CountLine>("inventory_count_lines", {
          columns: "*",
          filters: [`count_id=eq.${lastDone.id}`],
          limit: 1000,
          label: "inventory.prevLines",
        });
        setPrevLines(new Map(prev.map((l) => [l.item_id, Number(l.qty)])));
      } else {
        setPrevLines(new Map());
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [area]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Item catalog ──────────────────────────────────────────────────────────

  const addItem = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const par = parseFloat(newPar);
      const row = await directInsertRow<InventoryItem>(
        "inventory_items",
        {
          area,
          name,
          unit: newUnit.trim() || null,
          par_level: Number.isFinite(par) ? par : null,
          sort_order: items.length + 1,
        },
        "inventory.addItem",
      );
      setItems((prev) => [...prev, row]);
      setNewName("");
      setNewUnit("");
      setNewPar("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const retireItem = async (item: InventoryItem) => {
    if (!window.confirm(`Remove "${item.name}" from the count sheet? Past counts keep it.`)) return;
    try {
      await directPatchRow("inventory_items", "id", item.id, { is_active: false }, "inventory.retire");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Counting ──────────────────────────────────────────────────────────────

  const startCount = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const row = await directInsertRow<InventoryCount>(
        "inventory_counts",
        { area },
        "inventory.startCount",
      );
      setActiveCount(row);
      setLines(new Map());
      setCounts((prev) => [row, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelCount = async () => {
    if (!activeCount) return;
    if (!window.confirm("Throw away this count? Entered quantities are deleted.")) return;
    try {
      await directDeleteRow("inventory_counts", "id", activeCount.id, "inventory.cancelCount");
      setCounts((prev) => prev.filter((c) => c.id !== activeCount.id));
      setActiveCount(null);
      setLines(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveQty = async (item: InventoryItem, raw: string) => {
    if (!activeCount) return;
    const qty = parseFloat(raw);
    if (raw.trim() === "" || !Number.isFinite(qty) || qty < 0) return;
    if (savingLines.current.has(item.id)) return;
    savingLines.current.add(item.id);
    try {
      const existing = lines.get(item.id);
      if (existing) {
        await directPatchRow("inventory_count_lines", "id", existing.id, { qty }, "inventory.saveLine");
        setLines((prev) => new Map(prev).set(item.id, { ...existing, qty }));
      } else {
        const row = await directInsertRow<CountLine>(
          "inventory_count_lines",
          { count_id: activeCount.id, item_id: item.id, qty },
          "inventory.saveLine",
        );
        setLines((prev) => new Map(prev).set(item.id, row));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      savingLines.current.delete(item.id);
    }
  };

  const finishCount = async () => {
    if (!activeCount || busy) return;
    if (lines.size === 0) {
      setError("Enter at least one quantity before finishing.");
      return;
    }
    setBusy(true);
    try {
      await directPatchRow(
        "inventory_counts",
        "id",
        activeCount.id,
        {
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: profile?.id ?? null,
        },
        "inventory.finish",
      );

      // Check off this month's count obligation on Today (undoable there).
      let obligationNote = "";
      try {
        const obs = await directSelectList<{ id: string; cadence: string }>("obligations", {
          columns: "id,cadence",
          filters: [`slug=eq.${OBLIGATION_SLUG[area]}`],
          limit: 1,
          label: "inventory.obligation",
        });
        if (obs[0]) {
          await directInsertRow(
            "obligation_completions",
            {
              obligation_id: obs[0].id,
              period: periodKey(obs[0].cadence as "monthly", new Date()),
              completed_by: profile?.id ?? null,
              note: "Completed via inventory count",
            },
            "inventory.completeObligation",
          );
          obligationNote = " This month's count obligation is checked off.";
        }
      } catch {
        // Already completed this period (unique constraint) or unavailable —
        // either way the count itself succeeded.
      }

      setNotice(`Count saved — ${lines.size} item${lines.size === 1 ? "" : "s"} counted.${obligationNote}`);
      setActiveCount(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Below-par → order list ────────────────────────────────────────────────

  const belowPar = useMemo(() => {
    const out: { item: InventoryItem; qty: number }[] = [];
    for (const item of items) {
      const line = lines.get(item.id);
      if (line && item.par_level != null && Number(line.qty) < Number(item.par_level)) {
        out.push({ item, qty: Number(line.qty) });
      }
    }
    return out;
  }, [items, lines]);

  const [orderedIds, setOrderedIds] = useState<Set<string>>(new Set());
  const addToOrderList = async (item: InventoryItem, qty: number) => {
    if (!user?.id || orderedIds.has(item.id)) return;
    try {
      await directInsertRow(
        "order_items",
        {
          created_by: user.id,
          category: "general",
          item_name: item.name,
          description: `Inventory count: ${qty}${item.unit ? ` ${item.unit}` : ""} on hand, par ${item.par_level}`,
          quantity: item.par_level != null ? String(Math.max(1, Math.ceil(Number(item.par_level) - qty))) : null,
          priority: "normal",
        },
        "inventory.orderItem",
      );
      setOrderedIds((prev) => new Set(prev).add(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const counting = activeCount != null;
  const completedCounts = counts.filter((c) => c.status === "completed");

  return (
    <div className="gk-page mx-auto">
      <h1 className="mb-1">{title}</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {counting
          ? `Counting — started ${activeCount!.count_date}. Type what's on hand; it saves as you go.`
          : "Monthly hand-count. Keep the item list current, then start a count."}
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {!counting ? (
              <button
                onClick={startCount}
                disabled={busy || items.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                <ClipboardList className="w-4 h-4" />
                Start count
              </button>
            ) : (
              <>
                <button
                  onClick={finishCount}
                  disabled={busy || lines.size === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Finish count ({lines.size}/{items.length})
                </button>
                <button
                  onClick={cancelCount}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                  Discard
                </button>
              </>
            )}
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add item
            </button>
          </div>

          {/* Add item form */}
          {showAdd && (
            <div className="gk-card p-3 mb-5 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Item</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Hot dog buns / Callaway Warbird"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Unit</label>
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="case"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Par</label>
                <input
                  value={newPar}
                  onChange={(e) => setNewPar(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  placeholder="—"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!newName.trim() || busy}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}

          {/* Below-par strip (while counting) */}
          {counting && belowPar.length > 0 && (
            <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs font-semibold text-warning-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Below par — needs reordering
              </p>
              <div className="space-y-1.5">
                {belowPar.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {item.name} — {qty}
                      {item.unit ? ` ${item.unit}` : ""} on hand (par {item.par_level})
                    </span>
                    <button
                      onClick={() => addToOrderList(item, qty)}
                      disabled={orderedIds.has(item.id)}
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg shrink-0 transition-colors",
                        orderedIds.has(item.id)
                          ? "text-success"
                          : "bg-card border border-border hover:bg-muted",
                      )}
                    >
                      {orderedIds.has(item.id) ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> On order list
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-3.5 h-3.5" /> Add to order list
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          {items.length === 0 ? (
            <div className="gk-card p-6 text-center text-sm text-muted-foreground">
              No items yet — add what you count each month (food & supplies, or shirts,
              balls, tees...). The list is reused every count.
            </div>
          ) : (
            <div className="gk-card divide-y divide-border/50">
              {items.map((item) => {
                const line = lines.get(item.id);
                const prev = prevLines.get(item.id);
                const below =
                  line != null &&
                  item.par_level != null &&
                  Number(line.qty) < Number(item.par_level);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.unit ? `${item.unit} · ` : ""}
                        {item.par_level != null ? `par ${item.par_level}` : "no par set"}
                        {prev != null ? ` · last count ${prev}` : ""}
                      </p>
                    </div>
                    {counting ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        defaultValue={line ? String(line.qty) : ""}
                        placeholder="qty"
                        onBlur={(e) => saveQty(item, e.target.value)}
                        className={cn(
                          "w-24 rounded-lg border bg-background px-3 py-2 text-sm text-right tabular-nums",
                          below ? "border-warning" : "border-border",
                        )}
                      />
                    ) : (
                      <button
                        onClick={() => retireItem(item)}
                        aria-label={`Remove ${item.name}`}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* History */}
          {completedCounts.length > 0 && (
            <div className="mt-6">
              <p className="gk-section-label mb-2">Past counts</p>
              <div className="gk-card divide-y divide-border/50">
                {completedCounts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{c.count_date}</span>
                    <span className="text-xs text-muted-foreground">
                      completed{c.completed_at ? ` ${new Date(c.completed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
