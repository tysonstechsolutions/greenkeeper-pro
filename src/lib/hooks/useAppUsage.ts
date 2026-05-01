"use client";

/**
 * Tracks how often the user opens each app on the More page so we can sort
 * the grid most-used-first.
 *
 * Persistence: localStorage. We don't sync this across devices because
 * usage habits are device-specific (the foreman's iPad uses different
 * apps than the super's phone).
 *
 * Storage shape:
 *   { [href: string]: { count: number; last: number } }
 *
 * Anti-rust: counts decay slightly each load so an app that was hot once
 * doesn't permanently lock the top of the grid. Implemented as
 * `count = floor(count * 0.99)` on hydration, applied at most once per
 * day to keep the math stable.
 */

import { useCallback, useEffect, useState } from "react";

interface UsageEntry {
  count: number;
  last: number; // ms epoch
}

type UsageMap = Record<string, UsageEntry>;

const STORAGE_KEY = "vmgc-app-usage";
const DECAY_KEY = "vmgc-app-usage-last-decay";
const DAY_MS = 24 * 60 * 60 * 1000;

function readUsage(): UsageMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as UsageMap) : {};
  } catch {
    return {};
  }
}

function writeUsage(u: UsageMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  } catch {
    // localStorage full or in private mode — non-fatal.
  }
}

function maybeDecay(usage: UsageMap): UsageMap {
  if (typeof window === "undefined") return usage;
  try {
    const lastDecayRaw = window.localStorage.getItem(DECAY_KEY);
    const lastDecay = lastDecayRaw ? Number(lastDecayRaw) : 0;
    if (Date.now() - lastDecay < DAY_MS) return usage;

    const decayed: UsageMap = {};
    for (const [href, entry] of Object.entries(usage)) {
      const next = Math.floor(entry.count * 0.99);
      if (next > 0) decayed[href] = { count: next, last: entry.last };
    }
    window.localStorage.setItem(DECAY_KEY, String(Date.now()));
    writeUsage(decayed);
    return decayed;
  } catch {
    return usage;
  }
}

export function useAppUsage() {
  const [usage, setUsage] = useState<UsageMap>({});

  useEffect(() => {
    const initial = maybeDecay(readUsage());
    setUsage(initial); // eslint-disable-line react-hooks/set-state-in-effect -- one-shot hydrate
  }, []);

  /** Increment the counter for an app and persist. */
  const record = useCallback((href: string) => {
    setUsage((prev) => {
      const next: UsageMap = {
        ...prev,
        [href]: {
          count: (prev[href]?.count ?? 0) + 1,
          last: Date.now(),
        },
      };
      writeUsage(next);
      return next;
    });
  }, []);

  /**
   * Sort an app list by usage count (descending), tie-break by recency,
   * then by stable position in the input array. Returns a new array.
   */
  const sortByUsage = useCallback(
    <T extends { href: string }>(items: T[]): T[] => {
      const indexed = items.map((it, i) => ({ it, i }));
      indexed.sort((a, b) => {
        const ua = usage[a.it.href];
        const ub = usage[b.it.href];
        const ca = ua?.count ?? 0;
        const cb = ub?.count ?? 0;
        if (cb !== ca) return cb - ca;
        const la = ua?.last ?? 0;
        const lb = ub?.last ?? 0;
        if (lb !== la) return lb - la;
        return a.i - b.i; // preserve original order
      });
      return indexed.map(({ it }) => it);
    },
    [usage],
  );

  return { record, sortByUsage };
}
