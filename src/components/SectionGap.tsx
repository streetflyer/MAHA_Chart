import type { DividerStyle } from "../model/types";

/**
 * Where two sections of a chart meet in one panel: one divider line, or, with a gap,
 * a blank strip with each section's own frame on either side. With a gap the divider
 * line runs down the middle of the gap (the plan view carries it across the spaces between panels).
 */
export function SectionGap({
  x,
  y,
  h,
  div,
}: {
  x: number;
  y: number;
  h: number;
  div: Required<DividerStyle>;
}) {
  const g = div.gap;
  const mid = (
    <line
      className="segment-join"
      x1={x}
      y1={y}
      x2={x}
      y2={y + h}
      stroke={div.color}
      strokeWidth={div.width}
      strokeDasharray={div.dash.trim() || undefined}
    />
  );
  if (!(g > 0)) return mid;
  // Covers the panel's own border too, so each section's frame stops at the gap.
  const pad = 0.4;
  return (
    <g className="segment-gap">
      <rect
        x={x - g / 2}
        y={y - pad}
        width={g}
        height={h + 2 * pad}
        fill="#ffffff"
        style={{ fill: "var(--paper)" }}
      />
      {[x - g / 2, x + g / 2].map((ex) => (
        <line
          key={ex}
          x1={ex}
          y1={y}
          x2={ex}
          y2={y + h}
          stroke="#000000"
          strokeWidth={0.35}
          style={{ stroke: "var(--ink)" }}
        />
      ))}
      {mid}
    </g>
  );
}
