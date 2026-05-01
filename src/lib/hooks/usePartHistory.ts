"use client";

/**
 * Part-number history. Pulls every line item from past purchase_requests
 * and de-dupes by `part_number || description` so the user can re-order
 * something they bought before without retyping the description, qty,
 * unit, and last vendor price.
 *
 * Why client-side aggregation: items live in a JSONB column, querying
 * inside JSONB isn't pleasant from PostgREST. Volume is small (the user
 * said they're at PR ~30) so flattening client-side is fine. Move to a
 * materialized view if PR count gets into the thousands.
 *
 * Suggestions are scored by:
 *   1. recency (more recent = higher)
 *   2. frequency (more uses = higher)
 *   3. text-match strength against the query (prefix > substring)
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database";

export interface PartHistoryEntry {
  /** Dedup key — part_number normalized, or lowercased description if no PN. */
  key: string;
  /** Most-recent description seen for this key. */
  description: string;
  /** Most-recent part number seen for this key (might be empty). */
  part_number: string;
  /** Most-recent unit ("ea", "case", etc). */
  unit: string;
  /** Most-recent unit price. */
  unit_price: number;
  /** Most-recent typical quantity. */
  qty: number;
  /** Most-recent vendor name. */
  vendor: string | null;
  /** Number of times we've ordered this. */
  count: number;
  /** Last date_prepared we saw this on (ISO). */
  last_used: string;
}

function normalizeKey(item: { part_number?: string; description?: string }): string {
  const pn = (item.part_number || "").trim();
  if (pn) return `pn:${pn.toLowerCase()}`;
  return `desc:${(item.description || "").trim().toLowerCase()}`;
}

export function usePartHistory() {
  const [entries, setEntries] = useState<PartHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Single fetch on mount; volume is low so we don't paginate.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("purchase_requests")
          .select(
            "id, date_prepared, items, vendor1_name",
          )
          .order("date_prepared", { ascending: false });
        if (cancelled) return;
        if (error || !data) {
          setEntries([]);
          setLoading(false);
          return;
        }

        const map = new Map<string, PartHistoryEntry>();
        for (const row of data as Array<
          Pick<PurchaseRequest, "id" | "date_prepared" | "items" | "vendor1_name">
        >) {
          const items = (row.items as PurchaseRequestItem[] | null) || [];
          for (const it of items) {
            if (!it) continue;
            const desc = (it.description || "").trim();
            const pn = (it.part_number || "").trim();
            if (!desc && !pn) continue; // skip blanks
            const key = normalizeKey({ description: desc, part_number: pn });
            const existing = map.get(key);
            if (existing) {
              existing.count += 1;
              // Keep most-recent values (we walked rows desc by date).
              // Don't overwrite — first hit wins (most recent).
            } else {
              map.set(key, {
                key,
                description: desc,
                part_number: pn,
                unit: it.unit || "",
                unit_price: Number(it.unit_price) || 0,
                qty: Number(it.qty) || 1,
                vendor: row.vendor1_name || null,
                count: 1,
                last_used: row.date_prepared,
              });
            }
          }
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate
        setEntries(Array.from(map.values()));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate
        setLoading(false);
      } catch {
        if (!cancelled) {
          setEntries([]);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Search the history. Empty query returns the top N most-recent items.
   * Returns at most `limit` matches sorted by score descending.
   */
  const search = useCallback(
    (query: string, limit = 8): PartHistoryEntry[] => {
      const q = query.trim().toLowerCase();
      if (!q) {
        // Most-recent first when no query.
        return [...entries]
          .sort((a, b) => b.last_used.localeCompare(a.last_used))
          .slice(0, limit);
      }
      type Scored = { entry: PartHistoryEntry; score: number };
      const scored: Scored[] = [];
      for (const e of entries) {
        const haystack = `${e.description} ${e.part_number}`.toLowerCase();
        if (!haystack.includes(q)) continue;
        let score = 0;
        if (e.part_number.toLowerCase().startsWith(q)) score += 100;
        else if (e.part_number.toLowerCase().includes(q)) score += 50;
        if (e.description.toLowerCase().startsWith(q)) score += 80;
        else if (e.description.toLowerCase().includes(q)) score += 40;
        score += e.count * 5;
        // Recency: parse the date once.
        const lu = new Date(e.last_used).getTime();
        if (!Number.isNaN(lu)) {
          const daysAgo = Math.max(
            0,
            Math.floor((Date.now() - lu) / (1000 * 60 * 60 * 24)),
          );
          score += Math.max(0, 30 - daysAgo); // boost recent
        }
        scored.push({ entry: e, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((s) => s.entry);
    },
    [entries],
  );

  const stats = useMemo(
    () => ({
      total: entries.length,
      loading,
    }),
    [entries.length, loading],
  );

  return { entries, search, ...stats };
}
