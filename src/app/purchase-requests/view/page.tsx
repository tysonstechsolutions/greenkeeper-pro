"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Edit,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  generatePurchaseRequestReport,
  PurchaseRequestReportError,
} from "@/lib/reports/purchase-request-report";
import {
  buildPrBundle,
  PrBundleError,
} from "@/lib/reports/pr-bundle";
import {
  purchaseRequestPdfFilename,
  prEmailSubject,
} from "@/lib/reports/pr-naming";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// Native-aware download lives in @/lib/utils/download-blob.

function ViewPurchaseRequestInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { profile, loading: authLoading } = useAuth();

  const isManagement =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdfOnly, setDownloadingPdfOnly] = useState(false);
  const [bundleWarnings, setBundleWarnings] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing request id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("purchase_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr) setError(fetchErr.message);
      else if (!data) setError("Not found");
      else setPr(data as unknown as PurchaseRequest);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const igeAmount = useMemo(() => {
    if (!pr) return 0;
    return (pr.items || []).reduce(
      (sum: number, it: PurchaseRequestItem) =>
        sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
      0,
    );
  }, [pr]);

  /** Bundle download: PR PDF + Quote + 889 zipped, properly named. */
  async function handleDownloadBundle() {
    if (!pr) return;
    setDownloading(true);
    setBundleWarnings([]);
    setError(null);
    try {
      const result = await buildPrBundle(pr);
      await saveBlobToDevice({
        blob: result.blob,
        filename: result.filename,
        shareTitle: prEmailSubject(pr),
      });
      if (result.warnings.length > 0) setBundleWarnings(result.warnings);
    } catch (err) {
      const msg =
        err instanceof PrBundleError
          ? `Bundle build failed at "${err.step}": ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to build PR bundle";
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  /** Single PDF download — when the user only wants the PR itself. */
  async function handleDownloadPdfOnly() {
    if (!pr) return;
    setDownloadingPdfOnly(true);
    setError(null);
    try {
      const blob = await generatePurchaseRequestReport(pr);
      const filename = purchaseRequestPdfFilename(pr);
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
    } catch (err) {
      const msg =
        err instanceof PurchaseRequestReportError
          ? `PDF generation failed at "${err.step}": ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to generate PDF";
      setError(msg);
    } finally {
      setDownloadingPdfOnly(false);
    }
  }

  async function handleDelete() {
    if (!pr) return;
    if (!confirm("Delete this purchase request? This cannot be undone.")) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("purchase_requests")
      .delete()
      .eq("id", pr.id);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.push("/purchase-requests");
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (error && !pr) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/purchase-requests"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Purchase Request</h1>
        </div>
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!pr) return null;

  const isDraft = pr.status === "draft";

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/purchase-requests"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">
            {formatDate(pr.date_prepared)}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {pr.vendor1_name || "Vendor TBD"}
          </p>
        </div>
      </div>

      {/* Total banner */}
      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              IGE Amount
            </p>
            <p className="text-2xl font-bold text-primary">
              {formatMoney(igeAmount)}
            </p>
          </div>
          {isDraft ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-muted text-muted-foreground shrink-0">
              Draft
            </span>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-green-500/15 text-green-700 dark:text-green-400 shrink-0">
              Submitted
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={handleDownloadBundle}
          disabled={downloading || downloadingPdfOnly}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? "Building bundle..." : "Download PR + Quote + 889 (zip)"}
        </button>
        <button
          onClick={handleDownloadPdfOnly}
          disabled={downloading || downloadingPdfOnly}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {downloadingPdfOnly ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloadingPdfOnly ? "Generating..." : "Download PR PDF only"}
        </button>
        {isManagement && (
          <Link
            href={`/purchase-requests/new?id=${pr.id}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border font-medium hover:bg-muted active:scale-[0.98] transition-all"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}
      </div>

      {bundleWarnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
          {bundleWarnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Header */}
      <SectionCard title="Header">
        <Detail label="Date Prepared" value={formatDate(pr.date_prepared)} />
        <Detail label="Required Delivery" value={formatDate(pr.required_delivery_date)} />
        <Detail label="Request Via" value={pr.request_via} />
        <Detail label="Currency" value={pr.currency} />
      </SectionCard>

      {/* Requestor */}
      <SectionCard title="Requestor">
        <Detail label="Name" value={pr.requestor_name} />
        <Detail label="Email" value={pr.requestor_email || "—"} />
        <Detail label="Phone" value={pr.requestor_phone || "—"} />
      </SectionCard>

      {/* Vendor 1 */}
      <SectionCard title="Vendor 1">
        <Detail label="Name" value={pr.vendor1_name || "—"} />
        <Detail label="Address" value={
          [pr.vendor1_address, pr.vendor1_line2, pr.vendor1_city_state_zip]
            .filter(Boolean).join(", ") || "—"
        } fullWidth />
        <Detail label="POC" value={pr.vendor1_poc || "—"} />
        <Detail label="Email" value={pr.vendor1_email || "—"} />
        <Detail label="Phone" value={pr.vendor1_phone || "—"} />
        <Detail label="SAP No" value={pr.vendor1_sap_no || "—"} />
        <Detail label="GSA / NAF / Other" value={pr.vendor1_gsa_naf_no || "—"} />
      </SectionCard>

      {(pr.vendor2_name || pr.vendor3_name) && (
        <SectionCard title="Other Vendors">
          {pr.vendor2_name && <Detail label="Vendor 2" value={pr.vendor2_name} fullWidth />}
          {pr.vendor3_name && <Detail label="Vendor 3" value={pr.vendor3_name} fullWidth />}
        </SectionCard>
      )}

      {/* Invoice */}
      {(pr.invoice_address ||
        pr.invoice_email ||
        pr.invoice_phone ||
        pr.invoice_poc) && (
        <SectionCard title="Invoice Address">
          <Detail label="Address" value={
            [pr.invoice_address, pr.invoice_line2, pr.invoice_city_state_zip]
              .filter(Boolean).join(", ") || "—"
          } fullWidth />
          <Detail label="POC" value={pr.invoice_poc || "—"} />
          <Detail label="Phone" value={pr.invoice_phone || "—"} />
          <Detail label="Email" value={pr.invoice_email || "—"} />
        </SectionCard>
      )}

      {/* Delivery */}
      {(pr.delivery_address ||
        pr.delivery_email ||
        pr.delivery_phone ||
        pr.delivery_poc) && (
        <SectionCard title="Delivery Address">
          <Detail label="Address" value={
            [pr.delivery_address, pr.delivery_line2, pr.delivery_city_state_zip]
              .filter(Boolean).join(", ") || "—"
          } fullWidth />
          <Detail label="POC" value={pr.delivery_poc || "—"} />
          <Detail label="Phone" value={pr.delivery_phone || "—"} />
          <Detail label="Email" value={pr.delivery_email || "—"} />
        </SectionCard>
      )}

      {/* Accounting */}
      <SectionCard title="Accounting">
        <Detail label="Company Code" value={pr.company_code || "—"} />
        <Detail label="Requesting Facility" value={pr.requesting_facility_code || "—"} />
        <Detail label="Internal Order" value={pr.internal_order || "—"} />
        <Detail label="Project No" value={pr.project_no || "—"} />
        <Detail label="Program" value={pr.program || "—"} />
      </SectionCard>

      {/* Items */}
      <section className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
        <header className="px-3 py-2 bg-muted/40 border-b border-border">
          <h2 className="font-semibold text-sm">
            Line Items ({pr.items?.length || 0})
          </h2>
        </header>
        <div className="divide-y divide-border">
          {(pr.items || []).map((it: PurchaseRequestItem, idx: number) => {
            const ext = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
            return (
              <div key={idx} className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-muted-foreground">
                    Item #{it.item}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {formatMoney(ext)}
                  </span>
                </div>
                <p className="text-sm leading-snug break-words">
                  {it.description || "—"}
                </p>
                {it.part_number && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Part #: <span className="font-mono">{it.part_number}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2">
                  <span className="text-muted-foreground">Qty:</span>
                  <span>
                    {it.qty} {it.unit}
                  </span>
                  <span className="text-muted-foreground">Unit Price:</span>
                  <span>{formatMoney(Number(it.unit_price) || 0)}</span>
                  {it.site && (
                    <>
                      <span className="text-muted-foreground">Site:</span>
                      <span>{it.site}</span>
                    </>
                  )}
                  {it.cost_ctr && (
                    <>
                      <span className="text-muted-foreground">Cost Ctr:</span>
                      <span>{it.cost_ctr}</span>
                    </>
                  )}
                  {it.gl_acct && (
                    <>
                      <span className="text-muted-foreground">G/L Acct:</span>
                      <span>{it.gl_acct}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Justification */}
      {(pr.justification || pr.ige_based_on) && (
        <SectionCard title="IGE & Justification">
          {pr.ige_based_on && (
            <Detail label="IGE Based On" value={pr.ige_based_on} fullWidth />
          )}
          {pr.justification && (
            <Detail label="Justification" value={pr.justification} fullWidth />
          )}
          <Detail
            label="Excess Authorized"
            value={`${pr.ige_excess_pct}%`}
          />
        </SectionCard>
      )}

      {/* Approvals */}
      {(pr.financial_analyst ||
        pr.approving_authority ||
        pr.second_approval) && (
        <SectionCard title="Approvals">
          <Detail label="Financial Analyst" value={pr.financial_analyst || "—"} />
          <Detail label="Approving Authority" value={pr.approving_authority || "—"} />
          <Detail label="Approval Date" value={formatDate(pr.approving_signature_date)} />
          {pr.second_approval && (
            <>
              <Detail label="Second Approval" value={pr.second_approval} />
              <Detail label="Second Date" value={formatDate(pr.second_signature_date)} />
            </>
          )}
        </SectionCard>
      )}

      {/* Attached items */}
      {(pr.attached_ssj ||
        pr.attached_bnj ||
        pr.attached_pws ||
        pr.attached_itpr ||
        pr.attached_other ||
        pr.attached_section_889) && (
        <SectionCard title="Attached Items">
          <div className="flex flex-wrap gap-2 col-span-2">
            {pr.attached_ssj && <Tag>SSJ</Tag>}
            {pr.attached_bnj && <Tag>BNJ</Tag>}
            {pr.attached_pws && <Tag>PWS</Tag>}
            {pr.attached_itpr && <Tag>ITPR</Tag>}
            {pr.attached_section_889 && <Tag>Section 889</Tag>}
            {pr.attached_other && <Tag>Other: {pr.attached_other}</Tag>}
          </div>
        </SectionCard>
      )}

      {/* Delete */}
      {isManagement && (
        <div className="mt-8 pt-4 border-t border-border">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.99] transition-all disabled:opacity-50 text-sm font-medium"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {deleting ? "Deleting..." : "Delete Request"}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-border bg-card p-3">
      <h2 className="font-semibold text-sm mb-2">{title}</h2>
      <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">{children}</dl>
    </section>
  );
}

function Detail({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-foreground mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary">
      {children}
    </span>
  );
}

export default function ViewPurchaseRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <ViewPurchaseRequestInner />
    </Suspense>
  );
}
