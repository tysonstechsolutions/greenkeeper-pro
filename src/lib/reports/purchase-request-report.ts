/**
 * NAVMIDLANT NAF Purchase Request — PDF generator.
 *
 * The government distributes this PR as a fillable AcroForm PDF and will not
 * accept any visual deviation from the official form. So we don't redraw it
 * — we LOAD the official template (`public/templates/naf-pr-template.pdf`)
 * and fill its named fields with the user's data, then flatten the form so
 * the values render in any viewer (Outlook preview, Acrobat, browsers).
 *
 * Field map of the template was discovered by walking the AcroForm with
 * pikepdf. Naming quirks worth knowing:
 *   • Page 1 has 16 line-item rows (suffix "1".."16", no dot).
 *   • Page 2 has 32 rows; the form skips index 17 and uses suffix
 *     ".18".."49" for Item/Site/Center/Acct/Unit (with leading dot) and
 *     "18".."49" for Description/QTY/Price/Extended (no dot).
 *   • Vendor 1 details use the unprefixed names (ADDRESS, LINE2, EMAIL, …)
 *     while Invoice/Delivery use INVOICE_* / DELIVERY_* prefixes.
 *   • Header dates are "DATE SUBMITTED" (date prepared) and "RDD" (req'd
 *     delivery date). Yes, "DATE SUBMITTED" really has a space in it.
 *   • DepartmentNames choice defaults to MIDLANT — we leave that alone so
 *     the auto-populated "NAVY REGION MID-ATLANTIC" header remains.
 */

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFTextField,
  StandardFonts,
  type PDFForm,
} from "pdf-lib";
import { formatInternalOrder } from "@/lib/pr-internal-order";
import { PR_ACCOUNTING_DEFAULTS, PR_REQUESTOR_DEFAULTS } from "@/lib/pr-defaults";
import { findVendorDefaults } from "@/lib/vendor-defaults";
import { getCachedUserId, directSelectRow } from "@/lib/supabase/rest";
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database";

const TEMPLATE_URL = "/templates/naf-pr-template.pdf";

// 48 line-item slots: 16 on page 1 + 32 on page 2.
const MAX_LINE_ITEMS = 48;

interface RowSuffixes {
  /** Suffix for fields that use a dot before the page-2 index (Item, Site,
   *  Center, Acct, Unit). On page 1 there is no dot. */
  withDot: string;
  /** Suffix for fields that have no dot anywhere (Description, QTY, Price,
   *  Extended). */
  noDot: string;
  page: 1 | 2;
}

function rowSuffixes(row: number): RowSuffixes {
  if (row <= 16) {
    const n = String(row);
    return { withDot: n, noDot: n, page: 1 };
  }
  // Rows 17..48 → page-2 indices 18..49.
  const idx = row - 17 + 18;
  return { withDot: `.${idx}`, noDot: String(idx), page: 2 };
}

function fmtMoney(n: number): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // mm/dd/yyyy — matches what the official form's date pickers produce.
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "2-digit", day: "2-digit" },
  );
}

function setText(
  form: PDFForm,
  name: string,
  value: string,
  written: Set<string>,
): void {
  // Note: we DO write empty strings. The template has user-specific
  // pre-fill defaults baked in (e.g. "BLDG 3212A Door #3" for the
  // delivery line 2). If a user clears that field on the form and saves,
  // the DB stores null and we receive `""` here — early-returning would
  // leave the stale template default visible on the rendered PDF, making
  // it look like the edit didn't take. Writing "" explicitly clears the
  // field to match the user's saved data.
  try {
    const f = form.getField(name);
    if (!(f instanceof PDFTextField)) return;
    // The template enforces a hard maxLength on several fields (Description=85,
    // Center=6, Acct=6, Site=4, Item=4). pdf-lib throws if we exceed it. Trim
    // gracefully and put a single ellipsis so the user can see we shortened.
    const max = f.getMaxLength();
    let text = value;
    if (typeof max === "number" && max > 0 && text.length > max) {
      text = max > 1 ? text.slice(0, max - 1) + "…" : text.slice(0, max);
    }
    f.setText(text);
    written.add(name);
  } catch {
    // Field absent — likely an older template revision; skip silently.
  }
}

