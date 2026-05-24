"use client";

/**
 * Tap-to-pick satellite map used by the GPS calibration dialog.
 *
 * The caller supplies a list of "expected" picks (e.g. ["Tee", "Green Flag"])
 * and we let the user tap each one in sequence on a satellite view. The
 * resulting [lat, lng] pairs are reported back via onPicksChanged.
 *
 * This is intentionally a small wrapper around the same Leaflet + Esri
 * satellite tiles already used by polygon-measure-map. We keep it focused
 * on "tap N points and show them" so the parent dialog stays responsible
 * for matching them against image-space picks and saving the calibration.
 */

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

// Google Satellite tiles — same source the polygon-measure-map uses. Higher
// max zoom than Esri (22 vs 19) which we need for calibrating to a tee box
// or flag location with confidence.
const GOOGLE_SATELLITE_URL =
  "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
const GOOGLE_SATELLITE_MAX_ZOOM = 22;

export type LatLng = [number, number];

interface GpsCalibrationMapProps {
  /** Initial center of the map. */
  center: LatLng;
  /** Initial zoom level. Default 18 (close in on a single hole). */
  initialZoom?: number;
  /**
   * Picks for each slot, in the SAME order as `labels`. Use `null` for
   * unfilled slots so labels stay aligned with their slot index — passing
   * a filter-collapsed array would silently re-label picks when an earlier
   * slot is empty.
   */
  picks: (LatLng | null)[];
  /** Labels for each pick slot, e.g. ["Tee", "Green Flag"]. */
  labels: string[];
  /** Which pick slot the next tap should fill. */
  activeIndex: number;
  /** Called when a pick slot is updated. */
  onPickSet: (index: number, ll: LatLng) => void;
}

function MapClickHandler({
  activeIndex,
  onPickSet,
}: {
  activeIndex: number;
  onPickSet: (index: number, ll: LatLng) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (activeIndex < 0) return;
      onPickSet(activeIndex, [e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Force the map to re-center if the parent supplies a new center prop. */
function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [map, center]);
  return null;
}

const PICK_COLORS = ["#1B4332", "#B68D40", "#2563EB", "#DC2626"];

export function GpsCalibrationMap({
  center,
  initialZoom = 18,
  picks,
  labels,
  activeIndex,
  onPickSet,
}: GpsCalibrationMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      maxZoom={GOOGLE_SATELLITE_MAX_ZOOM}
      className="w-full h-full rounded-lg overflow-hidden"
      style={{ cursor: activeIndex >= 0 ? "crosshair" : "grab" }}
    >
      <TileLayer
        url={GOOGLE_SATELLITE_URL}
        maxZoom={GOOGLE_SATELLITE_MAX_ZOOM}
        attribution="&copy; Google"
      />
      <Recenter center={center} />
      <MapClickHandler activeIndex={activeIndex} onPickSet={onPickSet} />
      {picks.map((pick, i) =>
        pick ? (
          <CircleMarker
            key={`${i}-${pick[0]}-${pick[1]}`}
            center={pick}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: PICK_COLORS[i % PICK_COLORS.length],
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {labels[i] ?? `Point ${i + 1}`}
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  );
}
