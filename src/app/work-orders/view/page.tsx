"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { generateWorkOrderBlob, type WorkOrderData } from "@/lib/reports/work-order-report";
import { workOrderPdfFilename, workOrderDisplayName } from "@/lib/reports/wo-naming";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

// ── DB row type ──────────────────────────────────────────────────────────────

interface WorkOrderRow {
  id: string;
  wo_sequence_number: number | null;
  date_submitted: string;
  nature_of_request: string | null;
  facility_bldg: string | null;
  program_area_room: string | null;
  cost_center: string | null;
  description_of_work: string;
  work_type: string | null;
  primary_poc_email: string | null;
  primary_poc_phone: string | null;
  secondary_poc_name: string | null;
  secondary_poc_phone: string | null;
  number_of_enclosures: string | null;
  photos: string[] | null;
  status: string;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateMmDdYyyy(iso: string): string {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(anchored);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-muted text-muted-foreground" },
  submitted: { label: "Submitted", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  sent: { label: "Sent", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  completed: { label: "Completed", badge: "bg-green-600/10 text-green-700 dark:text-green-400" },
};

// ── Inner component ─────────────────────────────────────────────────────────

function ViewWorkOrderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { profile, loading: authLoading } = useAuth();

  const isManagement =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm" ||
    profile?.role === "foreman";

  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing work order id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr) setError(fetchErr.message);
      else if (!data) setError("Not found");
      else setWo(data as unknown as WorkOrderRow);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDownload() {
    if (!wo) return;
    setDownloading(true);
    setError(null);
    try {
      const data: WorkOrderData = {
        date: formatDateMmDdYyyy(wo.date_submitted),
        facilityBldg: wo.facility_bldg ?? "",
        programAreaRoom: wo.program_area_room ?? "",
        costCenter: wo.cost_center ?? "",
        descriptionOfWork: wo.description_of_work,
        workType: wo.work_type ?? "",
        primaryPocEmail: wo.primary_poc_email ?? "",
        primaryPocPhone: wo.primary_poc_phone ?? "",
        numberOfEnclosures: wo.number_of_enclosures ?? "0",
        secondaryPocName: wo.secondary_poc_name ?? "",
        secondaryPocPhone: wo.secondary_poc_phone ?? "",
        photos: wo.photos ?? undefined,
      };
      const blob = await generateWorkOrderBlob(data);
      const filename = workOrderPdfFilename(
        wo.wo_sequence_number,
        wo.date_submitted,
      );
      await saveBlobToDevice({
        blob,
        filename,
        shareTitle: "MWR Facilities Maintenance Work Order",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate PDF",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!wo) return;
    if (!confirm("Delete this work order? This cannot be undone.")) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("work_orders")
      .delete()
      .eq("id", wo.id);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.push("/work-orders");
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (error && !wo) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/work-orders"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">Work Order</h1>
        </div>
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!wo) return null;

  const statusInfo = STATUS_LABELS[wo.status] ?? STATUS_LABELS.submitted;
  const displayName = workOrderDisplayName(
    wo.wo_sequence_number,
    wo.date_submitted,
  );

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/work-orders"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">
            {displayName}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {wo.facility_bldg || "No facility"}
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Work Order
            </p>
            <p className="text-lg font-bold text-primary flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              #{wo.wo_sequence_number?.toString().padStart(3, "0") ?? "—"}
            </p>
          </div>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded shrink-0 ${statusInfo.badge}`}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Download button */}
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? "Generating PDF..." : "Download Work Order PDF"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Details */}
      <SectionCard title="Header">
        <Detail label="Date Submitted" value={formatDate(wo.date_submitted)} />
        <Detail
          label="Work Order #"
          value={
            wo.wo_sequence_number
              ? `#${wo.wo_sequence_number.toString().padStart(3, "0")}`
              : "—"
          }
        />
        <Detail
          label="Nature of Request"
          value={wo.nature_of_request || "—"}
        />
        <Detail label="Work Type" value={wo.work_type || "—"} />
      </SectionCard>

      <SectionCard title="Location">
        <Detail label="Facility / Bldg #" value={wo.facility_bldg || "—"} />
        <Detail
          label="Program Area / Room"
          value={wo.program_area_room || "—"}
        />
        <Detail label="Cost Center" value={wo.cost_center || "—"} />
      </SectionCard>

      <SectionCard title="Description of Work">
        <div className="col-span-2">
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {wo.description_of_work}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Points of Contact">
        <Detail
          label="Primary POC Email"
          value={wo.primary_poc_email || "—"}
        />
        <Detail
          label="Primary POC Phone"
          value={wo.primary_poc_phone || "—"}
        />
        <Detail
          label="Secondary POC Name"
          value={wo.secondary_poc_name || "—"}
        />
        <Detail
          label="Secondary POC Phone"
          value={wo.secondary_poc_phone || "—"}
        />
      </SectionCard>

      <SectionCard title="Enclosures">
        <Detail
          label="Number of Enclosures"
          value={wo.number_of_enclosures || "0"}
        />
      </SectionCard>

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
            {deleting ? "Deleting..." : "Delete Work Order"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared UI components ─────────────────────────────────────────────────────

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
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-foreground mt-0.5 break-words">{value}</dd>
    </div>
  );
}

// ── Page export ──────────────────────────────────────────────────────────────

export default function ViewWorkOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <ViewWorkOrderInner />
    </Suspense>
  );
}
