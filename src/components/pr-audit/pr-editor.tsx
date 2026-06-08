"use client";

import { Plus, Trash2, Calculator } from "lucide-react";
import {
  PR_SITES,
  PR_COST_CENTERS,
  PR_GL_ACCOUNTS,
  type AccountingCode,
} from "@/lib/pr-accounting-codes";
import { rebalanceWithCcFee } from "@/lib/pr-cc-fee";
import {
  normalizePrItems,
  money,
  type ExtractedPr,
  type ExtractedPrItem,
  type AuditResult,
} from "@/lib/pr-audit/audit";
import { FindingsList } from "@/components/pr-audit/findings";

function emptyItem(): ExtractedPrItem {
  return {
    description: "",
    part_number: null,
    qty: 1,
    unit: "EA",
    unit_price: 0,
    site: null,
    cost_ctr: null,
    gl_acct: null,
    extended_price: null,
  };
}

// ── Code dropdown ─────────────────────────────────────────────────────────────

function CodeSelect({
  value,
  options,
  onChange,
  placeholder,
  invalid,
}: {
  value: string | null;
  options: AccountingCode[];
  onChange: (v: string) => void;
  placeholder: string;
  invalid: boolean;
}) {
  const v = value ?? "";
  const known = options.some((o) => o.value === v);
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full text-sm rounded-lg border bg-background px-2 py-2 ${
        invalid
          ? "border-red-500/60 text-red-700 dark:text-red-400"
          : "border-border"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {v !== "" && !known && (
        <option value={v}>{v} (invalid — not on the approved list)</option>
      )}
    </select>
  );
}

// ── Per-line editor card ──────────────────────────────────────────────────────

function LineItemCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ExtractedPrItem;
  index: number;
  onChange: (patch: Partial<ExtractedPrItem>) => void;
  onRemove: () => void;
}) {
  const siteInvalid = !!item.site && !PR_SITES.some((s) => s.value === item.site);
  const ccInvalid =
    !!item.cost_ctr && !PR_COST_CENTERS.some((s) => s.value === item.cost_ctr);
  const glInvalid =
    !!item.gl_acct && !PR_GL_ACCOUNTS.some((s) => s.value === item.gl_acct);
  const extended = (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Line {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
          className="p-1 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <input
        type="text"
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description"
        className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2 mb-2"
      />

      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Site</label>
          <CodeSelect
            value={item.site}
            options={PR_SITES}
            onChange={(v) => onChange({ site: v || null })}
            placeholder="Site"
            invalid={siteInvalid}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Cost Ctr</label>
          <CodeSelect
            value={item.cost_ctr}
            options={PR_COST_CENTERS}
            onChange={(v) => onChange({ cost_ctr: v || null })}
            placeholder="Cost Center"
            invalid={ccInvalid}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">G/L Acct</label>
          <CodeSelect
            value={item.gl_acct}
            options={PR_GL_ACCOUNTS}
            onChange={(v) => onChange({ gl_acct: v || null })}
            placeholder="G/L Account"
            invalid={glInvalid}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Part #</label>
          <input
            type="text"
            value={item.part_number ?? ""}
            onChange={(e) => onChange({ part_number: e.target.value || null })}
            placeholder="optional"
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Unit</label>
          <input
            type="text"
            value={item.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value || null })}
            placeholder="EA"
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <label className="text-[10px] text-muted-foreground">Qty</label>
          <input
            type="number"
            inputMode="decimal"
            value={Number.isFinite(item.qty) ? item.qty : 0}
            onChange={(e) => onChange({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Unit Price</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={Number.isFinite(item.unit_price) ? item.unit_price : 0}
            onChange={(e) =>
              onChange({ unit_price: parseFloat(e.target.value) || 0 })
            }
            className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
          />
        </div>
        <div className="text-right">
          <label className="text-[10px] text-muted-foreground block">
            Extended
          </label>
          <span className="text-sm font-semibold">{money(extended)}</span>
        </div>
      </div>
    </div>
  );
}

// ── The editor ────────────────────────────────────────────────────────────────

export function PrEditor({
  draft,
  audit,
  onChange,
}: {
  draft: ExtractedPr;
  audit: AuditResult;
  onChange: (next: ExtractedPr) => void;
}) {
  const updateItem = (index: number, patch: Partial<ExtractedPrItem>) => {
    onChange({
      ...draft,
      items: draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    });
  };
  const addItem = () =>
    onChange({ ...draft, items: [...draft.items, emptyItem()] });
  const removeItem = (index: number) =>
    onChange({ ...draft, items: draft.items.filter((_, i) => i !== index) });

  const recalcFee = () => {
    const rebalanced = rebalanceWithCcFee(normalizePrItems(draft.items));
    const items: ExtractedPrItem[] = rebalanced.map((it) => ({
      description: it.description,
      part_number: it.part_number || null,
      qty: it.qty,
      unit: it.unit || null,
      unit_price: it.unit_price,
      site: it.site || null,
      cost_ctr: it.cost_ctr || null,
      gl_acct: it.gl_acct || null,
      extended_price: null,
    }));
    onChange({ ...draft, items });
  };

  return (
    <div className="space-y-5">
      {/* Header fields */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
        <div className="text-sm font-semibold">PR details</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground">
              Date Prepared *
            </label>
            <input
              type="date"
              value={draft.date_prepared ?? ""}
              onChange={(e) =>
                onChange({ ...draft, date_prepared: e.target.value || null })
              }
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Vendor</label>
            <input
              type="text"
              value={draft.vendor_name ?? ""}
              onChange={(e) =>
                onChange({ ...draft, vendor_name: e.target.value || null })
              }
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Requestor</label>
            <input
              type="text"
              value={draft.requestor_name ?? ""}
              onChange={(e) =>
                onChange({ ...draft, requestor_name: e.target.value || null })
              }
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">
              Internal Order
            </label>
            <input
              type="text"
              value={draft.internal_order ?? ""}
              onChange={(e) =>
                onChange({ ...draft, internal_order: e.target.value || null })
              }
              placeholder="FY26-GC-0001"
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">
              &quot;Other&quot; attachment
            </label>
            <input
              type="text"
              value={draft.attached_other ?? ""}
              onChange={(e) =>
                onChange({ ...draft, attached_other: e.target.value })
              }
              placeholder="Vendor Quote"
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">
              Printed total (optional)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft.printed_total ?? ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  printed_total:
                    e.target.value === "" ? null : parseFloat(e.target.value),
                })
              }
              placeholder="grand total on the PR"
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-2"
            />
          </div>
        </div>
      </div>

      {/* Findings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Audit findings
          </h2>
          <button
            type="button"
            onClick={recalcFee}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Calculator className="w-3.5 h-3.5" /> Recalculate 3% fee
          </button>
        </div>
        <FindingsList findings={audit.findings} />
      </div>

      {/* Line items */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Line items ({draft.items.length})
        </h2>
        <div className="space-y-2">
          {draft.items.map((item, i) => (
            <LineItemCard
              key={i}
              item={item}
              index={i}
              onChange={(patch) => updateItem(i, patch)}
              onRemove={() => removeItem(i)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" /> Add line
        </button>
      </div>
    </div>
  );
}

export { emptyItem };
