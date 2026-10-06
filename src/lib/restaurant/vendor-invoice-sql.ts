/**
 * SQL that saves planned vendor invoices — for loading a batch of
 * transcribed paper receipts in the Supabase SQL editor. Two statements: the
 * purchases (an invoice already saved for that vendor + kind + number is
 * skipped), then the line items for every purchase in the batch that has none
 * yet. Safe to run again.
 *
 * No DO blocks, and no semicolons or dollar signs inside text (the SQL editor
 * misreads both). Text is plain ASCII.
 * Pure.
 */
import { BUCKLEYS_COST_CENTER } from "./coding";
import type { PlannedVendorInvoice } from "./vendor-invoice";

function lit(v: string | number | null): string {
  if (v == null) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Not a number: ${v}`);
    return String(v);
  }
  // The Supabase SQL editor splits on semicolons and reads $ as the start of a
  // dollar-quoted block, so neither can appear inside text.
  if (/[;$]/.test(v)) throw new Error(`Text can't hold a semicolon or dollar sign (the SQL editor misreads them): ${v}`);
  // Plain ASCII only: the middle dot in notes becomes a dash.
  const ascii = v.replace(/ · /g, " - ").replace(/[^\x20-\x7E]/g, "");
  return `'${ascii.replace(/'/g, "''")}'`;
}

const row = (values: (string | number | null)[]) => `  (${values.map(lit).join(", ")})`;

export function vendorInvoicesSql(plans: PlannedVendorInvoice[]): string {
  for (const p of plans) {
    if (p.lines.some((l) => l.cost_ctr !== BUCKLEYS_COST_CENTER)) {
      throw new Error(`Only ${BUCKLEYS_COST_CENTER} lines can be written here (${p.row.document_number})`);
    }
  }
  const purchases = [
    "INSERT INTO public.restaurant_purchases",
    "  (purchase_date, vendor, amount, kind, document_number, food_amount, alcohol_amount, supplies_amount, bar_cogs_amount, notes)",
    "VALUES",
    plans
      .map((p) =>
        row([
          p.row.purchase_date,
          p.row.vendor,
          p.row.amount,
          p.row.kind,
          p.row.document_number,
          p.row.food_amount,
          p.row.alcohol_amount,
          p.row.supplies_amount,
          p.row.bar_cogs_amount,
          p.row.notes,
        ]),
      )
      .join(",\n"),
    "ON CONFLICT (lower(vendor), kind, document_number) WHERE document_number IS NOT NULL DO NOTHING;",
  ].join("\n");

  const lines = [
    "INSERT INTO public.restaurant_purchase_lines",
    "  (purchase_id, line_no, product_number, description, pack_size, qty, unit, unit_price, extended, category, outlet, cost_ctr, gl_acct)",
    `SELECT p.id, v.line_no, v.product_number, v.description, v.pack_size, v.qty, 'CS', v.unit_price, v.extended, v.category, v.outlet, '${BUCKLEYS_COST_CENTER}', v.gl_acct`,
    "FROM (VALUES",
    plans
      .flatMap((p) =>
        p.lines.map((l) =>
          row([
            p.row.vendor,
            p.row.kind,
            p.row.document_number,
            l.line_no,
            l.product_number,
            l.description,
            l.pack_size,
            l.qty,
            l.unit_price,
            l.extended,
            l.category,
            l.outlet,
            l.gl_acct,
          ]),
        ),
      )
      .join(",\n"),
    ") AS v(vendor, kind, doc, line_no, product_number, description, pack_size, qty, unit_price, extended, category, outlet, gl_acct)",
    "JOIN public.restaurant_purchases p",
    "  ON lower(p.vendor) = lower(v.vendor) AND p.kind = v.kind AND p.document_number = v.doc",
    "WHERE NOT EXISTS (SELECT 1 FROM public.restaurant_purchase_lines l WHERE l.purchase_id = p.id);",
  ].join("\n");

  return `${purchases}\n\n${lines}`;
}
