"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DetailPageHeader } from "@/components/ui/back-button";
import { useFy26Assets } from "@/lib/hooks/useFy26Assets";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  fy26AssetSiteLabels,
  type Fy26Asset,
  type Fy26AssetStatus,
} from "@/types/fy26-assets";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value ?? "\u2014"}</span>
    </div>
  );
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { fetchAssetItem, updateStatus, updateAsset } = useFy26Assets();

  const [asset, setAsset] = useState<Fy26Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<Fy26AssetStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await fetchAssetItem(id);
      if (cancelled) return;
      setAsset(a);
      setNotes(a?.notes ?? "");
      if (!a) setError("Asset not found.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchAssetItem]);

  const handleSetStatus = async (s: Fy26AssetStatus) => {
    if (!asset) return;
    setSavingStatus(s);
    const updated = await updateStatus(asset.id, s);
    if (updated) setAsset(updated);
    setSavingStatus(null);
  };

  const handleSaveNotes = async () => {
    if (!asset) return;
    setSavingNotes(true);
    const updated = await updateAsset(asset.id, { notes });
    if (updated) setAsset(updated);
    setSavingNotes(false);
  };

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
    { status: "mia", label: "MIA", icon: AlertTriangle },
    { status: "unverified", label: "Unverified", icon: HelpCircle },
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

      {/* Status action buttons */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Mark status</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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

      {/* Details */}
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
          {asset.equipment_id && (
            <DetailRow
              label="Linked Equipment"
              value={
                <a
                  href={`/equipment/${asset.equipment_id}`}
                  className="text-primary underline"
                >
                  Open equipment record
                </a>
              }
            />
          )}
          {asset.verified_at && (
            <DetailRow
              label="Last updated"
              value={new Date(asset.verified_at).toLocaleString()}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
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
    </div>
  );
}
