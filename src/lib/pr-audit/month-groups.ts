/**
 * Group audited PRs by the month of their pr_date (newest month first), for the
 * builder-style dashboard list. Pure + generic so it's cheap to unit-test.
 */

export interface MonthGroup<T> {
  /** "YYYY-MM". */
  key: string;
  /** "May 2026". */
  label: string;
  audits: T[];
}

function monthKey(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "0000-00";
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "Undated";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

export function groupAuditsByMonth<T extends { pr_date: string }>(
  audits: readonly T[],
): MonthGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const a of audits) {
    const k = monthKey(a.pr_date);
    const list = byKey.get(k);
    if (list) list.push(a);
    else byKey.set(k, [a]);
  }
  return Array.from(byKey.keys())
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest month first
    .map((key) => ({ key, label: monthLabel(key), audits: byKey.get(key) as T[] }));
}
