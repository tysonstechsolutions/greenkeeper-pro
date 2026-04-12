"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  ImageOverlay,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { CourseZone, ZoneType, GeoJsonPolygon, DroneFlight } from "@/types/database";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { PhotoWithUploader } from "@/lib/hooks/usePhotos";
import { createClient } from "@/lib/supabase/client";

// Fix Leaflet default icon issue in Next.js
delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Tile layer options with fallback
const TILE_LAYERS = {
  osm: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: "Street Map",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    label: "Satellite",
  },
  googleSatellite: {
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: '&copy; Google',
    label: "Google Satellite",
  },
} as const;

const DEFAULT_TILE_LAYER = TILE_LAYERS.osm;

// Veterans Memorial Golf Course at Naval Station Great Lakes
const DEFAULT_CENTER: [number, number] = [42.3095, -87.8475];
const DEFAULT_ZOOM = 16;

// Approximate VMGC course bounding box for NDVI overlay fallback
const VMGC_BOUNDS: [[number, number], [number, number]] = [
  [42.2972, -87.8364], // south-west
  [42.3050, -87.8250], // north-east
];

// Condition score color mapping
function getConditionColor(score: number | null): string {
  if (score === null) return "#9ca3af"; // gray
  if (score >= 8) return "#22c55e"; // green - excellent
  if (score >= 5) return "#eab308"; // yellow - fair
  return "#ef4444"; // red - poor
}

// Priority color mapping
function getPriorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "normal":
      return "#22c55e";
    case "low":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
}

