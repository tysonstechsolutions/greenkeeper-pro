"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Loader2,
  Save,
  Camera,
  Plus,
  Trash2,
  ImageIcon,
  ScanLine,
  Link2,
  Unlink,
  Wrench,
  Clock,
  Package,
  ShoppingCart,
  PackageCheck,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailPageHeader } from "@/components/ui/back-button";
import { InlineCamera } from "@/components/ui/inline-camera";
import { isNativeBarcodeAvailable, scanBarcodeNative } from "@/lib/scan/barcode";
import { useAuth } from "@/lib/hooks/useAuth";
import { useFy26Assets } from "@/lib/hooks/useFy26Assets";
import {
  conditionStatusLabels,
  conditionStatusColors,
  equipmentTypeLabels,
  equipmentStatusLabels,
  equipmentStatusColors,
  fuelTypeLabels,
} from "@/lib/hooks/useEquipment";
import { directSelectRow, directSelectList } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import { createDispositionForms, buildDispositionItem } from "@/lib/dd-forms/from-asset";
import type { Equipment } from "@/types/database";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  fy26AssetSiteLabels,
  CONDITION_PHOTO_LABELS,
  type Fy26Asset,
  type Fy26AssetStatus,
  type ConditionPhotoAngle,
  type ConditionPhotos,
  type AssetDamageRecord,
} from "@/types/fy26-assets";

// ── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value ?? "\u2014"}</span>
    </div>
  );
}

const ANGLES: ConditionPhotoAngle[] = ["front", "back", "left", "right"];

// ── Component ───────────────────────────────────────────────────────────────

function PageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { user } = useAuth();
  const {
    fetchAssetItem,
    updateStatus,
    updateAsset,
    uploadConditionPhoto,
    fetchDamageRecords,
    addDamageRecord,
    deleteDamageRecord,
    uploadDamagePhoto,
  } = useFy26Assets();

  // Core state
  const [asset, setAsset] = useState<Fy26Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<Fy26AssetStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [creatingForms, setCreatingForms] = useState(false);
  const [formsMsg, setFormsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Condition photos state
  const [conditionPhotos, setConditionPhotos] = useState<ConditionPhotos>({});
  const [uploadingAngle, setUploadingAngle] = useState<ConditionPhotoAngle | null>(null);
  const [cameraAngle, setCameraAngle] = useState<ConditionPhotoAngle | null>(null);

  // Damage records state
  const [damageRecords, setDamageRecords] = useState<AssetDamageRecord[]>([]);
  const [showDamageForm, setShowDamageForm] = useState(false);
  const [damageDate, setDamageDate] = useState("Prior to April 1 2026");
  const [damageDateCustom, setDamageDateCustom] = useState(todayLocal());
  const [damageDesc, setDamageDesc] = useState("");
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [uploadingDamagePhoto, setUploadingDamagePhoto] = useState(false);
  const [savingDamage, setSavingDamage] = useState(false);
  const [damageCamera, setDamageCamera] = useState(false);

  // Barcode linking state
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [savingBarcode, setSavingBarcode] = useState(false);
  const [barcodeManual, setBarcodeManual] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barcodeScannerRef = useRef<any>(null);

  // Linked equipment (operational) data — photos, condition, parts,
  // service history, hours. Loaded only when asset.equipment_id is set.
  // The user wants ALL the operational info on the asset page, so we
  // surface this inline rather than punting them to a separate route.
  const [linkedEquipment, setLinkedEquipment] = useState<Equipment | null>(null);
  const [partsSummary, setPartsSummary] = useState<{ needed: number; ordered: number; received: number }>({
    needed: 0,
    ordered: 0,
    received: 0,
  });
  const [lastServiceDate, setLastServiceDate] = useState<string | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [equipmentLoading, setEquipmentLoading] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await fetchAssetItem(id);
      if (cancelled) return;
      setAsset(a);
      setNotes(a?.notes ?? "");
      setConditionPhotos((a?.condition_photos as ConditionPhotos) || {});
      if (!a) setError("Asset not found.");
      setLoading(false);

      // Load damage records
      if (a) {
        const records = await fetchDamageRecords(a.id);
        if (!cancelled) setDamageRecords(records);
      }

      // Load linked operational data (photos, parts, service) when an
      // equipment record is wired up. Direct REST so it can't wedge.
      if (a?.equipment_id) {
        setEquipmentLoading(true);
        try {
          const eqId = a.equipment_id;
          const [eq, partsRows, serviceRows] = await Promise.all([
            directSelectRow<Equipment>(
              "equipment",
              "id",
              eqId,
              "*",
              "assets.view.fetchEquipment",
            ),
            directSelectList<{ status: string }>("equipment_parts", {
              columns: "status",
              filters: [`equipment_id=eq.${encodeURIComponent(eqId)}`],
              label: "assets.view.fetchPartsCounts",
            }),
            directSelectList<{ service_date: string }>(
              "equipment_service_records",
              {
                columns: "service_date",
                filters: [`equipment_id=eq.${encodeURIComponent(eqId)}`],
                orderBy: [{ column: "service_date", ascending: false }],
                limit: 50,
                label: "assets.view.fetchServiceRecords",
              },
            ),
          ]);
          if (cancelled) return;
          setLinkedEquipment(eq);
          // Roll up parts counts client-side — one round-trip is cheaper
          // than three separate count queries.
          const counts = { needed: 0, ordered: 0, received: 0 };
          for (const p of partsRows) {
            if (p.status === "needed") counts.needed += 1;
            else if (p.status === "ordered") counts.ordered += 1;
            else if (p.status === "received") counts.received += 1;
          }
          setPartsSummary(counts);
          setServiceCount(serviceRows.length);
          setLastServiceDate(serviceRows[0]?.service_date ?? null);
        } catch (err) {
          console.error("[assets.view] failed to load linked equipment:", err);
          // Non-fatal — the inventory side still works.
        } finally {
          if (!cancelled) setEquipmentLoading(false);
        }
      } else {
        // Reset operational data when there's no link.
        setLinkedEquipment(null);
        setPartsSummary({ needed: 0, ordered: 0, received: 0 });
        setLastServiceDate(null);
        setServiceCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchAssetItem, fetchDamageRecords]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSetStatus = async (s: Fy26AssetStatus) => {
    if (!asset) return;
    setSavingStatus(s);
    const updated = await updateStatus(asset.id, s);
    if (updated) setAsset(updated);
    setSavingStatus(null);
  };

  const handleCreateForms = async (a: Fy26Asset) => {
    setCreatingForms(true);
    setFormsMsg(null);
    try {
      const { filenames } = await createDispositionForms(a);
      setFormsMsg({ ok: true, text: `Created ${filenames.length} forms — saved to Documents and downloaded.` });
    } catch (e) {
      setFormsMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't create the forms." });
    } finally {
      setCreatingForms(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!asset) return;
    setSavingNotes(true);
    const updated = await updateAsset(asset.id, { notes });
    if (updated) setAsset(updated);
    setSavingNotes(false);
  };

  const handleLinkBarcode = async (value: string) => {
    if (!asset) return;
    // Strip control chars (CR/LF/NUL that barcode scanners append) and
    // collapse whitespace so the stored value matches what future scans
    // will produce. Lookups are case-insensitive so we preserve case.
    const normalized = value
      .replace(/[\u0000-\u001F\u007F]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;
    console.log("[link-barcode] raw:", JSON.stringify(value), "storing:", JSON.stringify(normalized));
    setSavingBarcode(true);
    const updated = await updateAsset(asset.id, { barcode_value: normalized } as Partial<Fy26Asset>);
    if (updated) {
      setAsset(updated);
      setShowBarcodeScanner(false);
      setBarcodeManual("");
    }
    setSavingBarcode(false);
    // Clean up scanner if running
    if (barcodeScannerRef.current) {
      try { await barcodeScannerRef.current.stop(); } catch { /* */ }
      barcodeScannerRef.current = null;
    }
  };

  const handleUnlinkBarcode = async () => {
    if (!asset) return;
    setSavingBarcode(true);
    const updated = await updateAsset(asset.id, { barcode_value: null } as Partial<Fy26Asset>);
    if (updated) setAsset(updated);
    setSavingBarcode(false);
  };

  const startBarcodeScanner = async () => {
    // Native path: use ML Kit. One-shot full-screen scanner.
    if (isNativeBarcodeAvailable()) {
      const raw = await scanBarcodeNative();
      if (raw) handleLinkBarcode(raw);
      return;
    }

    // Web path: html5-qrcode inline video.
    try {
      const mod = await import("html5-qrcode");
      const scanner = new mod.Html5Qrcode("barcode-link-viewport");
      barcodeScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 2.0 },
        (decodedText) => {
          scanner.stop().then(() => handleLinkBarcode(decodedText)).catch(() => {});
        },
        () => {}
      );
    } catch {
      // Camera error — fall back to manual entry
    }
  };

  // Cleanup barcode scanner on unmount
  useEffect(() => {
    return () => {
      if (barcodeScannerRef.current) {
        barcodeScannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleConditionPhotoUpload = async (angle: ConditionPhotoAngle, file: File) => {
    if (!asset) {
      setUploadError("Asset not loaded — please refresh the page.");
      return;
    }
    if (!user?.id) {
      setUploadError("You must be signed in to upload photos. Try signing out and back in.");
      return;
    }
    setUploadError(null);
    setUploadingAngle(angle);
    try {
      // Pass the current in-memory photo map so uploadConditionPhoto
      // can merge client-side and skip the pre-update SELECT that was
      // silently hanging after storage uploads.
      const url = await uploadConditionPhoto(
        asset.id,
        angle,
        file,
        user.id,
        conditionPhotos,
      );
      if (url) {
        setConditionPhotos((prev) => ({ ...prev, [angle]: url }));
      } else {
        setUploadError(
          "Photo upload failed. Check your internet connection and that the photos bucket RLS policies are applied."
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploadingAngle(null);
    }
  };

  const handleDeleteConditionPhoto = async (angle: ConditionPhotoAngle) => {
    if (!asset) return;
    if (!window.confirm(`Delete the ${CONDITION_PHOTO_LABELS[angle]} photo? This can't be undone.`)) {
      return;
    }
    setUploadError(null);
    // Build new photo map without this angle
    const newPhotos: ConditionPhotos = { ...conditionPhotos };
    delete newPhotos[angle];
    // Optimistic UI
    const previous = conditionPhotos;
    setConditionPhotos(newPhotos);
    const updated = await updateAsset(asset.id, { condition_photos: newPhotos });
    if (updated) {
      setAsset(updated);
    } else {
      // Revert on failure
      setConditionPhotos(previous);
      setUploadError("Could not delete photo. Please try again.");
    }
  };

  const handleDamagePhotoUpload = async (file: File) => {
    if (!user?.id) {
      setUploadError("You must be signed in to upload damage photos.");
      return;
    }
    setUploadError(null);
    setUploadingDamagePhoto(true);
    try {
      const url = await uploadDamagePhoto(file, user.id);
      if (url) {
        setDamagePhotos((prev) => [...prev, url]);
      } else {
        setUploadError("Damage photo upload failed.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Damage photo upload failed.");
    } finally {
      setUploadingDamagePhoto(false);
    }
  };

  const handleSaveDamage = async () => {
    if (!asset || !damageDesc.trim()) return;
    setSavingDamage(true);
    const finalDate = damageDate === "__custom__" ? damageDateCustom : damageDate;
    const record = await addDamageRecord(asset.id, {
      damage_date: finalDate,
      description: damageDesc.trim(),
      photos: damagePhotos,
      reported_by: user?.id,
    });
    if (record) {
      setDamageRecords((prev) => [record, ...prev]);
      setShowDamageForm(false);
      setDamageDesc("");
      setDamagePhotos([]);
      setDamageDate("Prior to April 1 2026");
    }
    setSavingDamage(false);
  };

  const handleDeleteDamage = async (recordId: string) => {
    const ok = await deleteDamageRecord(recordId);
    if (ok) setDamageRecords((prev) => prev.filter((r) => r.id !== recordId));
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-4 md:p-6">
        <DetailPageHeader backHref="/assets" backLabel="Back to Assets" title="Asset" />
        <p className="text-muted-foreground">{error || "Asset not found."}</p>
      </div>
    );
  }

  const statusColor = fy26AssetStatusColors[asset.status];
  const formatMoney = (v: number | null | undefined) =>
    v == null ? "\u2014" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const statusButtons: { status: Fy26AssetStatus; label: string; icon: typeof CheckCircle }[] = [
    { status: "verified_present", label: "Present", icon: CheckCircle },
    { status: "no_asset_tag", label: "No Asset Tag", icon: ScanLine },
    { status: "mia", label: "MIA", icon: AlertTriangle },
    { status: "unverified", label: "Unverified", icon: HelpCircle },
    { status: "needs_disposed", label: "Needs Disposed", icon: Trash2 },
    { status: "disposed", label: "Disposed", icon: XCircle },
  ];

  return (
    <div className="p-4 md:p-6 pb-24">
      <DetailPageHeader
        backHref="/assets"
        backLabel="Back to Assets"
        title={asset.description}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs">
              {asset.asset_number}
              {asset.sub_number && asset.sub_number !== "0" && ` / sub ${asset.sub_number}`}
            </span>
            <Badge
              variant="outline"
              style={{
                backgroundColor: `${statusColor}15`,
                borderColor: statusColor,
                color: statusColor,
              }}
            >
              {fy26AssetStatusLabels[asset.status]}
            </Badge>
          </span>
        }
      />

      {/* Upload error banner */}
      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-400 flex-1">
              {uploadError}
            </p>
            <button
              onClick={() => setUploadError(null)}
              className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Status action buttons */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Mark status</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {statusButtons.map(({ status, label, icon: Icon }) => {
              const isCurrent = asset.status === status;
              const color = fy26AssetStatusColors[status];
              return (
                <Button
                  key={status}
                  variant={isCurrent ? "default" : "outline"}
                  onClick={() => handleSetStatus(status)}
                  disabled={savingStatus !== null}
                  style={
                    isCurrent
                      ? { backgroundColor: color, borderColor: color, color: "white" }
                      : { borderColor: color, color }
                  }
                  className="justify-start"
                >
                  {savingStatus === status ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4 mr-2" />
                  )}
                  {label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Disposition paperwork — for a needs-disposed / disposed asset, jump
          straight to the real Certificate of Disposition (2212) or DD-200,
          prefilled with this asset's site, description, value, and reason. */}
      {(asset.status === "needs_disposed" || asset.status === "disposed") && (() => {
        const dispReason = asset.notes?.trim() || "Beyond economical repair";
        const base: Record<string, string> = {
          site: asset.site,
          asset: asset.description,
          item: buildDispositionItem(asset),
          unitCost: asset.original_value != null ? String(asset.original_value) : "",
          reason: dispReason,
        };
        const qty = String(asset.qty ?? 1);
        const url2212 = `/dd-forms/2212?${new URLSearchParams({ ...base, units: qty }).toString()}`;
        const url200 = `/dd-forms/200?${new URLSearchParams({ ...base, qty }).toString()}`;
        return (
          <Card className="mb-4 border-orange-300 dark:border-orange-800">
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-orange-600" />
                Disposition paperwork
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Create both forms for this asset (Certificate of Disposition + DD-200),
                prefilled from its description, value, site, and reason — then save or print.
              </p>
              <Button
                onClick={() => handleCreateForms(asset)}
                disabled={creatingForms}
                className="w-full"
                style={{ backgroundColor: "#ea580c", borderColor: "#ea580c", color: "white" }}
              >
                {creatingForms ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Create both forms (2212 + DD-200)
              </Button>
              {formsMsg && (
                <p className={`text-xs mt-2 ${formsMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                  {formsMsg.text}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-3 mb-1.5">
                Or open one to review / edit first:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link href={url2212}>
                    <FileText className="w-4 h-4 mr-2" />
                    2212 (Disposition)
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link href={url200}>
                    <FileText className="w-4 h-4 mr-2" />
                    DD-200 (Property Loss)
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══ Operational Information (linked equipment) ═══
          Shows the day-to-day operational data — condition, parts ordered,
          service history, hours. Photos live in the Condition Photos
          section above (single source of truth). When the asset isn't
          linked to an equipment record yet, offer to scan/create one so
          the user can start tracking that side of things from here. */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">
              <Wrench className="w-4 h-4 inline mr-1.5" />
              Operational Information
            </p>
            {linkedEquipment && asset.equipment_id && (
              // Quick link to the full operational view (parts add/remove,
              // inspections, service records, edit equipment fields).
              // Until that view fully migrates onto this page, the deep
              // workflows live there.
              <Link
                href={`/equipment/view?id=${asset.equipment_id}`}
                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Manage
              </Link>
            )}
          </div>

          {equipmentLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !linkedEquipment ? (
            <div className="text-center py-4 border border-dashed border-border/60 rounded-lg">
              <Wrench className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">
                No operational record linked yet.
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Link this asset to track photos, parts, inspections, and service.
              </p>
              <Link
                href="/assets/scan"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
              >
                <ScanLine className="w-3.5 h-3.5" />
                Scan to link
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status + condition badges */}
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  style={{
                    backgroundColor: `${equipmentStatusColors[linkedEquipment.status]}15`,
                    borderColor: equipmentStatusColors[linkedEquipment.status],
                    color: equipmentStatusColors[linkedEquipment.status],
                  }}
                  className="text-xs"
                >
                  {equipmentStatusLabels[linkedEquipment.status]}
                </Badge>
                <Badge
                  variant="outline"
                  style={{
                    backgroundColor: `${conditionStatusColors[linkedEquipment.condition_status]}15`,
                    borderColor: conditionStatusColors[linkedEquipment.condition_status],
                    color: conditionStatusColors[linkedEquipment.condition_status],
                  }}
                  className="text-xs"
                >
                  {conditionStatusLabels[linkedEquipment.condition_status]}
                </Badge>
                {linkedEquipment.equipment_type && (
                  <Badge variant="secondary" className="text-xs">
                    {equipmentTypeLabels[linkedEquipment.equipment_type]}
                  </Badge>
                )}
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {linkedEquipment.current_hours !== null && (
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <Clock className="w-3 h-3" /> Hours
                    </div>
                    <p className="font-semibold text-sm">
                      {linkedEquipment.current_hours.toLocaleString()}
                    </p>
                  </div>
                )}
                {lastServiceDate && (
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <Wrench className="w-3 h-3" /> Last serviced
                    </div>
                    <p className="font-semibold text-sm">
                      {new Date(`${lastServiceDate}T12:00:00`).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "short", day: "numeric" },
                      )}
                    </p>
                  </div>
                )}
                {serviceCount > 0 && (
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <Package className="w-3 h-3" /> Service records
                    </div>
                    <p className="font-semibold text-sm">{serviceCount}</p>
                  </div>
                )}
                {linkedEquipment.fuel_type && (
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="text-muted-foreground mb-0.5">Fuel</div>
                    <p className="font-semibold text-sm">
                      {fuelTypeLabels[linkedEquipment.fuel_type]}
                    </p>
                  </div>
                )}
              </div>

              {/* Parts summary */}
              {(partsSummary.needed > 0 ||
                partsSummary.ordered > 0 ||
                partsSummary.received > 0) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Parts
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-md border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20">
                      <div className="flex items-center gap-1 text-orange-700 dark:text-orange-400 text-[10px] uppercase tracking-wide mb-0.5">
                        <ShoppingCart className="w-3 h-3" /> Needed
                      </div>
                      <p className="font-bold text-base">{partsSummary.needed}</p>
                    </div>
                    <div className="p-2 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20">
                      <div className="flex items-center gap-1 text-yellow-700 dark:text-yellow-400 text-[10px] uppercase tracking-wide mb-0.5">
                        <PackageCheck className="w-3 h-3" /> Ordered
                      </div>
                      <p className="font-bold text-base">{partsSummary.ordered}</p>
                    </div>
                    <div className="p-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
                      <div className="flex items-center gap-1 text-green-700 dark:text-green-400 text-[10px] uppercase tracking-wide mb-0.5">
                        <CheckCircle className="w-3 h-3" /> Received
                      </div>
                      <p className="font-bold text-base">{partsSummary.received}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Parts needed text (legacy field) */}
              {linkedEquipment.parts_needed && (
                <div className="p-2 rounded-md bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-900/50">
                  <p className="text-[10px] uppercase tracking-wide text-orange-700 dark:text-orange-400 mb-0.5">
                    Parts notes
                  </p>
                  <p className="text-xs">{linkedEquipment.parts_needed}</p>
                </div>
              )}

              {/* Notes from operational record */}
              {linkedEquipment.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Operational notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {linkedEquipment.notes}
                  </p>
                </div>
              )}

              {/* Manage button to open full operational workflow */}
              <Link
                href={`/equipment/view?id=${asset.equipment_id}`}
                className="block w-full text-center px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium"
              >
                <Wrench className="w-4 h-4 inline mr-1.5" />
                Manage parts, service, & inspections
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Asset Barcode Link ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">
              <ScanLine className="w-4 h-4 inline mr-1.5" />
              Asset Barcode
            </p>
            {asset.barcode_value && !showBarcodeScanner && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleUnlinkBarcode}
                disabled={savingBarcode}
              >
                <Unlink className="w-3 h-3 mr-1" />
                Unlink
              </Button>
            )}
          </div>

          {asset.barcode_value && !showBarcodeScanner ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <Link2 className="w-4 h-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">Barcode linked</p>
                <p className="text-sm font-mono truncate">{asset.barcode_value}</p>
              </div>
            </div>
          ) : !showBarcodeScanner ? (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground mb-2">No barcode linked yet. Scan the asset tag to connect it.</p>
              <Button size="sm" onClick={() => { setShowBarcodeScanner(true); setTimeout(startBarcodeScanner, 100); }}>
                <ScanLine className="w-4 h-4 mr-1.5" />
                Link Barcode
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                id="barcode-link-viewport"
                className="rounded-lg overflow-hidden bg-black min-h-[160px]"
              />
              <p className="text-xs text-center text-muted-foreground">Point camera at the asset barcode tag</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Or type barcode manually..."
                  value={barcodeManual}
                  onChange={(e) => setBarcodeManual(e.target.value)}
                  className="flex-1 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!barcodeManual.trim() || savingBarcode}
                  onClick={() => handleLinkBarcode(barcodeManual)}
                >
                  {savingBarcode ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={async () => {
                  if (barcodeScannerRef.current) {
                    try { await barcodeScannerRef.current.stop(); } catch { /* */ }
                    barcodeScannerRef.current = null;
                  }
                  setShowBarcodeScanner(false);
                  setBarcodeManual("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Condition Photos (Front / Back / Left / Right) ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">
            <Camera className="w-4 h-4 inline mr-1.5" />
            Condition Photos
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ANGLES.map((angle) => {
              const url = conditionPhotos[angle];
              const isUploading = uploadingAngle === angle;
              return (
                <div key={angle} className="flex flex-col items-center">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    {CONDITION_PHOTO_LABELS[angle]}
                  </p>
                  {url ? (
                    <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted group">
                      <button
                        className="absolute inset-0"
                        onClick={() => setCameraAngle(angle)}
                        aria-label={`Retake ${CONDITION_PHOTO_LABELS[angle]} photo`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${CONDITION_PHOTO_LABELS[angle]} view`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-6 h-6 text-white" />
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConditionPhoto(angle);
                        }}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md z-10"
                        aria-label={`Delete ${CONDITION_PHOTO_LABELS[angle]} photo`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => setCameraAngle(angle)}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground/50">Tap to add</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Damage Documentation ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 inline mr-1.5 text-red-500" />
              Damage Documentation
            </p>
            {!showDamageForm && (
              <Button size="sm" variant="outline" onClick={() => setShowDamageForm(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Log Damage
              </Button>
            )}
          </div>

          {/* Add damage form */}
          {showDamageForm && (
            <div className="border border-red-200 dark:border-red-900 rounded-lg p-4 mb-4 bg-red-50/50 dark:bg-red-950/20 space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">When did the damage occur? *</label>
                <Select value={damageDate} onValueChange={setDamageDate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Prior to April 1 2026">Prior to April 1, 2026</SelectItem>
                    <SelectItem value={todayLocal()}>
                      Today ({new Date().toLocaleDateString()})
                    </SelectItem>
                    <SelectItem value="__custom__">Other date...</SelectItem>
                  </SelectContent>
                </Select>
                {damageDate === "__custom__" && (
                  <Input
                    type="date"
                    value={damageDateCustom}
                    onChange={(e) => setDamageDateCustom(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Describe the damage *</label>
                <Textarea
                  value={damageDesc}
                  onChange={(e) => setDamageDesc(e.target.value)}
                  placeholder="What happened? Where on the equipment is the damage? How did it happen?"
                  rows={3}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1.5">Damage Photos</label>
                <div className="flex flex-wrap gap-2">
                  {damagePhotos.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Damage ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                        onClick={() => setDamagePhotos((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-red-400 transition-colors"
                    onClick={() => setDamageCamera(true)}
                    disabled={uploadingDamagePhoto}
                  >
                    {uploadingDamagePhoto ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDamageForm(false);
                    setDamageDesc("");
                    setDamagePhotos([]);
                    setDamageDate("Prior to April 1 2026");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!damageDesc.trim() || savingDamage}
                  onClick={handleSaveDamage}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {savingDamage ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-1.5" />
                  )}
                  Save Damage Record
                </Button>
              </div>
            </div>
          )}

          {/* Damage records list */}
          {damageRecords.length > 0 ? (
            <div className="space-y-3">
              {damageRecords.map((record) => (
                <div
                  key={record.id}
                  className="border border-red-200 dark:border-red-900 rounded-lg p-3 bg-red-50/30 dark:bg-red-950/10"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-red-300 text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30"
                      >
                        {record.damage_date}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      onClick={() => handleDeleteDamage(record.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap mt-1">
                    {record.description}
                  </p>
                  {record.photos && record.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {record.photos.map((url, i) => (
                        <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Damage photo ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Logged {new Date(record.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : !showDamageForm ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              No damage documented yet.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ═══ Asset Details ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-2">Asset details</p>
          <DetailRow label="Site" value={fy26AssetSiteLabels[asset.site] ?? asset.site} />
          <DetailRow label="Cost Center" value={asset.cost_center} />
          <DetailRow label="Resp. Cost Center" value={asset.resp_cost_center} />
          <DetailRow
            label="Asset #"
            value={<span className="font-mono">{asset.asset_number}</span>}
          />
          {asset.sub_number && asset.sub_number !== "0" && (
            <DetailRow label="Sub #" value={<span className="font-mono">{asset.sub_number}</span>} />
          )}
          {asset.license_plate && (
            <DetailRow label="License Plate" value={<span className="font-mono">{asset.license_plate}</span>} />
          )}
          <DetailRow label="Qty" value={asset.qty} />
          <DetailRow label="Manufacturer" value={asset.manufacturer} />
          <DetailRow label="Model / Main Text" value={asset.model_text} />
          <DetailRow
            label="Serial #"
            value={asset.serial_number ? <span className="font-mono">{asset.serial_number}</span> : null}
          />
          <DetailRow label="Original Value" value={formatMoney(asset.original_value)} />
          <DetailRow
            label="Linked Equipment"
            value={
              asset.equipment_id ? (
                // Must use Next.js <Link>, not a raw <a>. A raw anchor
                // navigates to the literal href, which in Capacitor's
                // static-file LocalServer doesn't match `/equipment/view`
                // (the on-disk path is `/equipment/view/index.html`).
                // That 404 triggers the SPA fallback to /index.html,
                // where page.tsx redirects to /dashboard — the "clicks
                // bounce me to dashboard" bug. <Link> uses Next's router
                // which respects trailingSlash:true and emits the
                // correct URL.
                <Link
                  href={`/equipment/view?id=${asset.equipment_id}`}
                  className="text-primary underline"
                >
                  Open equipment record
                </Link>
              ) : (
                // No equipment record yet — the scan wizard creates one
                // on step 2. Direct the user there instead of leaving a
                // dead row. Scanning auto-matches the tag, then the
                // wizard auto-links the barcode and creates the
                // equipment record with the asset's description /
                // manufacturer / model / serial pre-filled.
                <Link
                  href="/assets/scan"
                  className="text-muted-foreground underline decoration-dotted"
                >
                  Scan to create equipment record
                </Link>
              )
            }
          />
          {asset.verified_at && (
            <DetailRow
              label="Last updated"
              value={new Date(asset.verified_at).toLocaleString()}
            />
          )}
        </CardContent>
      </Card>

      {/* ═══ Notes ═══ */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-2">Notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this asset (location, condition, where last seen, etc.)"
            rows={4}
          />
          <div className="flex justify-end mt-2">
            <Button onClick={handleSaveNotes} disabled={savingNotes || notes === (asset.notes ?? "")}>
              {savingNotes ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save notes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline Camera for condition photos */}
      <InlineCamera
        open={!!cameraAngle}
        onCapture={(file) => {
          if (cameraAngle) handleConditionPhotoUpload(cameraAngle, file);
          setCameraAngle(null);
        }}
        onClose={() => setCameraAngle(null)}
      />

      {/* Inline Camera for damage photos */}
      <InlineCamera
        open={damageCamera}
        onCapture={(file) => {
          handleDamagePhotoUpload(file);
          setDamageCamera(false);
        }}
        onClose={() => setDamageCamera(false)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="text-sm text-muted-foreground animate-pulse">Loading…</div></div>}>
      <PageContent />
    </Suspense>
  );
}
