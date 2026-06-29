/**
 * Serialize a computed FinancialWatch into a compact, readable snapshot for the
 * AI financial analyst. This is the ONLY financial data the analyst sees — it
 * reasons over these already-computed figures and never recomputes or invents
 * its own. Keeping the snapshot small keeps the prompt cheap and on-point.
 */
import type { FinancialWatch } from "./types";
import { categoryLabel, revenueCategoryLabel } from "./labels";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pctOf(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function serializeForAdvisor(watch: FinancialWatch): string {
  const lines: string[] = [];
  const date = watch.generatedAt.slice(0, 10);
  const h = watch.headline;

  lines.push(`FINANCIAL SNAPSHOT (as of ${date})`);
  lines.push(
    `Overall: ${h.overallStatus.toUpperCase()} — ${h.criticalCount} critical, ${h.warningCount} warning.`,
  );
  if (h.netPositionYtd != null) {
    lines.push(
      `Net position YTD (revenue − operating spend): ${money(h.netPositionYtd)}.`,
    );
  }
  lines.push("");

  // Operating budget
  const o = watch.operating;
  lines.push(
    `OPERATING BUDGET (${o.calendarYear}, ${pctOf(o.elapsedFraction)} through the year)`,
  );
  lines.push(
    `Budget ${money(o.totalBudgeted)} | Spent ${money(o.totalSpent)} (${o.percentUsed}%) | Remaining ${money(o.remaining)}` +
      (o.paceRatio != null ? ` | pace ${o.paceRatio.toFixed(2)}×` : "") +
      (o.projectedSpend != null ? ` | projected ${money(o.projectedSpend)}` : ""),
  );
  if (o.unbucketedSpent > 0) {
    lines.push(`Uncategorized spend: ${money(o.unbucketedSpent)}.`);
  }
  if (o.pendingCount > 0) {
    lines.push(
      `Pending (unapproved) expenses: ${o.pendingCount} totaling ${money(o.pendingTotal)}.`,
    );
  }
  for (const c of o.byCategory.filter((c) => c.budgeted > 0 || c.spent > 0).slice(0, 12)) {
    const pace = c.paceRatio != null ? `, pace ${c.paceRatio.toFixed(2)}×` : "";
    lines.push(
      `- ${categoryLabel(c.category)}: ${money(c.spent)} / ${money(c.budgeted)} (${c.percentUsed}%, ${c.status}${pace})`,
    );
  }
  lines.push("");

  // Procurement
  const p = watch.procurement;
  lines.push(
    `PROCUREMENT — cost centers (FY${String(p.fiscalYear).slice(-2)}, ${pctOf(p.elapsedFraction)} through the fiscal year)`,
  );
  lines.push(
    `Budget ${money(p.totalBudget)} | Committed ${money(p.totalSpent)} (${p.percentUsed}%) | Pipeline ${money(p.totalPending)} | Remaining ${money(p.remaining)}` +
      (p.projectedSpend != null ? ` | projected ${money(p.projectedSpend)}` : ""),
  );
  if (p.unassignedSpent > 0) {
    lines.push(`Unassigned (no cost center): ${money(p.unassignedSpent)}.`);
  }
  for (const c of p.byCostCenter.filter((c) => c.spent > 0 || c.budget > 0).slice(0, 12)) {
    lines.push(
      `- ${c.label}: committed ${money(c.spent)} / budget ${money(c.budget)} (${c.percentUsed}%, ${c.status})`,
    );
  }
  lines.push("");

  // Revenue
  const r = watch.revenue;
  lines.push(`REVENUE (${r.calendarYear} year-to-date)`);
  const yoy =
    r.yoyChange != null
      ? `${r.yoyChange >= 0 ? "+" : ""}${Math.round(r.yoyChange * 100)}% YoY`
      : "no prior-year baseline";
  lines.push(
    `YTD ${money(r.ytdTotal)} | This month ${money(r.mtdTotal)} | ${yoy}` +
      (r.priorYtdTotal != null
        ? ` (${money(r.priorYtdTotal)} same period last year)`
        : "") +
      (r.revenuePerRound != null ? ` | ${money(r.revenuePerRound)}/round` : ""),
  );
  if (r.byCategory.length > 0) {
    const cats = r.byCategory
      .slice(0, 8)
      .map(
        (c) =>
          `${revenueCategoryLabel(c.category)} ${money(c.amount)} (${Math.round(c.share * 100)}%)`,
      )
      .join(", ");
    lines.push(`By source: ${cats}.`);
  }
  lines.push("");

  // Flags
  if (watch.flags.length === 0) {
    lines.push(
      "FLAGS: No issues — budgets, pace, and revenue all look on track.",
    );
  } else {
    lines.push("FLAGS (issues the watchdog computed, most severe first):");
    for (const f of watch.flags) {
      lines.push(
        `[${f.severity}] ${f.title} — ${f.detail}` +
          (f.action ? ` (Suggested: ${f.action})` : ""),
      );
    }
  }

  return lines.join("\n");
}