// Create custom task marker icon
function createTaskIcon(priority: string): L.DivIcon {
  const color = getPriorityColor(priority);
  return L.divIcon({
    className: "custom-task-marker",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

// Create problem marker icon
function createProblemIcon(): L.DivIcon {
  return L.divIcon({
    className: "custom-problem-marker",
    html: `
      <div style="
        width: 28px;
        height: 28px;
        background-color: #f97316;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Convert GeoJSON coordinates to Leaflet LatLng format
function geoJsonToLatLng(geojson: GeoJsonPolygon): [number, number][] {
  // GeoJSON uses [longitude, latitude] format, Leaflet uses [latitude, longitude]
  return geojson.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
}

// Calculate polygon centroid for labels
function getPolygonCentroid(positions: [number, number][]): [number, number] {
  let latSum = 0;
  let lngSum = 0;
  positions.forEach(([lat, lng]) => {
    latSum += lat;
    lngSum += lng;
  });
  return [latSum / positions.length, lngSum / positions.length];
}

// Map event handler for edit mode
interface MapEventsProps {
  onMapClick?: (latlng: L.LatLng) => void;
  editMode: boolean;
}

function MapEventHandler({ onMapClick, editMode }: MapEventsProps) {
  useMapEvents({
    click: (e) => {
      if (editMode && onMapClick) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

// Map controls component to handle centering/zooming
interface MapControllerProps {
  center?: [number, number];
  zoom?: number;
}

function MapController({ center, zoom }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);

  return null;
}

// Zone overlay props
interface ZoneOverlayProps {
  zone: CourseZone;
  onClick?: (zone: CourseZone) => void;
  selected?: boolean;
}

function ZoneOverlay({ zone, onClick, selected }: ZoneOverlayProps) {
  if (!zone.geojson) return null;

  const positions = geoJsonToLatLng(zone.geojson);
  const color = getConditionColor(zone.condition_score);
  const centroid = getPolygonCentroid(positions);

  return (
    <>
      <Polygon
        positions={positions}
        pathOptions={{
          color: selected ? "#3b82f6" : color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: selected ? 3 : 2,
        }}
        eventHandlers={{
          click: () => onClick?.(zone),
        }}
      />
      {/* Zone label */}
      <Marker
        position={centroid}
        icon={L.divIcon({
          className: "zone-label",
          html: `<div style="
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            transform: translate(-50%, -50%);
          ">${zone.name}</div>`,
          iconSize: [0, 0],
        })}
        eventHandlers={{
          click: () => onClick?.(zone),
        }}
      />
    </>
  );
}

// Task marker component
interface TaskMarkerProps {
  task: TaskWithRelations;
  onClick?: (task: TaskWithRelations) => void;
}

function TaskMarker({ task, onClick }: TaskMarkerProps) {
  // Use zone's geojson centroid for position
  if (!task.zone?.id) return null;

  // We'll need the zone's geojson - for now use a placeholder
  // In actual use, tasks with GPS data would have coordinates
  return null;
}

// Photo/Problem marker component
interface ProblemMarkerProps {
  photo: PhotoWithUploader;
  onClick?: (photo: PhotoWithUploader) => void;
}

function ProblemMarker({ photo, onClick }: ProblemMarkerProps) {
  if (!photo.gps_lat || !photo.gps_lng) return null;

  return (
    <Marker
      position={[photo.gps_lat, photo.gps_lng]}
      icon={createProblemIcon()}
      eventHandlers={{
        click: () => onClick?.(photo),
      }}
    >
      <Popup>
        <div className="min-w-[200px]">
          {photo.thumbnail_path && (
            <img
              src={photo.thumbnail_path}
              alt={photo.caption || "Problem photo"}
              className="w-full h-32 object-cover rounded mb-2"
            />
          )}
          <p className="text-sm font-medium">{photo.caption || "Problem Area"}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(photo.created_at).toLocaleDateString()}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

// Main CourseMapComponent props
export interface CourseMapComponentProps {
  /** Course zones to display */
  zones?: CourseZone[];
  /** Tasks with location data */
  tasks?: TaskWithRelations[];
  /** Photos (filtered for problems or general) */
  photos?: PhotoWithUploader[];
  /** Allow zone editing (superintendent only) */
  editable?: boolean;
  /** Callback when a zone is clicked */
  onZoneClick?: (zone: CourseZone) => void;
  /** Callback when a task is clicked */
  onTaskClick?: (task: TaskWithRelations) => void;
  /** Callback when a photo is clicked */
  onPhotoClick?: (photo: PhotoWithUploader) => void;
  /** Callback when zone is created/updated in edit mode */
  onZoneSave?: (zoneData: {
    geojson: GeoJsonPolygon;
    name?: string;
    zone_type?: ZoneType;
    hole_number?: number;
    turf_type?: string;
    acreage?: number;
  }) => void;
  /** Initial map center */
  initialCenter?: [number, number];
  /** Initial zoom level */
  initialZoom?: number;
  /** Show zone overlays */
  showZones?: boolean;
  /** Show task markers */
  showTasks?: boolean;
  /** Show problem markers */
  showProblems?: boolean;
  /** Currently selected zone ID */
  selectedZoneId?: string;
  /** Custom className */
  className?: string;
  /** Minimal mode (no interactions, for widgets) */
  minimal?: boolean;
}

export function CourseMapComponent({
  zones = [],
  tasks = [],
  photos = [],
  editable = false,
  onZoneClick,
  onTaskClick,
  onPhotoClick,
  onZoneSave,
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  showZones = true,
  showTasks = true,
  showProblems = true,
  selectedZoneId,
  className,
  minimal = false,
}: CourseMapComponentProps) {
  const [editMode, setEditMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<L.LatLng[]>([]);
  const mapRef = useRef<L.Map | null>(null);

  // NDVI overlay state
  const [ndviEnabled, setNdviEnabled] = useState(false);
  const [ndviFlight, setNdviFlight] = useState<DroneFlight | null>(null);
  const [ndviUrl, setNdviUrl] = useState<string | null>(null);

  // Fetch the most recent NDVI flight when toggled on
  useEffect(() => {
    if (!ndviEnabled) {
      setNdviFlight(null);
      setNdviUrl(null);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data } = await supabase
        .from("drone_flights")
        .select("*")
        .eq("band", "ndvi")
        .not("preview_png_path", "is", null)
        .order("flight_date", { ascending: false })
        .limit(1);

      if (cancelled || !data || data.length === 0) return;

      const flight = data[0] as DroneFlight;
      setNdviFlight(flight);

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl && flight.preview_png_path) {
        setNdviUrl(
          `${supabaseUrl}/storage/v1/object/public/drone-flights/${flight.preview_png_path}`
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ndviEnabled]);

  // Filter zones with geojson data
  const zonesWithGeojson = useMemo(
    () => zones.filter((z) => z.geojson !== null),
    [zones]
  );

  // Filter problem photos
  const problemPhotos = useMemo(
    () => photos.filter((p) => p.photo_type === "problem" && p.gps_lat && p.gps_lng),
    [photos]
  );

  // Tasks with zone locations
  const tasksWithLocation = useMemo(() => {
    return tasks.filter((t) => {
      const zone = zones.find((z) => z.id === t.zone_id);
      return zone?.geojson;
    });
  }, [tasks, zones]);

  // Handle map click in edit mode
  const handleMapClick = useCallback((latlng: L.LatLng) => {
    setDrawingPoints((prev) => [...prev, latlng]);
  }, []);

  // Complete polygon drawing
  const completePolygon = useCallback(() => {
    if (drawingPoints.length < 3) return;

    const coordinates = drawingPoints.map((p) => [p.lng, p.lat]);
    // Close the polygon
    coordinates.push(coordinates[0]);

    const geojson: GeoJsonPolygon = {
      type: "Polygon",
      coordinates: [coordinates],
    };

    onZoneSave?.({ geojson });
    setDrawingPoints([]);
  }, [drawingPoints, onZoneSave]);

  // Cancel drawing
  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
  }, []);

  // Undo last point
  const undoPoint = useCallback(() => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  }, []);

  if (minimal) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg", className)}>
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={false}
          dragging={false}
          touchZoom={false}
          doubleClickZoom={false}
          zoomControl={false}
          attributionControl={false}
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer url={DEFAULT_TILE_LAYER.url} attribution={DEFAULT_TILE_LAYER.attribution} />
          {showZones &&
            zonesWithGeojson.map((zone) => (
              <ZoneOverlay
                key={zone.id}
                zone={zone}
                selected={zone.id === selectedZoneId}
              />
            ))}
        </MapContainer>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          url={DEFAULT_TILE_LAYER.url}
          attribution={DEFAULT_TILE_LAYER.attribution}
        />

        <MapEventHandler onMapClick={handleMapClick} editMode={editMode} />
        <MapController center={initialCenter} zoom={initialZoom} />

        {/* Zone overlays */}
        {showZones &&
          zonesWithGeojson.map((zone) => (
            <ZoneOverlay
              key={zone.id}
              zone={zone}
              onClick={onZoneClick}
              selected={zone.id === selectedZoneId}
            />
          ))}

        {/* Task markers */}
        {showTasks &&
          tasksWithLocation.map((task) => {
            const zone = zones.find((z) => z.id === task.zone_id);
            if (!zone?.geojson) return null;
            const positions = geoJsonToLatLng(zone.geojson);
            const centroid = getPolygonCentroid(positions);

            return (
              <Marker
                key={task.id}
                position={centroid}
                icon={createTaskIcon(task.priority)}
                eventHandlers={{
                  click: () => onTaskClick?.(task),
                }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <p className="font-medium text-sm">{task.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {task.status.replace("_", " ")} • {task.priority} priority
                    </p>
                    {task.assigned_user && (
                      <p className="text-xs mt-1">
                        Assigned to: {task.assigned_user.full_name}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Problem markers */}
        {showProblems &&
          problemPhotos.map((photo) => (
            <ProblemMarker key={photo.id} photo={photo} onClick={onPhotoClick} />
          ))}

        {/* NDVI overlay */}
        {ndviEnabled && ndviUrl && (
          <ImageOverlay
            url={ndviUrl}
            bounds={
              ndviFlight?.bbox
                ? [
                    [ndviFlight.bbox.south, ndviFlight.bbox.west],
                    [ndviFlight.bbox.north, ndviFlight.bbox.east],
                  ]
                : VMGC_BOUNDS
            }
            opacity={0.6}
          />
        )}

        {/* Drawing polygon in edit mode */}
        {editMode && drawingPoints.length > 0 && (
          <>
            <Polygon
              positions={drawingPoints.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: "#3b82f6",
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
                weight: 2,
                dashArray: "5, 5",
              }}
            />
            {drawingPoints.map((point, index) => (
              <Marker
                key={index}
                position={[point.lat, point.lng]}
                icon={L.divIcon({
                  className: "drawing-point",
                  html: `<div style="
                    width: 12px;
                    height: 12px;
                    background: #3b82f6;
                    border: 2px solid white;
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                  "></div>`,
                  iconSize: [12, 12],
                })}
              />
            ))}
          </>
        )}
      </MapContainer>

      {/* NDVI toggle button */}
      <button
        onClick={() => setNdviEnabled((prev) => !prev)}
        className={cn(
          "absolute top-4 right-4 z-[1000] px-3 py-1.5 text-xs font-medium rounded-lg shadow-lg transition-colors",
          ndviEnabled
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border"
        )}
        title={
          ndviEnabled
            ? "Hide NDVI overlay"
            : ndviFlight === null && ndviEnabled
            ? "No NDVI flights uploaded yet"
            : "Show NDVI overlay"
        }
      >
        NDVI
      </button>

      {/* Edit mode controls */}
      {editable && editMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-2">
          <span className="text-sm text-muted-foreground px-2">
            {drawingPoints.length} points
          </span>
          <button
            onClick={undoPoint}
            disabled={drawingPoints.length === 0}
            className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
          >
            Undo
          </button>
          <button
            onClick={cancelDrawing}
            className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={completePolygon}
            disabled={drawingPoints.length < 3}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Complete
          </button>
        </div>
      )}

      {/* Edit mode toggle for editable maps */}
      {editable && !editMode && (
        <button
          onClick={() => setEditMode(true)}
          className="absolute bottom-4 right-4 z-[1000] px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/90"
        >
          Edit Zones
        </button>
      )}

      {editable && editMode && (
        <button
          onClick={() => {
            setEditMode(false);
            setDrawingPoints([]);
          }}
          className="absolute bottom-4 right-4 z-[1000] px-4 py-2 bg-slate-600 text-white rounded-lg shadow-lg hover:bg-slate-700"
        >
          Done Editing
        </button>
      )}
    </div>
  );
}