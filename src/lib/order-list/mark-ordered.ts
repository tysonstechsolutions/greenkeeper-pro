/**
 * When a purchase request is submitted, flip any matching "needed" order-list
 * items to "ordered" so the order list reflects what's actually been requested.
 *
 * Matching is fuzzy and best-effort (PR line items are free text): we compare
 * the PR item description against the order item's name, and the PR part number
 * against any "Part #:" noted on the order item. Never throws — a sync failure
 * must not block saving the PR.
 */
import { directSelectList, directPatchRow } from "@/lib/supabase/rest";

const norm = (s: string | null | undefined): string =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function markOrderItemsOrderedFromPR(
  prItems: { description?: string | null; part_number?: string | null }[],
): Promise<number> {
  try {
    if (!prItems || prItems.length === 0) return 0;
    const needed = await directSelectList<{ id: string; item_name: string; notes: string | null }>(
      "order_items",
      {
        columns: "id,item_name,notes",
        filters: ["status=eq.needed"],
        label: "order.markOrderedFetch",
      },
    );
    if (!needed.length) return 0;

    const prNames = prItems.map((it) => norm(it.description)).filter((s) => s.length >= 3);
    const prParts = prItems.map((it) => norm(it.part_number)).filter((s) => s.length >= 3);
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;

    for (const oi of needed) {
      const oiName = norm(oi.item_name);
      const partMatch = (oi.notes || "").match(/part\s*#?:?\s*([^\n]+)/i);
      const oiPart = partMatch ? norm(partMatch[1]) : "";
      const byPart = oiPart.length >= 3 && prParts.includes(oiPart);
      const byName =
        oiName.length >= 3 &&
        prNames.some((n) => n === oiName || n.includes(oiName) || oiName.includes(n));
      if (byPart || byName) {
        await directPatchRow(
          "order_items",
          "id",
          oi.id,
          { status: "ordered", ordered_date: today, updated_at: new Date().toISOString() },
          "order.markOrdered",
        );
        count++;
      }
    }
    return count;
  } catch (err) {
    console.warn("[order-list] mark-ordered failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