function setCheckbox(
  form: PDFForm,
  name: string,
  checked: boolean,
  written: Set<string>,
): void {
  try {
    const f = form.getField(name);
    if (f instanceof PDFCheckBox) {
      if (checked) f.check();
      else f.uncheck();
      written.add(name);
    }
  } catch {
    // ignore
  }
}

function setDropdown(
  form: PDFForm,
  name: string,
  value: string,
  written: Set<string>,
): void {
  if (!value) return;
  try {
    const f = form.getField(name);
    if (f instanceof PDFDropdown) {
      const options = f.getOptions();
      if (options.includes(value)) {
        f.select(value);
        written.add(name);
      }
      // If the value isn't in the option list, leave the default in place
      // rather than throwing — the user can fix it in Acrobat.
    }
  } catch {
    // ignore
  }
}

export class PurchaseRequestReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "PurchaseRequestReportError";
  }
}

// Cache the template bytes after the first fetch — saves ~360 KB per
// generation on repeat runs in the same session.
let cachedTemplate: Uint8Array | null = null;

async function loadTemplate(): Promise<Uint8Array> {
  if (cachedTemplate) return cachedTemplate.slice();
  const resp = await fetch(TEMPLATE_URL, { cache: "force-cache" });
  if (!resp.ok) {
    throw new PurchaseRequestReportError(
      "load-template",
      `Couldn't load PR template (HTTP ${resp.status}). The file should be at ${TEMPLATE_URL}.`,
    );
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  cachedTemplate = buf;
  return buf.slice();
}

export async function generatePurchaseRequestReport(
  pr: PurchaseRequest,
): Promise<Blob> {
  let step = "init";
  try {
    step = "load-template";
    const templateBytes = await loadTemplate();

    step = "parse-pdf";
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Track every field we modify. Only THESE get fresh appearance streams
    // generated below. Untouched fields keep their cached appearances —
    // critical for the form's pre-formatted "$0.00" cells in empty Price /
    // Extended Price rows, which use the form's Acrobat JS to format and
    // would render as raw "0" if regenerated by pdf-lib.
    const written = new Set<string>();

    // ── Header ─────────────────────────────────────────────────────────
    step = "fill-header";
    setText(form, "DATE SUBMITTED", fmtDate(pr.date_prepared), written);
    setText(form, "RDD", fmtDate(pr.required_delivery_date), written);
    setDropdown(form, "Via", pr.request_via, written);
    setDropdown(form, "Currency", pr.currency, written);

    // ── Vendor 1 (uses unprefixed field names) ─────────────────────────
    // Old PRs were saved when the vendor record itself was blank, so the
    // denormalized vendor1_* fields on the PR are blank too. Look up
    // VENDOR_DEFAULTS by the saved vendor name and use those as the
    // fallback for any blank field — that way re-downloading an old PR
    // prints the right POC / phone / email / address even though the
    // database row hasn't been touched.
    step = "fill-vendor1";
    const v1Defaults = findVendorDefaults(pr.vendor1_name || "");
    setText(form, "VENDOR.1", pr.vendor1_name || "", written);
    setText(form, "ADDRESS", pr.vendor1_address || v1Defaults?.address || "", written);
    setText(form, "LINE2", pr.vendor1_line2 || v1Defaults?.address_line2 || "", written);
    setText(form, "CITY_ST_ZIP_CODE", pr.vendor1_city_state_zip || v1Defaults?.city_state_zip || "", written);
    setText(form, "POC1", pr.vendor1_poc || v1Defaults?.poc || "", written);
    setText(form, "EMAIL", pr.vendor1_email || v1Defaults?.email || "", written);
    setText(form, "PHONE", pr.vendor1_phone || v1Defaults?.phone || "", written);
    setText(form, "SAP_VENDOR_No", pr.vendor1_sap_no || "", written);
    setText(form, "GSANAFOther_No", pr.vendor1_gsa_naf_no || "", written);

    // ── Vendors 2 & 3 (names only — full info is the attachment) ───────
    step = "fill-vendors-2-3";
    setText(form, "VENDOR.2", pr.vendor2_name || "", written);
    setText(form, "VENDOR.3", pr.vendor3_name || "", written);

    // ── Requestor ──────────────────────────────────────────────────────
    // For older PRs that were saved before the auto-fill rule wired up,
    // back-fill blank requestor name / email / phone from the *currently
    // signed-in user's* profile. So when you re-download a PR you made
    // last week, your phone shows even though the row still has it blank.
    step = "fill-requestor";
    let fallbackName = "";
    let fallbackEmail = "";
    let fallbackPhone = "";
    try {
      const uid = getCachedUserId();
      if (uid) {
        const profile = await directSelectRow<{
          full_name: string | null;
          display_name: string | null;
          email: string | null;
          phone: string | null;
        }>(
          "profiles",
          "id",
          uid,
          "full_name, display_name, email, phone",
          "purchase-request-report.requestorFallback",
        );
        if (profile) {
          fallbackName = profile.full_name || profile.display_name || "";
          fallbackEmail = profile.email || "";
          fallbackPhone = profile.phone || "";
        }
      }
    } catch {
      // Non-fatal — if profile lookup fails we just print whatever the PR
      // row has (blank if blank). Same as before.
    }
    setText(form, "REQUESTOR_NAME", pr.requestor_name || fallbackName, written);
    setText(form, "REQUESTOR_EMAIL", pr.requestor_email || fallbackEmail, written);
    // Final fallback for phone is the site-wide default — guarantees the
    // PR prints with a phone number even on rows saved before the
    // auto-fill rule existed and on accounts that never set a profile phone.
    setText(
      form,
      "REQUESTOR_PHONE",
      pr.requestor_phone || fallbackPhone || PR_REQUESTOR_DEFAULTS.phone,
      written,
    );

    // ── Invoice address ────────────────────────────────────────────────
    step = "fill-invoice";
    setText(form, "INVOICE_ADDRESS", pr.invoice_address || "", written);
    setText(form, "INVOICE_LINE2", pr.invoice_line2 || "", written);
    setText(form, "INVOICE_CITY_ST_ZIP_CODE", pr.invoice_city_state_zip || "", written);
    setText(form, "INVOICE_POC", pr.invoice_poc || "", written);
    setText(form, "INVOICE_PHONE", pr.invoice_phone || "", written);
    setText(form, "INVOICE_EMAIL", pr.invoice_email || "", written);

    // ── Delivery address ───────────────────────────────────────────────
    step = "fill-delivery";
    setText(form, "DELIVERY_ADDRESS", pr.delivery_address || "", written);
    setText(form, "DELIVERY_LINE2", pr.delivery_line2 || "", written);
    setText(form, "DELIVERY_CITY_ST_ZIP_CODE", pr.delivery_city_state_zip || "", written);
    setText(form, "DELIVERY_POC", pr.delivery_poc || "", written);
    setText(form, "DELIVERY_PHONE", pr.delivery_phone || "", written);
    setText(form, "DELIVERY_EMAIL", pr.delivery_email || "", written);

    // ── Accounting (right-side block) ──────────────────────────────────
    step = "fill-accounting";
    setText(form, "COMPANY_CODE", pr.company_code || "", written);
    // Default to VMGC's facility code (8400) when blank — covers older
    // PRs saved before the "always 8400" rule was wired in. See
    // PR_ACCOUNTING_DEFAULTS for the source of truth.
    setText(
      form,
      "REQUESTING_CODE",
      pr.requesting_facility_code || PR_ACCOUNTING_DEFAULTS.requesting_facility_code,
      written,
    );
    const internalOrder =
      formatInternalOrder(pr.pr_sequence_number, pr.date_prepared) ||
      pr.internal_order ||
      "";
    setText(form, "INTERNAL_ORDER", internalOrder, written);
    setText(form, "PROJECT_No", pr.project_no || "", written);
    // Same fallback pattern as facility code — old PRs that pre-date
    // the "always golf" rule still print "golf" on download.
    setText(form, "PROGRAM", pr.program || PR_ACCOUNTING_DEFAULTS.program, written);

    // ── Line items ─────────────────────────────────────────────────────
    step = "fill-items";
    let pg1Total = 0;
    let pg2Total = 0;
    const items: PurchaseRequestItem[] = (pr.items || []).slice(0, MAX_LINE_ITEMS);
    items.forEach((it, idx) => {
      const row = idx + 1;
      const { withDot, noDot, page } = rowSuffixes(row);

      // Description: name + part number with an em-dash separator. The
      // template caps Description at 85 chars; setText truncates if needed.
      const descParts = [it.description || ""];
      if (it.part_number) descParts.push(`Part #: ${it.part_number}`);
      const desc = descParts.filter(Boolean).join(" — ");

      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const ext = qty * unitPrice;

      setText(form, `Item${withDot}`, String(it.item || row), written);
      setText(form, `Site${withDot}`, it.site || "", written);
      setText(form, `Center${withDot}`, it.cost_ctr || "", written);
      setText(form, `Acct${withDot}`, it.gl_acct || "", written);
      setText(form, `Description${noDot}`, desc, written);
      setText(form, `Unit${withDot}`, it.unit || "", written);
      // For "free with order" items (qty > 0 but unit_price == 0), the
      // user wants the row to print "0.00" / "$0.00" explicitly instead
      // of blank cells — otherwise the procurement reader sees "QTY: 1"
      // next to an empty price and wonders if the form is broken. Saved
      // items have already passed the description/qty/price filter, so
      // any item reaching the PDF is a real line; show its actual values.
      if (qty > 0) {
        setText(form, `QTY${noDot}`, String(qty), written);
        setText(form, `Price${noDot}`, unitPrice.toFixed(2), written);
        setText(form, `Extended${noDot}`, fmtMoney(ext), written);
      } else {
        // Note-style row (description only, no quantity) — leave the
        // numeric cells blank so the form isn't cluttered with "$0.00".
        setText(form, `QTY${noDot}`, "", written);
        setText(form, `Price${noDot}`, unitPrice ? unitPrice.toFixed(2) : "", written);
        setText(form, `Extended${noDot}`, ext ? fmtMoney(ext) : "", written);
      }

      if (page === 1) pg1Total += ext;
      else pg2Total += ext;
    });

    // ── Cost-center / G/L subtotals ───────────────────────────────────
    // Group line items by "COST_CTR/GL_ACCT" and write one description-only
    // row per group below the last real item. This mirrors the yellow-
    // highlighted summary rows the finance office requires.
    step = "fill-subtotals";
    const ccGlMap = new Map<string, number>();
    for (const it of items) {
      const key = `${it.cost_ctr || ""}/${it.gl_acct || ""}`;
      const ext = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      ccGlMap.set(key, (ccGlMap.get(key) ?? 0) + ext);
    }
    // Only emit totals when there is cost-center info and at least one group
    // has a non-zero extended amount (avoids phantom rows on blank PRs).
    const ccGlEntries = [...ccGlMap.entries()].filter(
      ([key, total]) => key !== "/" && total > 0,
    );
    let nextRow = items.length + 1;
    for (const [key, total] of ccGlEntries) {
      if (nextRow > MAX_LINE_ITEMS) break;
      const { noDot } = rowSuffixes(nextRow);
      setText(form, `Description${noDot}`, `${key} total — ${fmtMoney(total)}`, written);
      // Explicitly clear Price / Extended so the template's cached "$0.00"
      // appearance doesn't render for these summary rows.
      setText(form, `Price${noDot}`, "", written);
      setText(form, `Extended${noDot}`, "", written);
      nextRow++;
    }

    // ── Blank out the Price/Extended cells for every remaining unused row ─
    // The template has Acrobat JS that pre-formats those cells as "$0.00".
    // If we don't touch them, that cached appearance shows on the printed
    // PDF and the spec sheet looks like every row has a $0.00 line item.
    // Explicitly clearing them (and marking them written) forces a fresh
    // empty appearance.
    for (let row = nextRow; row <= MAX_LINE_ITEMS; row++) {
      const { noDot } = rowSuffixes(row);
      setText(form, `Price${noDot}`, "", written);
      setText(form, `Extended${noDot}`, "", written);
    }

    // ── IGE / approvals / justification ────────────────────────────────
    step = "fill-footer";
    // The form's "subTotal" is the page-1 IGE amount; we use the user's
    // entered ige_amount if set, otherwise the computed page-1 total.
    const totalIge = Number(pr.ige_amount) || pg1Total + pg2Total;
    setText(form, "subTotal", fmtMoney(totalIge), written);
    if (pg2Total > 0) setText(form, "subTotalpg2", fmtMoney(pg2Total), written);
    setText(form, "Exceed", `${pr.ige_excess_pct ?? 0}%`, written);
    setText(form, "IGE", pr.ige_based_on || "", written);
    setText(form, "Justifications", pr.justification || "", written);
    setText(form, "APPROVING_OFFICIAL", pr.approving_authority || "", written);
    setText(form, "SECOND_APPROVAL", pr.second_approval || "", written);
    if (pr.attached_other) setText(form, "Attachment", pr.attached_other, written);

    // ── Attached-item checkboxes ───────────────────────────────────────
    step = "fill-checkboxes";
    setCheckbox(form, "SSJ", pr.attached_ssj, written);
    setCheckbox(form, "BNJ", pr.attached_bnj, written);
    setCheckbox(form, "PWS", pr.attached_pws, written);
    setCheckbox(form, "ITPR", pr.attached_itpr, written);
    setCheckbox(form, "Other", !!pr.attached_other, written);
    setCheckbox(form, "889", pr.attached_section_889, written);

    // ── Refresh appearances ONLY for fields we wrote ───────────────────
    step = "update-appearances";
    // The template has signature annotations whose appearance dictionaries
    // confuse pdf-lib's bulk updateFieldAppearances pass. So we update
    // appearances field-by-field, only for the ones we changed. This:
    //   • avoids the bulk pass that throws on signature annotations
    //   • leaves untouched fields' cached appearances intact, preserving
    //     the form's pre-formatted "$0.00" empty Price / Extended cells
    //     (which come from the template's Acrobat JS format scripts and
    //      would render as raw "0" if pdf-lib regenerated them)
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (const name of written) {
      try {
        const f = form.getField(name);
        const updater = (f as { updateAppearances?: (font: typeof helvetica) => void })
          .updateAppearances;
        if (typeof updater === "function") {
          updater.call(f, helvetica);
        }
      } catch {
        // Best-effort: if a single field can't refresh appearances, the
        // PDF still has the V (value) set, which most viewers honor.
      }
    }

    step = "save";
    const bytes = await pdfDoc.save({ updateFieldAppearances: false });
    // Cast to ArrayBuffer because TS's lib types insist Blob parts come from
    // a strict ArrayBuffer, not the generic ArrayBufferLike that Uint8Array
    // exposes. The runtime accepts Uint8Array directly.
    return new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
  } catch (err: unknown) {
    if (err instanceof PurchaseRequestReportError) throw err;
    const msg = err instanceof Error ? err.message : "Failed to generate PDF";
    throw new PurchaseRequestReportError(step, msg);
  }
}

export function purchaseRequestFilename(pr: PurchaseRequest): string {
  const d = pr.date_prepared.replace(/-/g, "");
  const vendor = (pr.vendor1_name || "vendor")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  // Include a unique discriminator so two PRs to the same vendor on the
  // same day don't collide on download (which used to silently overwrite
  // each other in the user's Downloads folder). Prefer the human-readable
  // PR sequence number (matches what shows in the form's Internal Order
  // field); fall back to the first chunk of the row's UUID.
  const seq = pr.pr_sequence_number;
  const disc =
    seq != null && seq !== 0
      ? String(seq).padStart(4, "0")
      : pr.id?.slice(0, 8) || "";
  return disc
    ? `PR-${d}-${disc}-${vendor}.pdf`
    : `PR-${d}-${vendor}.pdf`;
}
