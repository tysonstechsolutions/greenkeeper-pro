"use client";

/**
 * Tap-to-draw polygon measurement map.
 *
 * User taps vertices on a satellite view. Live square footage is shown
 * as they build the polygon. On Save, the parent receives the GeoJSON
 * ring (lng/lat) and pre-computed area. Used for both the overall
 * green outline and for moss / disease patches inside a green.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  polygonAreaSquareFeet,
  polygonPerimeterFeet,
} from "@/lib/utils/geo-area";
import { Button } from "@/components/ui/button";
import { Undo2, Check, Trash2, Loader2, MapPin } from "lucide-react";

// Vertices stored as [lat, lng] since Leaflet uses that ordering
// internally. We convert to [lng, lat] at save time for GeoJSON.
type LatLng = [number, number];

// Fix Leaflet default icon URLs under Next.js webpack
delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const GOOGLE_SATELLITE_URL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
const GOOGLE_SATELLITE_MAX_ZOOM = 22;

export interface SavedPolygon {
  /** GeoJSON-style ring, [lng, lat] ordered, closed. */
  coordinates: [number, number][];
  areaSqFt: number;
  perimeterFt: number;
}

interface PolygonMeasureMapProps {
  /** Map center and initial zoom. Use the hole's green location. */
  center: LatLng;
  initialZoom?: number;
  /** Optional existing polygon to show as read-only reference. */
  referencePolygons?: Array<{
    coordinates: [number, number][]; // [lng, lat]
    color: string;
    label?: string;
  }>;
  /** Optional polygon to seed the drawing with (for edit mode). */
  initialPolygon?: [number, number][]; // [lng, lat]
  saving?: boolean;
  onCancel: () => void;
  onSave: (poly: SavedPolygon) => void;
}

function MapClickHandler({
  onClick,
}: {
  onClick: (ll: LatLng) => void;
}) {
  useMapEvents({
    click: (e) => onClick([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

export function PolygonMeasureMap({
  center,
  initialZoom = 20,
  referencePolygons = [],
  initialPolygon,
  saving = false,
  onCancel,
  onSave,
}: PolygonMeasureMapProps) {
  // Convert initial GeoJSON ring (if any) to Leaflet [lat, lng] order,
  // and drop the closing duplicate point if present.
  const [vertices, setVertices] = useState<LatLng[]>(() => {
    if (!initialPolygon || initialPolygon.length < 3) return [];
    const ring = initialPolygon.map(([lng, lat]) => [lat, lng] as LatLng);
    if (
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
    ) {
      ring.pop();
    }
    return ring;
  });

  const mapRef = useRef<L.Map | null>(null);

  const handleMapClick = useCallback((ll: LatLng) => {
    setVertices((prev) => [...prev, ll]);
  }, []);

  const undoLast = () => {
    setVertices((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    setVertices([]);
  };

  // Convert vertices [lat, lng] → GeoJSON [lng, lat] for area math.
  const geoCoords = useMemo<[number, number][]>(
    () => vertices.map(([lat, lng]) => [lng, lat]),
    [vertices]
  );

  const areaSqFt = useMemo(
    () => (vertices.length >= 3 ? polygonAreaSquareFeet(geoCoords) : 0),
    [geoCoords, vertices.length]
  );

  const perimeterFt = useMemo(
    () =>
      vertices.length >= 2
        ? polygonPerimeterFeet(geoCoords)
        : 0,
    [geoCoords, vertices.length]
  );

  const canSave = vertices.length >= 3 && !saving;

  const handleSave = () => {
    if (!canSave) return;
    // Close the ring
    const closed: [number, number][] = [...geoCoords, geoCoords[0]];
    onSave({
      coordinates: closed,
      areaSqFt,
      perimeterFt,
    });
  };

  // When vertices change, force the map to invalidate its size on next
  // frame — otherwise tile sizing can get stuck on some Android webviews.
  useEffect(() => {
    if (mapRef.current) {
      requestAnimationFrame(() => mapRef.current?.invalidateSize());
    }
  }, []);

  const formatArea = (sqft: number) => {
    if (sqft < 0.1) return "—";
    if (sqft < 10) return `${sqft.toFixed(1)} ft²`;
    return `${Math.round(sqft).toLocaleString()} ft²`;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black/85 text-white px-4 py-3 flex items-center gap-3 shrink-0">
        <MapPin className="w-5 h-5" />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            Tap to drop a vertex
          </div>
          <div className="text-[11px] text-white/70">
            {vertices.length < 3
              ? `${vertices.length}/3 minimum`
              : `${vertices.length} vertices · ${formatArea(areaSqFt)}${perimeterFt > 0 ? ` · ${Math.round(perimeterFt)} ft perimeter` : ""}`}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={initialZoom}
          maxZoom={GOOGLE_SATELLITE_MAX_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          ref={(m) => {
            if (m) mapRef.current = m;
          }}
        >
          <TileLayer
            url={GOOGLE_SATELLITE_URL}
            attribution="&copy; Google"
            maxZoom={GOOGLE_SATELLITE_MAX_ZOOM}
            maxNativeZoom={21}
          />

          {/* Reference polygons (existing green shape, etc.) */}
          {referencePolygons.map((ref, i) => (
            <Polygon
              key={`ref-${i}`}
              positions={ref.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color: ref.color,
                fillColor: ref.color,
                fillOpacity: 0.1,
                weight: 2,
                dashArray: "6 4",
              }}
            />
          ))}

          {/* Live polygon being drawn */}
          {vertices.length >= 3 && (
            <Polygon
              positions={vertices}
              pathOptions={{
                color: "#facc15",
                fillColor: "#facc15",
                fillOpacity: 0.25,
                weight: 3,
              }}
            />
          )}

          {/* Open line between points when <3 (still gives feedback) */}
          {vertices.length === 2 && (
            <Polyline
              positions={vertices}
              pathOptions={{ color: "#facc15", weight: 3 }}
            />
          )}

          {/* Vertex markers */}
          {vertices.map((v, i) => (
            <CircleMarker
              key={i}
              center={v}
              radius={7}
              pathOptions={{
                color: "#facc15",
                fillColor: "#eab308",
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}

          <MapClickHandler onClick={handleMapClick} />
        </MapContainer>

        {/* Live area readout overlay */}
        {vertices.length >= 3 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg pointer-events-none">
            {formatArea(areaSqFt)}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="bg-black/90 text-white px-4 py-3 flex items-center gap-2 shrink-0"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="text-white border-white/30 hover:bg-white/10"
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={undoLast}
          disabled={vertices.length === 0}
          className="text-white border-white/30 hover:bg-white/10"
        >
          <Undo2 className="w-4 h-4 mr-1.5" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={vertices.length === 0}
          className="text-white border-white/30 hover:bg-white/10"
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          Clear
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-1.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
