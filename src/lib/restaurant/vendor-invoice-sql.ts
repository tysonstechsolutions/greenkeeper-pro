/**
 * SQL that saves planned vendor invoices — for loading a batch of
 * transcribed paper receipts in the Supabase SQL editor. Each invoice is one
 * statement: the purchase, then its lines, skipped whole if that vendor +
 * kind + number is already saved (so it is safe to run again).
 *
 * No DO blocks, and no semicolons or dollar signs inside text (the SQL editor
 * misreads both). Text is plain ASCII.
 * Pure.
 */
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

export function vendorInvoiceSql(p: PlannedVendorInvoice): string {
  const r = p.row;
  const head = [
    "WITH p AS (",
    "  INSERT INTO public.restaurant_purchases",
    "    (purchase_date, vendor, amount, kind, document_number, site, food_amount, alcohol_amount, supplies_amount, bar_cogs_amount, notes)",
    `  VALUES (${[r.purchase_date, r.vendor, r.amount, r.kind, r.document_number, r.site, r.food_amount, r.alcohol_amount, r.supplies_amount, r.bar_cogs_amount, r.notes].map(lit).join(", ")})`,
    "  ON CONFLICT (lower(vendor), kind, document_number) WHERE document_number IS NOT NULL DO NOTHING",
    "  RETURNING id",
    ")",
  ];
  if (p.lines.length === 0) return `${head.join("\n")}\nSELECT id FROM p;`;
  const values = p.lines.map(
    (l) =>
      `  (${[l.line_no, l.product_number, l.description, l.pack_size, l.qty, l.unit, l.unit_price, l.extended, l.category, l.outlet, l.cost_ctr, l.gl_acct]
        .map(lit)
        .join(", ")})`,
  );
  return [
    ...head,
    "INSERT INTO public.restaurant_purchase_lines",
    "  (purchase_id, line_no, product_number, description, pack_size, qty, unit, unit_price, extended, category, outlet, cost_ctr, gl_acct)",
    "SELECT p.id, v.line_no, v.product_number, v.description, v.pack_size, v.qty, v.unit, v.unit_price, v.extended, v.category, v.outlet, v.cost_ctr, v.gl_acct",
    "FROM p CROSS JOIN (VALUES",
    values.join(",\n"),
    ") AS v(line_no, product_number, description, pack_size, qty, unit, unit_price, extended, category, outlet, cost_ctr, gl_acct);",
  ].join("\n");
}
