import type { MarkerShape } from "../model/pointSets";

/** A point symbol centred on (x, y), `s` mm across: circle, x, +, triangle or square. */
export function Marker({
  shape,
  x,
  y,
  s,
  color,
  width,
  fill = "none",
  fillColor,
  hatchId,
}: {
  shape: MarkerShape;
  x: number;
  y: number;
  s: number;
  color: string;
  width: number;
  fill?: "none" | "solid" | "hatch";
  fillColor?: string;
  hatchId?: string;
}) {
  const h = s / 2;
  const paint =
    fill === "solid"
      ? (fillColor ?? color)
      : fill === "hatch" && hatchId
        ? `url(#${hatchId})`
        : "none";
  const style = { stroke: color, strokeWidth: width, fill: paint };
  switch (shape) {
    case "circle":
      return <circle cx={x} cy={y} r={h} style={style} />;
    case "square":
      return <rect x={x - h} y={y - h} width={s} height={s} style={style} />;
    case "triangle":
      return (
        <polygon
          points={`${x},${y - h} ${x + h * 0.95},${y + h * 0.7} ${x - h * 0.95},${y + h * 0.7}`}
          style={style}
        />
      );
    case "x":
      return (
        <path
          d={`M${x - h} ${y - h}L${x + h} ${y + h}M${x - h} ${y + h}L${x + h} ${y - h}`}
          style={{ ...style, fill: "none" }}
        />
      );
    case "plus":
      return (
        <path
          d={`M${x - h} ${y}H${x + h}M${x} ${y - h}V${y + h}`}
          style={{ ...style, fill: "none" }}
        />
      );
  }
}

/** Diagonal hatch for a marker's fill. */
export function MarkerHatch({
  id,
  color,
  gap = 0.5,
}: {
  id: string;
  color: string;
  gap?: number;
}) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={gap}
      height={gap}
      patternTransform="rotate(45)"
    >
      <path d={`M0 0V${gap}`} style={{ stroke: color, strokeWidth: gap / 4 }} />
    </pattern>
  );
}
