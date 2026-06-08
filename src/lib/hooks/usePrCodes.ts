/**
 * Loads the PR Audit code lists (Sites / Cost Centers / G/L Accounts) and their
 * categories from the database, with a built-in fallback so the app keeps
 * working before the `pr_codes` / `pr_categories` tables exist (or if the fetch
 * fails). Consumers get ready-to-use dropdown options (grouped by category),
 * the valid-code sets for the audit, and the seed list for the budget rollup.
 *
 * Only ACTIVE codes are returned — the Manage Lists page does its own fetch
 * (including hidden codes) for editing.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { directSelectList } from "@/lib/supabase/rest";
import type { PrCategory, PrCode, PrCodeKind } from "@/types/database";
import {
  PR_SITES,
  PR_COST_CENTERS,
  PR_GL_ACCOUNTS,
} from "@/lib/pr-accounting-codes";
import type { ValidCodes } from "@/lib/pr-audit/audit";
import type { RollupCostCenter } from "@/lib/pr-audit/rollup";

export interface PrCodeOption {
  value: string; // the code (for <option value>)
  code: string;
  /** Display label, e.g. "25581 — GLK VMGC GC MAINTENANCE" or "7009". */
  label: string;
  /** Just the descriptive part (no code prefix). */
  rawLabel: string;
  category: string | null;
  categoryId: string | null;
  description: string | null;
  examples: string | null;
}

export interface UsePrCodesResult {
  loading: boolean;
  usingFallback: boolean;
  categories: PrCategory[];
  sites: PrCodeOption[];
  costCenters: PrCodeOption[];
  glAccounts: PrCodeOption[];
  validCodes: ValidCodes;
  rollupCostCenters: RollupCostCenter[];
  labelFor: (kind: PrCodeKind, code: string) => string;
  categoryNameForCostCenter: (code: string) => string | null;
  refresh: () => Promise<void>;
}

function displayLabel(code: string, rawLabel: string): string {
  return rawLabel.trim() ? `${code} — ${rawLabel.trim()}` : code;
}

function toOption(c: PrCode, categoryName: string | null): PrCodeOption {
  return {
    value: c.code,
    code: c.code,
    label: displayLabel(c.code, c.label || ""),
    rawLabel: c.label || "",
    category: categoryName,
    categoryId: c.category_id,
    description: c.description,
    examples: c.examples,
  };
}

// ── Built-in fallback (mirrors the seed migration) ────────────────────────────

const FALLBACK_CATEGORY = "Golf Course";

function fallbackOptions(
  list: ReadonlyArray<{ value: string; label: string }>,
  isSite: boolean,
): PrCodeOption[] {
  return list.map((c) => {
    // The hardcoded cost-center/GL labels already include "code — desc".
    const raw = c.label.includes("—")
      ? c.label.split("—").slice(1).join("—").trim()
      : isSite
        ? ""
        : c.label;
    return {
      value: c.value,
      code: c.value,
      label: isSite ? c.value : c.label,
      rawLabel: raw,
      category: FALLBACK_CATEGORY,
      categoryId: null,
      description: null,
      examples: null,
    };
  });
}

export function usePrCodes(): UsePrCodesResult {
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [categories, setCategories] = useState<PrCategory[]>([]);
  const [codes, setCodes] = useState<PrCode[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, allCodes] = await Promise.all([
        directSelectList<PrCategory>("pr_categories", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          limit: 200,
          label: "pr-codes.categories",
        }),
        directSelectList<PrCode>("pr_codes", {
          columns: "*",
          filters: ["active=eq.true"],
          orderBy: [{ column: "sort_order", ascending: true }],
          limit: 1000,
          label: "pr-codes.codes",
        }),
      ]);
      if (allCodes.length === 0) {
        setUsingFallback(true);
        setCategories([]);
        setCodes([]);
      } else {
        setUsingFallback(false);
        setCategories(cats);
        setCodes(allCodes);
      }
    } catch {
      // Tables not present yet, or fetch failed — fall back to built-ins.
      setUsingFallback(true);
      setCategories([]);
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Omit<UsePrCodesResult, "loading" | "refresh">>(() => {
    if (usingFallback) {
      const sites = fallbackOptions(PR_SITES, true);
      const costCenters = fallbackOptions(PR_COST_CENTERS, false);
      const glAccounts = fallbackOptions(PR_GL_ACCOUNTS, false);
      return buildResult(sites, costCenters, glAccounts, [], true);
    }
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const sites = codes
      .filter((c) => c.kind === "site")
      .map((c) => toOption(c, c.category_id ? catName.get(c.category_id) ?? null : null));
    const costCenters = codes
      .filter((c) => c.kind === "cost_center")
      .map((c) => toOption(c, c.category_id ? catName.get(c.category_id) ?? null : null));
    const glAccounts = codes
      .filter((c) => c.kind === "gl_account")
      .map((c) => toOption(c, c.category_id ? catName.get(c.category_id) ?? null : null));
    return buildResult(sites, costCenters, glAccounts, categories, false);
  }, [usingFallback, categories, codes]);

  return { loading, refresh, ...value };
}

function buildResult(
  sites: PrCodeOption[],
  costCenters: PrCodeOption[],
  glAccounts: PrCodeOption[],
  categories: PrCategory[],
  usingFallback: boolean,
): Omit<UsePrCodesResult, "loading" | "refresh"> {
  const validCodes: ValidCodes = {
    sites: new Set(sites.map((s) => s.code)),
    costCenters: new Set(costCenters.map((s) => s.code)),
    glAccounts: new Set(glAccounts.map((s) => s.code)),
  };
  const rollupCostCenters: RollupCostCenter[] = costCenters.map((c) => ({
    code: c.code,
    label: c.rawLabel || c.code,
    categoryId: c.categoryId,
    category: c.category,
  }));
  const byKind: Record<PrCodeKind, PrCodeOption[]> = {
    site: sites,
    cost_center: costCenters,
    gl_account: glAccounts,
  };
  const labelFor = (kind: PrCodeKind, code: string): string => {
    const opt = byKind[kind].find((o) => o.code === code);
    return opt ? opt.rawLabel || opt.code : code;
  };
  const ccCategory = new Map(costCenters.map((c) => [c.code, c.category]));
  const categoryNameForCostCenter = (code: string): string | null =>
    ccCategory.get(code) ?? null;

  return {
    usingFallback,
    categories,
    sites,
    costCenters,
    glAccounts,
    validCodes,
    rollupCostCenters,
    labelFor,
    categoryNameForCostCenter,
  };
}
