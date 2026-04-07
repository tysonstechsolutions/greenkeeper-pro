"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { AreaPoint, GreenObservation, TaskPriority } from "@/types/database";
import { greenIssueTypeIcons } from "@/lib/green-constants";

// ── Fixed SVG coordinate space (avoids ResizeObserver overhead) ──
const SVG_SIZE = 1000;

// ── Color mapping by priority ──
const ZONE_COLORS: Record<TaskPriority, { fill: string; stroke: string }> = {
  critical: { fill: "rgba(220, 38, 38, 0.30)", stroke: "rgba(220, 38, 38, 0.8)" },
  high: { fill: "rgba(234, 88, 12, 0.25)", stroke: "rgba(234, 88, 12, 0.75)" },
  normal: { fill: "rgba(37, 99, 235, 0.22)", stroke: "rgba(37, 99, 235, 0.7)" },
  low: { fill: "rgba(107, 114, 128, 0.18)", stroke: "rgba(107, 114, 128, 0.6)" },
};

// ── Utility: Compute centroid from an array of points ──
export function computeCentroid(points: AreaPoint[]): AreaPoint {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// ── Utility: Ramer-Douglas-Peucker simplification ──
export function simplifyPath(points: AreaPoint[], tolerance: number = 0.005): AreaPoint[] {
  if (points.length <= 3) return points;

  // Find the point farthest from the line between first and last
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(p: AreaPoint, a: AreaPoint, b: AreaPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

// ── Convert AreaPoint[] to SVG polygon points string ──
function toSvgPoints(points: AreaPoint[]): string {
  return points.map((p) => `${p.x * SVG_SIZE},${p.y * SVG_SIZE}`).join(" ");
}

// ── Convert AreaPoint[] to SVG path d attribute (smooth curve) ──
function toSvgPath(points: AreaPoint[]): string {
  if (points.length < 2) return "";
  const pts = points.map((p) => ({ x: p.x * SVG_SIZE, y: p.y * SVG_SIZE }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  d += " Z";
  return d;
}

interface GreenDrawingCanvasProps {
  holeNumber: number;
  isDrawing: boolean;
  /** Called when user completes a freehand drawing */
  onDrawComplete: (path: AreaPoint[]) => void;
  /** Existing observations to render as zones */
  observations: GreenObservation[];
  /** Called when user taps an existing zone */
  onZoneTap: (obs: GreenObservation) => void;
  imgError: boolean;
  onImgError: () => void;
}

export default function GreenDrawingCanvas({
  holeNumber,
  isDrawing,
  onDrawComplete,
  observations,
  onZoneTap,
  imgError,
  onImgError,
}: GreenDrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<AreaPoint[]>([]);
  const drawingRef = useRef(false);
  const pathElRef = useRef<SVGPathElement>(null);
  const startDotRef = useRef<SVGCircleElement>(null);
  const [, forceUpdate] = useState(0);

  // Reset drawing state when isDrawing becomes false
  useEffect(() => {
    if (!isDrawing) {
      pathRef.current = [];
      drawingRef.current = false;
      // Clear the live SVG path
      if (pathElRef.current) {
        pathElRef.current.setAttribute("d", "");
      }
      if (startDotRef.current) {
        startDotRef.current.setAttribute("r", "0");
      }
    }
  }, [isDrawing]);

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

  // Update the SVG path element directly (no React re-render)
  const updateLivePath = useCallback(() => {
    const pts = pathRef.current;
    if (!pathElRef.current || pts.length < 2) return;
    pathElRef.current.setAttribute("d", toSvgPath(pts));
  }, []);

  // Show the start dot
  const showStartDot = useCallback((point: AreaPoint) => {
    if (!startDotRef.current) return;
    startDotRef.current.setAttribute("cx", String(point.x * SVG_SIZE));
    startDotRef.current.setAttribute("cy", String(point.y * SVG_SIZE));
    startDotRef.current.setAttribute("r", "8");
  }, []);

  // ── Unified pointer handlers ──
  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawing) return;
      const pt = getRelativePoint(clientX, clientY);
      pathRef.current = [pt];
      drawingRef.current = true;
      showStartDot(pt);
    },
    [isDrawing, getRelativePoint, showStartDot]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawingRef.current) return;
      const pt = getRelativePoint(clientX, clientY);
      // Only add point if it moved enough (reduces point count + GC pressure)
      const last = pathRef.current[pathRef.current.length - 1];
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy < 0.000004) return; // ~0.002 threshold
      pathRef.current.push(pt);
      updateLivePath();
    },
    [getRelativePoint, updateLivePath]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = pathRef.current;

    if (pts.length < 5) {
      // Not enough points for a meaningful area — reset
      pathRef.current = [];
      if (pathElRef.current) pathElRef.current.setAttribute("d", "");
      if (startDotRef.current) startDotRef.current.setAttribute("r", "0");
      return;
    }

    // Simplify and pass to parent
    const simplified = simplifyPath(pts, 0.006);
    onDrawComplete(simplified);
  }, [onDrawComplete]);

  // ── Mouse event handlers ──
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      handlePointerDown(e.clientX, e.clientY);
    },
    [isDrawing, handlePointerDown]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handlePointerMove(e.clientX, e.clientY);
    },
    [handlePointerMove]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handlePointerUp();
    },
    [handlePointerUp]
  );

  // ── Touch event handlers ──
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY);
    },
    [isDrawing, handlePointerDown]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      handlePointerMove(t.clientX, t.clientY);
    },
    [handlePointerMove]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      handlePointerUp();
    },
    [handlePointerUp]
  );

  // ── Memoize zone data to avoid re-computing on every render ──
  const activeZones = useMemo(
    () => observations.filter((o) => o.status !== "resolved" && o.area_path && o.area_path.length >= 3),
    [observations]
  );

  const legacyPins = useMemo(
    () => observations.filter((o) => o.status !== "resolved" && (!o.area_path || o.area_path.length < 3)),
    [observations]
  );

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
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        preserveAspectRatio="none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: isDrawing ? "crosshair" : "default" }}
      >
        {/* Existing observation zones */}
        {activeZones.map((obs) => {
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
              className="transition-opacity duration-200"
            >
              <polygon
                points={toSvgPoints(obs.area_path!)}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Emoji icon with white background circle for readability */}
              <circle
                cx={centroid.x * SVG_SIZE}
                cy={centroid.y * SVG_SIZE}
                r="18"
                fill="white"
                fillOpacity="0.85"
              />
              <text
                x={centroid.x * SVG_SIZE}
                y={centroid.y * SVG_SIZE}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="22"
                style={{ pointerEvents: "none" }}
              >
                {greenIssueTypeIcons[obs.issue_type]}
              </text>
            </g>
          );
        })}

        {/* Legacy pin-only observations (no area_path) */}
        {legacyPins.map((obs) => {
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
              {/* Larger tap target for mobile */}
              <circle
                cx={obs.pin_x * SVG_SIZE}
                cy={obs.pin_y * SVG_SIZE}
                r="24"
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth="3"
              />
              <circle
                cx={obs.pin_x * SVG_SIZE}
                cy={obs.pin_y * SVG_SIZE}
                r="14"
                fill="white"
                fillOpacity="0.85"
              />
              <text
                x={obs.pin_x * SVG_SIZE}
                y={obs.pin_y * SVG_SIZE}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="16"
                style={{ pointerEvents: "none" }}
              >
                {greenIssueTypeIcons[obs.issue_type]}
              </text>
            </g>
          );
        })}

        {/* Start dot (drawn directly via ref, no re-render) */}
        <circle
          ref={startDotRef}
          r="0"
          fill="rgba(5, 150, 105, 0.9)"
          stroke="white"
          strokeWidth="2"
        />

        {/* Live drawing path (updated via ref, no re-render) */}
        <path
          ref={pathElRef}
          fill="rgba(5, 150, 105, 0.20)"
          stroke="rgba(5, 150, 105, 0.9)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Drawing mode overlay hint */}
      {isDrawing && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
          <div className="bg-emerald-700/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
            </svg>
            Trace around the affected area
          </div>
        </div>
      )}
    </div>
  );
}
