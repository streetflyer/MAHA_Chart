import { useEditor } from "../state/store";
import type { Callout, PlanStyle } from "../model/types";
import { calloutLayout, leaderStart } from "../model/callout";
import { fontSize, measureText } from "./svgText";

type Pt = [number, number];

/** Paper ↔ grid of each plan view as last drawn, so the sheet can move callouts in grid terms. */
export const planProjection = new Map<
  string,
  {
    project: (e: number, n: number) => Pt;
    unproject: (x: number, y: number) => Pt;
  }
>();

/** The inverse of an affine grid → paper projection. */
export function inverseOf(project: (e: number, n: number) => Pt) {
  const a = project(0, 0);
  const bx = project(1, 0);
  const by = project(0, 1);
  const m = [bx[0] - a[0], bx[1] - a[1], by[0] - a[0], by[1] - a[1]];
  const det = m[0] * m[3] - m[2] * m[1] || 1;
  return (x: number, y: number): Pt => {
    const dx = x - a[0];
    const dy = y - a[1];
    return [(m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det];
  };
}

/** The plan view's text boxes with their leader arrows. */
export function Callouts({
  panelId,
  st,
  project,
}: {
  panelId: string;
  st: PlanStyle;
  project: (e: number, n: number) => Pt;
}) {
  const chart = useEditor((s) => s.sheetIndex);
  return (
    <>
      {(st.callouts ?? [])
        .filter((c) => c.chart === undefined || c.chart === chart)
        .map((c) => (
          <CalloutView key={c.id} c={c} panelId={panelId} project={project} />
        ))}
    </>
  );
}

function CalloutView({
  c,
  panelId,
  project,
}: {
  c: Callout;
  panelId: string;
  project: (e: number, n: number) => Pt;
}) {
  const [tx, ty] = project(c.e, c.n);
  const fs = fontSize(c.size);
  const L = calloutLayout(c, fs);
  const box = { x: tx + c.dx, y: ty + c.dy, w: c.w, h: c.h ?? L.need };
  const head = Math.min(box.h, L.head);
  const family = c.font ? `${c.font}, Arial, sans-serif` : undefined;
  const [sx, sy] = leaderStart(box, tx, ty);
  // Arrow head along the leader, its tip on the point.
  const len = Math.hypot(tx - sx, ty - sy);
  const ux = len ? (tx - sx) / len : 0;
  const uy = len ? (ty - sy) / len : 1;
  const al = Math.min(c.size * 1.3, len * 0.5 || c.size);
  const aw = al * 0.35;
  const bx = tx - ux * al;
  const by = ty - uy * al;
  const id = `${panelId}|${c.id}`;
  const grab = (part: string) => ({
    "data-callout": `${id}|${part}`,
    style: {
      pointerEvents: "all" as const,
      cursor: part === "size" ? "nwse-resize" : "move",
    },
  });
  const labelW = Math.max(
    0,
    ...L.lines.map((l) => measureText(l[0], c.size, false, c.font)),
  );
  const hs = Math.max(1.2, c.size * 0.8);
  return (
    <g className="callout" style={{ fontFamily: family }}>
      {len > 0.2 && (
        <>
          <line
            x1={sx}
            y1={sy}
            x2={bx}
            y2={by}
            stroke={c.arrow}
            strokeWidth={0.18}
          />
          <path
            d={`M${tx} ${ty}L${bx - uy * aw} ${by + ux * aw}L${bx + uy * aw} ${by - ux * aw}Z`}
            fill={c.arrow}
          />
        </>
      )}
      <circle
        cx={tx}
        cy={ty}
        r={Math.max(0.8, c.size * 0.5)}
        fill="transparent"
        {...grab("arrow")}
      />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill={c.fill}
        {...grab("box")}
      />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={head}
        fill={c.titleFill}
        {...grab("title")}
      />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke={c.border}
        strokeWidth={0.18}
        style={{ pointerEvents: "none" }}
      />
      {L.titles.map((t, i) => (
        <text
          key={i}
          x={box.x + box.w / 2}
          y={box.y + L.pad + fs * 0.85 + i * L.lh}
          fontSize={fs}
          textAnchor="middle"
          style={{ fill: c.titleColor, pointerEvents: "none" }}
        >
          {t}
        </text>
      ))}
      {L.lines.map(([k, v, rid], i) => {
        const y = box.y + head + L.pad * 0.8 + fs * 0.85 + i * L.lh;
        if (y > box.y + box.h + 0.01) return null;
        return (
          <g key={rid}>
            <rect
              x={box.x}
              y={y - fs * 0.95}
              width={box.w}
              height={L.lh}
              fill="transparent"
              {...grab(`row:${rid}`)}
            />
            <g style={{ pointerEvents: "none" }}>
              <text
                x={box.x + L.pad * 2}
                y={y}
                fontSize={fs}
                style={{ fill: c.textColor }}
              >
                {k}
              </text>
              <text
                x={box.x + L.pad * 2 + labelW + fs * 0.5}
                y={y}
                fontSize={fs}
                style={{ fill: c.textColor }}
              >
                -
              </text>
              <text
                x={box.x + box.w - L.pad * 2}
                y={y}
                fontSize={fs}
                textAnchor="end"
                style={{ fill: c.textColor }}
              >
                {v}
              </text>
            </g>
          </g>
        );
      })}
      <rect
        className="callout-size"
        x={box.x + box.w - hs / 2}
        y={box.y + box.h - hs / 2}
        width={hs}
        height={hs}
        {...grab("size")}
      />
    </g>
  );
}
