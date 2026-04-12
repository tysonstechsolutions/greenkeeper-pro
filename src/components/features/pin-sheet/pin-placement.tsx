"use client";

interface PinPlacementProps {
  pacesFromFront: number;
  pacesFromLeft: number;
  maxFront?: number;
  maxLeft?: number;
}

/**
 * Small visual widget that renders a stylized golf green (oval) with a dot
 * showing where the pin falls based on the paces values. Pure display — no
 * state, no interaction.
 */
export function PinPlacement({
  pacesFromFront,
  pacesFromLeft,
  maxFront = 50,
  maxLeft = 40,
}: PinPlacementProps) {
  const width = 120;
  const height = 90;
  const padding = 10;

  // Clamp paces to valid bounds
  const clampedFront = Math.max(0, Math.min(maxFront, pacesFromFront));
  const clampedLeft = Math.max(0, Math.min(maxLeft, pacesFromLeft));

  // Map paces to svg coordinates.
  // X axis: left = 0 paces, right = maxLeft paces
  // Y axis: top (front edge) = 0 paces, bottom (back edge) = maxFront paces
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const cx = padding + (clampedLeft / maxLeft) * usableW;
  const cy = padding + (clampedFront / maxFront) * usableH;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      role="img"
      aria-label={`Pin placement: ${pacesFromFront} paces from front, ${pacesFromLeft} paces from left`}
    >
      {/* Green oval background */}
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2 - 4}
        ry={height / 2 - 6}
        fill="#86efac"
        stroke="#16a34a"
        strokeWidth={1.5}
      />

      {/* Edge labels */}
      <text
        x={width / 2}
        y={9}
        textAnchor="middle"
        fontSize={7}
        fill="#14532d"
        fontWeight={600}
      >
        FRONT
      </text>
      <text
        x={width / 2}
        y={height - 3}
        textAnchor="middle"
        fontSize={7}
        fill="#14532d"
        fontWeight={600}
      >
        BACK
      </text>
      <text
        x={4}
        y={height / 2 + 2}
        textAnchor="start"
        fontSize={7}
        fill="#14532d"
        fontWeight={600}
      >
        L
      </text>
      <text
        x={width - 4}
        y={height / 2 + 2}
        textAnchor="end"
        fontSize={7}
        fill="#14532d"
        fontWeight={600}
      >
        R
      </text>

      {/* Pin dot */}
      <circle cx={cx} cy={cy} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1.2} />
    </svg>
  );
}

export default PinPlacement;
