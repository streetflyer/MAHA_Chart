import { useEditor } from "../state/store";
import { useMeasure } from "../state/measure";
import { fontSize } from "./svgText";

/** The measuring arrow over the sheet, with its length at the horizontal scale. Not saved and not printed. */
export function MeasureArrow() {
  const { a, b } = useMeasure();
  const scale = useEditor((s) => s.template?.scale.horizontal ?? 1000);
  if (!a || !b) return null;
  const mm = Math.hypot(b.x - a.x, b.y - a.y);
  const m = (mm * scale) / 1000;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const h = 2.2;
  const head = [
    [b.x - h * Math.cos(ang - 0.45), b.y - h * Math.sin(ang - 0.45)],
    [b.x, b.y],
    [b.x - h * Math.cos(ang + 0.45), b.y - h * Math.sin(ang + 0.45)],
  ]
    .map((p) => p.join(","))
    .join(" ");
  const deg = (ang * 180) / Math.PI;
  const flip = Math.abs(deg) > 90;
  return (
    <g className="measure-arrow" data-measure-mm={mm.toFixed(2)}>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#e00000"
        strokeWidth={0.5}
      />
      <polyline points={head} fill="none" stroke="#e00000" strokeWidth={0.5} />
      <circle
        cx={a.x}
        cy={a.y}
        r={0.9}
        fill="#fff"
        stroke="#e00000"
        strokeWidth={0.3}
      />
      <text
        data-measure-text
        transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${flip ? deg + 180 : deg})`}
        y={-1.4}
        textAnchor="middle"
        fontSize={fontSize(2.6)}
        fontWeight={700}
        fill="#e00000"
        stroke="#fff"
        strokeWidth={0.8}
        paintOrder="stroke"
        pointerEvents="none"
      >
        {`${m < 1000 ? m.toFixed(1) + " m" : (m / 1000).toFixed(3) + " km"}  (${mm.toFixed(1)} mm on paper, 1:${Math.round(scale).toLocaleString("en-US")})`}
      </text>
    </g>
  );
}
