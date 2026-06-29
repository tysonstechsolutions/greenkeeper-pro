import { AlertTriangle, AlertCircle, Info, type LucideIcon } from "lucide-react";
import type { Severity, OverallStatus, Flag } from "@/lib/financial-watch/types";

export interface SeverityStyle {
  icon: LucideIcon;
  /** Text color for the icon / accent. */
  text: string;
  /** Soft background tint for chips/cards. */
  bg: string;
  border: string;
  label: string;
}

export const SEVERITY_STYLE: Record<Severity, SeverityStyle> = {
  critical: {
    icon: AlertTriangle,
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    label: "Critical",
  },
  warning: {
    icon: AlertCircle,
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Warning",
  },
  info: {
    icon: Info,
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    label: "Heads-up",
  },
};

export interface StatusStyle {
  text: string;
  bg: string;
  border: string;
  label: string;
}

export const STATUS_STYLE: Record<OverallStatus, StatusStyle> = {
  alert: {
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    label: "Needs attention",
  },
  watch: {
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    label: "Watch",
  },
  ok: {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    label: "On track",
  },
};

/**
 * Where to go to fix a flag — turns each flag's suggestion into a one-tap link
 * to the page that resolves it. Kept in the UI layer so the engine stays pure
 * of routing. Returns undefined when there's no single obvious destination.
 */
export function flagHref(flag: Flag): string | undefined {
  const id = flag.id;
  if (id.startsWith("operating:no-budget")) return "/budget/setup";
  if (
    id.startsWith("operating:unbucketed") ||
    id.startsWith("operating:duplicate") ||
    id.startsWith("operating:negative-amount")
  )
    return "/budget/expenses";
  if (flag.lens === "operating") return "/budget";
  if (id.startsWith("procurement:no-budgets")) return "/pr-audit/budget";
  if (flag.lens === "procurement") return "/pr-audit";
  if (flag.lens === "revenue") return "/revenue";
  return undefined;
}

/** Compact USD, no cents. */
export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Signed percent from a fraction, e.g. -0.18 → "−18%". */
export function formatSignedPct(fraction: number): string {
  const rounded = Math.round(fraction * 100);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)}%`;
}
