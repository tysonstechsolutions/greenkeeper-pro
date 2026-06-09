/**
 * Map a built Purchase Request (purchase_requests) into a pr_audits payload, so
 * the reviewer can pull their own PRs into the audit dashboard + budget. The
 * audit row LINKS back to the PR (purchase_request_id) and carries the quote +
 * 889 it already has; the full builder data (contacts, addresses, justification,
 * IGE) is shown by reference on the detail page.
 *
 * Pure + unit-tested. The caller fetches the vendor 889 and supplies today's
 * date; nothing here touches the DB or the clock.
 */
import type {
  PrAuditReviewStatus,
  PurchaseRequest,
  PurchaseRequestItem,
} from "@/types/database";
import {
  auditPr,
  normalizePrItems,
  DEFAULT_VALID_CODES,
  type ExtractedPr,
  type ExtractedPrItem,
  type ValidCodes,
} from "@/lib/pr-audit/audit";
import { check889, type BundleFinding } from "@/lib/pr-audit/bundle-check";
import { formatInternalOrder } from "@/lib/pr-internal-order";

/** The vendor's Section 889 facts the import needs. */
export interface Vendor889 {
  section_889_path: string | null;
  section_889_filename: string | null;
  section_889_expiration_date: string | null;
}

/** Map the builder's status to the audit lifecycle stage. */
export function mapPurchaseRequestStatus(prStatus: string): PrAuditReviewStatus {
  switch (prStatus) {
    case "sent":
      return "sent_up";
    case "approved":
      return "ordered";
    case "received":
      return "received";
    case "submitted":
    case "draft":
    default:
      return "pending";
  }
}

function itemToExtracted(it: PurchaseRequestItem): ExtractedPrItem {
  return {
    description: it.description ?? "",
    part_number: it.part_number ?? null,
    qty: Number(it.qty) || 0,
    unit: it.unit ?? null,
    unit_price: Number(it.unit_price) || 0,
    site: it.site || null,
    cost_ctr: it.cost_ctr || null,
    gl_acct: it.gl_acct || null,
    extended_price: null,
  };
}

/** Build the pr_audits insert payload for one built PR. */
export function purchaseRequestToAuditPayload(
  pr: PurchaseRequest,
  vendor: Vendor889 | null,
  asOfIso: string,
  validCodes: ValidCodes = DEFAULT_VALID_CODES,
): Record<string, unknown> {
  const items = (pr.items ?? []).map(itemToExtracted);
  const internalOrder =
    formatInternalOrder(pr.pr_sequence_number, pr.date_prepared) ?? pr.internal_order ?? null;

  const extracted: ExtractedPr = {
    date_prepared: pr.date_prepared,
    vendor_name: pr.vendor1_name,
    requestor_name: pr.requestor_name,
    internal_order: internalOrder,
    items,
    attached_other: pr.attached_other,
    printed_total: null,
    warnings: [],
  };
  const audit = auditPr(extracted, validCodes);

  const has889 = !!vendor?.section_889_path;
  const bundleFindings: BundleFinding[] = [
    {
      code: "quote_ok",
      severity: "info",
      title: "Built in the PR app",
      detail: "Imported from your Purchase Request — the quote and 889 are attached.",
      suggestion: null,
    },
    ...check889({
      present: has889,
      compliant: has889 ? true : null,
      expirationDate: vendor?.section_889_expiration_date ?? null,
      name889: pr.vendor1_name,
      prVendor: pr.vendor1_name,
      asOfIso,
    }),
  ];

  return {
    purchase_request_id: pr.id,
    file_path: null,
    file_name: null,
    file_uploaded_at: null,
    pr_date: pr.date_prepared,
    vendor_name: pr.vendor1_name,
    requestor_name: pr.requestor_name,
    internal_order: internalOrder,
    items: normalizePrItems(items),
    attached_other: pr.attached_other,
    printed_total: null,
    audit_findings: audit.findings,
    audit_error_count: audit.errorCount,
    audit_warning_count: audit.warningCount,
    computed_total: audit.computedTotal,
    review_status: mapPurchaseRequestStatus(pr.status),
    quote_path: pr.quote_storage_path,
    quote_filename: pr.quote_filename,
    quote_total: null,
    section_889_path: vendor?.section_889_path ?? null,
    section_889_filename: vendor?.section_889_filename ?? null,
    section_889_expiration_date: vendor?.section_889_expiration_date ?? null,
    section_889_compliant: has889 ? true : null,
    bundle_findings: bundleFindings,
    bundle_checked_at: asOfIso,
    revision: 1,
  };
}
