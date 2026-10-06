"use client";

import { useId, useMemo, useState } from "react";
import { Lightbulb, Search, X } from "lucide-react";
import { COST_CENTER_CODES, GL_ACCOUNT_CODES, SITE_CODES } from "@/lib/accounting/official-codes";
import {
  COMMON_COST_CENTERS,
  COMMON_GL_ACCOUNTS,
  COMMON_SITES,
  codeLabel,
  isOfficialCode,
  type CodeSuggestion,
} from "@/lib/accounting/recommend";

export type CodeKind = "site" | "cost_center" | "gl_account";

interface Option {
  code: string;
  label: string;
  group: string;
}

/** G/L accounts grouped by what the first digit means on the chart. */
function glGroup(code: string): string {
  switch (code[0]) {
    case "1":
      return "Assets & inventory (1xxxxx)";
    case "2":
      return "Liabilities (2xxxxx)";
    case "3":
      return "Resale revenue (3xxxxx)";
    case "4":
      return "Cost of goods sold (4xxxxx)";
    case "5":
      return "Program & other revenue (5xxxxx)";
    case "6":
      return "Labor, utilities & repairs (6xxxxx)";
    case "7":
      return "Supplies, services & other expense (7xxxxx)";
    default:
      return "Other (8xxxxx–9xxxxx)";
  }
}

const ALL: Record<CodeKind, Option[]> = {
  site: SITE_CODES.map((s) => ({ code: s.code, label: `${s.label} · ${s.address}`, group: "All sites" })),
  cost_center: COST_CENTER_CODES.map((c) => ({
    code: c.code,
    label: c.label,
    // The activity as printed on the listing, without the "NS GREAT LAKES" prefix.
    group: c.group.replace(/^NS GREAT LAKES\s*/i, "").replace(/^NS GLK\s*/i, "").trim() || "OTHER",
  })),
  gl_account: GL_ACCOUNT_CODES.map((g) => ({ code: g.code, label: g.label, group: glGroup(g.code) })),
};

const COMMON: Record<CodeKind, string[]> = {
  site: COMMON_SITES,
  cost_center: COMMON_COST_CENTERS,
  gl_account: COMMON_GL_ACCOUNTS,
};

const NOUN: Record<CodeKind, string> = {
  site: "site",
  cost_center: "cost center",
  gl_account: "G/L account",
};

export interface CodePickerProps {
  kind: CodeKind;
  value: string | null | undefined;
  onChange: (code: string) => void;
  /** What the app recommends for this document, shown under the picker. */
  suggestion?: CodeSuggestion | null;
  /** Text for the empty choice, e.g. "— pick —". Omit to require a value. */
  emptyLabel?: string;
  /** Accessible name (also used by tests). */
  ariaLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Pick a Site / Cost Center / G/L Account from the official listings: the
 * codes this operation uses most come first, every official code is below,
 * and the search box narrows the list. When the app has a suggestion that
 * differs from the current pick, it shows it with a one-tap "Use".
 */
export function CodePicker({
  kind,
  value,
  onChange,
  suggestion,
  emptyLabel,
  ariaLabel,
  id,
  className,
  disabled,
}: CodePickerProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const current = (value ?? "").trim();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (o: Option) =>
      !q || o.code.includes(q) || o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q);
    const common = COMMON[kind]
      .map((code) => ALL[kind].find((o) => o.code === code))
      .filter((o): o is Option => !!o && matchesQuery(o));
    const rest = new Map<string, Option[]>();
    for (const o of ALL[kind]) {
      if (!matchesQuery(o) || COMMON[kind].includes(o.code)) continue;
      const list = rest.get(o.group) ?? [];
      list.push(o);
      rest.set(o.group, list);
    }
    return { common, rest: [...rest.entries()] };
  }, [kind, query]);

  // Keep the current pick selectable while a search hides it.
  const currentHidden =
    !!current &&
    isOfficialCode(kind, current) &&
    !groups.common.some((o) => o.code === current) &&
    !groups.rest.some(([, list]) => list.some((o) => o.code === current));
  const showSuggestion = !!suggestion && suggestion.code !== current && !disabled;
  const unofficial = !!current && !isOfficialCode(kind, current);
  const matchCount = groups.common.length + groups.rest.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <select
          id={selectId}
          aria-label={ariaLabel ?? `Choose ${NOUN[kind]}`}
          value={current}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value || emptyLabel !== undefined) onChange(e.target.value);
          }}
          className={`min-w-0 flex-1 ${className ?? "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm"}`}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {emptyLabel === undefined && !current && <option value="">— pick —</option>}
          {unofficial && <option value={current}>{current} (not on the official list)</option>}
          {currentHidden && <option value={current}>{codeLabel(kind, current)}</option>}
          {groups.common.length > 0 && (
            <optgroup label="Most used">
              {groups.common.map((o) => (
                <option key={`c-${o.code}`} value={o.code}>
                  {o.code} — {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {groups.rest.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code} — {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          aria-label={searching ? `Stop searching ${NOUN[kind]}s` : `Search all ${NOUN[kind]}s`}
          title={searching ? "Close search" : `Search all ${NOUN[kind]}s`}
          disabled={disabled}
          onClick={() => {
            setSearching((s) => !s);
            setQuery("");
          }}
          className="shrink-0 px-2.5 rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {searching ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      {searching && (
        <div className="space-y-0.5">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Type a number or word, e.g. ${kind === "gl_account" ? "684 or grounds" : kind === "site" ? "7011 or Buckley" : "20091 or golf"}`}
            aria-label={`Search ${NOUN[kind]}s`}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {matchCount} match{matchCount === 1 ? "" : "es"} — then pick from the list above.
          </p>
        </div>
      )}

      {showSuggestion && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0">
            Suggested: <span className="font-medium">{codeLabel(kind, suggestion!.code)}</span>
            <span className="text-muted-foreground"> — {suggestion!.reason}</span>{" "}
            <button
              type="button"
              onClick={() => onChange(suggestion!.code)}
              className="underline font-medium"
              aria-label={`Use suggested ${NOUN[kind]} ${suggestion!.code}`}
            >
              Use
            </button>
          </span>
        </p>
      )}
    </div>
  );
}
