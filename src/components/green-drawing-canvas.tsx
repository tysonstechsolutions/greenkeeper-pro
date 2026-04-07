"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { AreaPoint, GreenObservation, GreenIssueType, TaskPriority } from "@/types/database";

// ── Color mapping by priority ──
const ZONE_COLORS: Record<TaskPriority, { fill: string; stroke: string }> = {
  critical: { fill: "rgba(220, 38, 38, 0.30)", stroke: "rgba(220, 38, 38, 0.8)" },
  high: { fill: "rgba(234, 88, 12, 0.25)", stroke: "rgba(234, 88, 12, 0.75)" },
  normal: { fill: "rgba(37, 99, 235, 0.22)", stroke: "rgba(37, 99, 235, 0.7)" },
  low: { fill: "rgba(107, 114, 128, 0.18)", stroke: "rgba(107, 114, 128, 0.6)" },
};

// ── Issue type icons (emoji) for zone labels ──
import { greenIssueTypeIcons } from "@/lib/green-constants";

interface GreenDrawingCanvasProps {
  /** The green number (1-18) */
  holeNumber: number;
  /** Whether drawing mode is active */
  isDrawing: boolean;
  /** The freehand points being drawn in real-time */
  currentPath: AreaPoint[];
  /** Called with new point as user draws */
  onDrawPoint: (point: AreaPoint) => void;
  /** Called when drawing finishes (mouseUp / touchEnd) */
  onDrawEnd: () => void;
  /** Called when drawing starts (mouseDown / touchStart) */
  onDrawStart: (point: AreaPoint) => void;
  /** Existing observations to render as zones */
  observations: GreenObservation[];
  /** Called when user taps an existing zone */
  onZoneTap: (obs: GreenObservation) => void;
  /** Whether the green SVG failed to load */
  imgError: boolean;
  /** Set img error */
  onImgError: () => void;
}

/** Compute centroid from an array of points */
export function computeCentroid(points: AreaPoint[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Simplify a path by removing points that are too close together */
function simplifyPath(points: AreaPoint[], tolerance: number = 0.005): AreaPoint[] {
  if (points.length <= 2) return points;
  const result: AreaPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = result[result.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (Math.sqrt(dx * dx + dy * dy) >= tolerance) {
      result.push(points[i]);
    }
  }
  return result;
}

/** Convert AreaPoint[] to SVG polygon points string (in percentage coords) */
function toSvgPoints(points: AreaPoint[], width: number, height: number): string {
  return points.map((p) => `${p.x * width},${p.y * height}`).join(" ");
}

export { simplifyPath };

export default function GreenDrawingCanvas({
  holeNumber,
  isDrawing,
  currentPath,
  onDrawPoint,
  onDrawEnd,
  onDrawStart,
  observations,
  onZoneTap,
  imgError,
  onImgError,
}: GreenDrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Convert client coords to relative 0-1 coords
  const getRelativePoint = useCallback(
    (clientX: number, clientY: number): AreaPoint => {
      const el = containerRef.current;
      if (!el) return { x: 0.5, y: 0.5 };
      const rect = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    []
  );

  // ── Mouse handlers ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pt = getRelativePoint(e.clientX, e.clientY);
      onDrawStart(pt);
    },
    [isDrawing, getRelativePoint, onDrawStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || currentPath.length === 0) return;
      e.preventDefault();
      const pt = getRelativePoint(e.clientX, e.clientY);
      onDrawPoint(pt);
    },
    [isDrawing, currentPath.length, getRelativePoint, onDrawPoint]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || currentPath.length === 0) return;
      e.preventDefault();
      onDrawEnd();
    },
    [isDrawing, currentPath.length, onDrawEnd]
  );

  // ── Touch handlers ──
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pt = getRelativePoint(touch.clientX, touch.clientY);
      onDrawStart(pt);
    },
    [isDrawing, getRelativePoint, onDrawStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawing || currentPath.length === 0) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pt = getRelativePoint(touch.clientX, touch.clientY);
      onDrawPoint(pt);
    },
    [isDrawing, currentPath.length, getRelativePoint, onDrawPoint]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawing || currentPath.length === 0) return;
      e.preventDefault();
      onDrawEnd();
    },
    [isDrawing, currentPath.length, onDrawEnd]
  );

  const { width, height } = dimensions;

  return (
    <div
      ref={containerRef}
      className="relative aspect-square max-w-[600px] mx-auto w-full select-none"
      style={{ touchAction: isDrawing ? "none" : "auto" }}
    >
      {/* Green SVG background */}
      {imgError ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-800/20 via-emerald-50 to-emerald-100/50 rounded-2xl">
          <div className="text-center">
            <span className="text-5xl font-bold text-emerald-400/20">{holeNumber}</span>
          </div>
        </div>
      ) : (
        <img
          src={`/greens/green-${holeNumber}.svg`}
          alt={`Green ${holeNumber}`}
          className="w-full h-full"
          onError={onImgError}
          draggable={false}
        />
      )}

      {/* SVG overlay for zones + drawing */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: isDrawing ? "crosshair" : "default" }}
      >
        {/* Existing observation zones */}
        {observations
          .filter((o) => o.status !== "resolved" && o.area_path && o.area_path.length >= 3)
          .map((obs) => {
            const colors = ZONE_COLORS[obs.priority] || ZONE_COLORS.normal;
            const centroid = computeCentroid(obs.area_path!);
            return (
              <g
                key={obs.id}
                onClick={(e) => {
                  if (!isDrawing) {
                    e.stopPropagation();
                    onZoneTap(obs);
                  }
                }}
                style={{ cursor: isDrawing ? "crosshair" : "pointer" }}
              >
                {/* Filled zone */}
                <polygon
                  points={toSvgPoints(obs.area_path!, width, height)}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {/* Issue type icon at centroid */}
                <text
                  x={centroid.x * width}
                  y={centroid.y * height}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="20"
                  style={{ pointerEvents: "none" }}
                >
                  {greenIssueTypeIcons[obs.issue_type]}
                </text>
              </g>
            );
          })}

        {/* Legacy pin-only observations (no area_path) */}
        {observations
          .filter((o) => o.status !== "resolved" && (!o.area_path || o.area_path.length < 3))
          .map((obs) => {
            const colors = ZONE_COLORS[obs.priority] || ZONE_COLORS.normal;
            return (
              <g
                key={obs.id}
                onClick={(e) => {
                  if (!isDrawing) {
                    e.stopPropagation();
                    onZoneTap(obs);
                  }
                }}
                style={{ cursor: isDrawing ? "crosshair" : "pointer" }}
              >
                <circle
                  cx={obs.pin_x * width}
                  cy={obs.pin_y * height}
                  r="12"
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth="2"
                />
                <text
                  x={obs.pin_x * width}
                  y={obs.pin_y * height}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  style={{ pointerEvents: "none" }}
                >
                  {greenIssueTypeIcons[obs.issue_type]}
                </text>
              </g>
            );
          })}

        {/* Current drawing path */}
        {currentPath.length >= 2 && (
          <polygon
            points={toSvgPoints(currentPath, width, height)}
            fill="rgba(5, 150, 105, 0.25)"
            stroke="rgba(5, 150, 105, 0.9)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray="6 3"
          />
        )}
      </svg>

      {/* Drawing mode overlay hint */}
      {isDrawing && currentPath.length === 0 && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
          <div className="bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
            </svg>
            Draw around the affected area
          </div>
        </div>
      )}
    </div>
  );
}
