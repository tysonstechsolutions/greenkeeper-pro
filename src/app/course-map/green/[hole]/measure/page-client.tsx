"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Ruler,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useGreenMeasurements,
  type MeasurementType,
  type GreenMeasurement,
} from "@/lib/hooks/useGreenMeasurements";
import type { SavedPolygon } from "@/components/features/map/polygon-measure-map";

// react-leaflet has to render client-only — dynamic import avoids SSR errors
const PolygonMeasureMap = dynamic(
  () =>
    import("@/components/features/map/polygon-measure-map").then(
      (m) => m.PolygonMeasureMap
    ),
  { ssr: false }
);

// VMGC course center. Works as a reasonable default — user pans/zooms
// to their specific green, which is max ~300 yards from this point.
const VMGC_CENTER: [number, number] = [42.3011, -87.8307];

const TYPE_LABELS: Record<MeasurementType, string> = {
  green: "Green (outline)",
  moss: "Moss patch",
  disease: "Disease patch",
  damage: "Damage",
  other: "Other",
};

const TYPE_COLORS: Record<MeasurementType, string> = {
  green: "#22c55e",
  moss: "#78716c",
  disease: "#ef4444",
  damage: "#f59e0b",
  other: "#6b7280",
};

function formatArea(sqft: number): string {
  if (sqft < 10) return `${sqft.toFixed(1)} ft²`;
  return `${Math.round(sqft).toLocaleString()} ft²`;
}

export default function RouteContent() {
  const params = useParams<{ hole: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const holeNumber = Number(params?.hole ?? "0") || null;

  const { items, loading, create, remove, totals, error } =
    useGreenMeasurements(holeNumber);

  const [drawing, setDrawing] = useState(false);
  const [drawType, setDrawType] = useState<MeasurementType>("moss");
  const [drawLabel, setDrawLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Initial map center — start at the VMGC course. If this green already
  // has an outline, center on it so the user is zoomed right in.
  const mapCenter = useMemo<[number, number]>(() => {
    const greenOutline = items.find((m) => m.measurement_type === "green");
    if (greenOutline) {
      const ring = greenOutline.geojson.coordinates[0];
      let latSum = 0;
      let lngSum = 0;
      for (const [lng, lat] of ring) {
        latSum += lat;
        lngSum += lng;
      }
      return [latSum / ring.length, lngSum / ring.length];
    }
    return VMGC_CENTER;
  }, [items]);

  const referencePolygons = useMemo(
    () =>
      items
        .filter((m) => m.measurement_type !== drawType || !drawing)
        .map((m) => ({
          coordinates: m.geojson.coordinates[0] as [number, number][],
          color: TYPE_COLORS[m.measurement_type],
          label: m.label ?? TYPE_LABELS[m.measurement_type],
        })),
    [items, drawType, drawing]
  );

  const handleSave = async (poly: SavedPolygon) => {
    if (!holeNumber) return;
    setSaving(true);
    const created = await create({
      hole_number: holeNumber,
      measurement_type: drawType,
      label: drawLabel.trim() || null,
      coordinates: poly.coordinates,
      area_sq_ft: poly.areaSqFt,
      perimeter_ft: poly.perimeterFt,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (created) {
      setDrawing(false);
      setDrawLabel("");
    }
  };

  const handleDelete = async (m: GreenMeasurement) => {
    if (
      !window.confirm(
        `Delete "${m.label ?? TYPE_LABELS[m.measurement_type]}" (${formatArea(m.area_sq_ft)})?`
      )
    )
      return;
    await remove(m.id);
  };

  useEffect(() => {
    if (!holeNumber) router.replace("/course-map");
  }, [holeNumber, router]);

  if (!holeNumber) return null;

  const greenOutline = items.find((m) => m.measurement_type === "green");
  const mossPatches = items.filter((m) => m.measurement_type === "moss");
  const otherPatches = items.filter(
    (m) => m.measurement_type !== "green" && m.measurement_type !== "moss"
  );

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/course-map/green/${holeNumber}`)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Ruler className="w-5 h-5 text-primary" />
            Measure Hole {holeNumber}
          </h1>
          <p className="text-xs text-muted-foreground">
            Draw polygons on the satellite map to measure square footage
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* New measurement launcher */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">New measurement</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={drawType}
              onValueChange={(v) => setDrawType(v as MeasurementType)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="green">Green (outline)</SelectItem>
                <SelectItem value="moss">Moss patch</SelectItem>
                <SelectItem value="disease">Disease patch</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Label (optional) — e.g. front-left corner"
              value={drawLabel}
              onChange={(e) => setDrawLabel(e.target.value)}
              className="flex-1"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => setDrawing(true)}
            disabled={drawing}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Start drawing on map
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Tap vertices around the shape on the satellite map. The
            square footage updates live. Tap Save when done.
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      {items.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Totals</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {greenOutline && (
                <>
                  <span className="text-muted-foreground">Green area:</span>
                  <span className="text-right font-medium">
                    {formatArea(Number(greenOutline.area_sq_ft))}
                  </span>
                </>
              )}
              {mossPatches.length > 0 && (
                <>
                  <span className="text-muted-foreground">
                    Moss patches ({mossPatches.length}):
                  </span>
                  <span className="text-right font-medium text-stone-700 dark:text-stone-400">
                    {formatArea(totals.byType.moss ?? 0)}
                  </span>
                </>
              )}
              {greenOutline && mossPatches.length > 0 && (
                <>
                  <span className="text-muted-foreground">
                    % affected:
                  </span>
                  <span className="text-right font-medium">
                    {(
                      ((totals.byType.moss ?? 0) /
                        Number(greenOutline.area_sq_ft)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </>
              )}
              {otherPatches.length > 0 && (
                <>
                  <span className="text-muted-foreground">
                    Other patches ({otherPatches.length}):
                  </span>
                  <span className="text-right font-medium">
                    {formatArea(
                      otherPatches.reduce(
                        (s, m) => s + Number(m.area_sq_ft),
                        0
                      )
                    )}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <p className="text-sm font-semibold mb-2">Measurements</p>
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No measurements yet. Start with the green outline, then add
          moss/disease patches inside it.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((m) => {
            const color = TYPE_COLORS[m.measurement_type];
            const Icon =
              m.measurement_type === "green"
                ? CheckCircle
                : m.measurement_type === "moss"
                  ? Leaf
                  : AlertTriangle;
            return (
              <Card key={m.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {m.label || TYPE_LABELS[m.measurement_type]}
                      </span>
                      <Badge
                        variant="outline"
                        style={{ borderColor: color, color }}
                        className="text-[10px]"
                      >
                        {TYPE_LABELS[m.measurement_type]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatArea(Number(m.area_sq_ft))}
                      {m.perimeter_ft != null &&
                        ` · ${Math.round(Number(m.perimeter_ft))} ft perimeter`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(m)}
                    className="shrink-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Drawing overlay */}
      {drawing && (
        <PolygonMeasureMap
          center={mapCenter}
          initialZoom={20}
          referencePolygons={referencePolygons}
          saving={saving}
          onCancel={() => setDrawing(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
