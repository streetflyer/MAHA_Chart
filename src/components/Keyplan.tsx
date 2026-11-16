import { useEffect, useMemo, useState } from "react";
import { useEditor } from "../state/store";
import { useKeyplanView, viewFitting } from "../state/keyplanView";
import { planPanel, sheetCount, sheetRange } from "../model/scale";
import { planStyle } from "../model/planStyle";
import {
  boundaryLines,
  clipPolygon,
  DEFAULT_MATCHLINES,
} from "../model/matchlines";
import { chartKpRange } from "../model/tokens";
import { useMatchPick } from "../state/matchPick";
import { hoverSources } from "../state/hoverInfo";
import {
  chartFrames,
  emptyBounds,
  extend,
  routeBounds,
  nearestChainage,
  pointAt,
  type Bounds,
  type Route,
} from "../model/route";
import type { ChartTemplate, KeyplanStyle, Panel } from "../model/types";
import { useSurvey } from "../state/surveyData";
import { routePath } from "./linework";
import { LineworkLayer } from "./LineworkLayer";
import { lineworkFor } from "../model/datasets";
import { fontSize } from "./svgText";

/** Zoom-to-fit actions of the key plans on the sheet, by panel id (used by the mode bar and the menu). */
export const keyplanFit = new Map<string, (whole: boolean) => void>();

export const DEFAULT_KEYPLAN: KeyplanStyle = {
  background: "#cfe6ff",
  dxfColor: "#8a8a8a",
  routeColor: "#7a7a7a",
  boundaryColor: "#000000",
  currentColor: "#e00000",
  gridSpacing: 0,
  gridColor: "#5b9bb5",
  showGrid: true,
  showNorthArrow: true,
  showBoundaries: true,
};

export const keyplanStyle = (p: Panel): KeyplanStyle => ({
  ...DEFAULT_KEYPLAN,
  ...p.keyplan,
});

/** Round grid spacing giving about four lines across the wider side. */
export function niceGrid(span: number): number {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/**
 * Key plan: background DXF, the survey line and every chart's footprint, on an
 * easting/northing grid with a north arrow. The chart being viewed is highlighted.
 */
export function Keyplan({
  p,
  top,
  template,
  sheetIndex,
}: {
  p: Panel;
  top: number;
  template: ChartTemplate;
  sheetIndex: number;
}) {
  const route = useSurvey((s) => s.route);
  const routeShown = useSurvey((s) => s.routeShown);
  const datasets = useSurvey((s) => s.datasets);
  const sets = useMemo(() => lineworkFor(datasets, "siteplan"), [datasets]);
  const background = sets[0]?.lw ?? null;
  const st = keyplanStyle(p);
  const area = {
    x: p.x + 0.6,
    y: top + 0.3,
    w: p.w - 1.2,
    h: p.y + p.h - top - 0.9,
  };
  const frames = useMemo(
    () => (route ? chartFrames(template, route) : []),
    [route, template],
  );

  const half =
    ((planPanel(template)?.h ?? 0) * template.scale.horizontal) / 2000;
  const view = useMemo(() => {
    const b = emptyBounds();
    if (route) {
      const rb = routeBounds(route);
      extend(b, rb.minE, rb.minN);
      extend(b, rb.maxE, rb.maxN);
      // Leave room for the chart frames either side of the line, without refitting while one is dragged.
      if (st.showBoundaries) {
        extend(b, rb.minE - half, rb.minN - half);
        extend(b, rb.maxE + half, rb.maxN + half);
      }
    } else if (background) {
      extend(b, background.bounds.minE, background.bounds.minN);
      extend(b, background.bounds.maxE, background.bounds.maxN);
    }
    if (!Number.isFinite(b.minE)) return null;
    if (st.view) {
      // Zoomed and moved by the user: the panel's own aspect, centred where it was left.
      const w = st.view.w;
      const h = w / (area.w / area.h);
      return {
        minE: st.view.cE - w / 2,
        maxE: st.view.cE + w / 2,
        minN: st.view.cN - h / 2,
        maxN: st.view.cN + h / 2,
      } as Bounds;
    }
    // Pad and match the panel's aspect so the map fills it without distortion.
    const padE = (b.maxE - b.minE) * 0.08 + 1;
    const padN = (b.maxN - b.minN) * 0.08 + 1;
    let w = b.maxE - b.minE + 2 * padE;
    let h = b.maxN - b.minN + 2 * padN;
    const aspect = area.w / area.h;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    const cE = (b.minE + b.maxE) / 2;
    const cN = (b.minN + b.maxN) / 2;
    return {
      minE: cE - w / 2,
      maxE: cE + w / 2,
      minN: cN - h / 2,
      maxN: cN + h / 2,
    } as Bounds;
  }, [
    route,
    background,
    half,
    st.showBoundaries,
    st.view?.cE,
    st.view?.cN,
    st.view?.w,
    area.w,
    area.h,
  ]);

  const pick = useMatchPick();
  const picking = pick.active && pick.panelId === p.id;
  const kv = useKeyplanView();
  const viewing = kv.active && kv.panelId === p.id;
  const [zone, setZone] = useState(false);
  useEffect(() => {
    keyplanFit.set(p.id, (whole) => {
      const ed = useEditor.getState();
      if (!whole) {
        ed.updatePanel(p.id, { keyplan: { ...st, view: undefined } });
        return;
      }
      // The whole map: line, every chart frame and the background drawing.
      const b = emptyBounds();
      if (route) {
        const rb = routeBounds(route);
        extend(b, rb.minE, rb.minN);
        extend(b, rb.maxE, rb.maxN);
      }
      for (const f of frames) for (const [e, n] of f) extend(b, e, n);
      if (background) {
        extend(b, background.bounds.minE, background.bounds.minN);
        extend(b, background.bounds.maxE, background.bounds.maxN);
      }
      if (!Number.isFinite(b.minE)) return;
      ed.updatePanel(p.id, {
        keyplan: { ...st, view: viewFitting(b, area.w / area.h) },
      });
    });
    return () => {
      keyplanFit.delete(p.id);
    };
  });
  // Hover info: grid coordinates under the pointer.
  useEffect(() => {
    if (!view) return;
    const k = area.w / (view.maxE - view.minE);
    hoverSources.set(p.id, {
      rect: area,
      info: (x, y) => {
        const e = view.minE + (x - area.x) / k;
        const n = view.maxN - (y - area.y) / k;
        const lines = [`E ${e.toFixed(2)}`, `N ${n.toFixed(2)}`];
        if (route) {
          const k0 = (parseFloat(template.fields.START_KP ?? "0") || 0) * 1000;
          const c = nearestChainage(route, e, n);
          const [pe, pn] = pointAt(route, c);
          lines.push(
            `Nearest KP ${((k0 + c) / 1000).toFixed(3)}, ${Math.hypot(e - pe, n - pn).toFixed(1)} m off the line`,
          );
        }
        return ["Key plan", ...lines];
      },
    });
    return () => {
      hoverSources.delete(p.id);
    };
  });

  const projectBg = useMemo(() => {
    if (!view) return null;
    const k = area.w / (view.maxE - view.minE);
    return (e: number, n: number): [number, number] => [
      area.x + (e - view.minE) * k,
      area.y + (view.maxN - n) * k,
    ];
  }, [view, area.x, area.y, area.w]);

  if (!view) {
    return (
      <g pointerEvents="none">
        <rect
          x={area.x}
          y={area.y}
          width={area.w}
          height={area.h}
          fill={st.background}
        />
        <text
          className="hint"
          x={p.x + p.w / 2}
          y={area.y + area.h / 2}
          fontSize={fontSize(1.6)}
          textAnchor="middle"
        >
          Key plan: drop the route (.dig) and a background DXF here
        </text>
      </g>
    );
  }

  const k = area.w / (view.maxE - view.minE);
  const sx = (e: number) => area.x + (e - view.minE) * k;
  const sy = (n: number) => area.y + (view.maxN - n) * k;
  const project = (e: number, n: number): [number, number] => [sx(e), sy(n)];
  const clipId = `kp-clip-${p.id}`;
  const lw = Math.max(0.12, Math.min(area.w, area.h) / 300);

  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={area.x} y={area.y} width={area.w} height={area.h} />
        </clipPath>
      </defs>
      <rect
        x={area.x}
        y={area.y}
        width={area.w}
        height={area.h}
        fill={st.background}
      />
      {viewing && (
        <rect
          className="kp-pan-layer"
          data-kview={[
            view.minE,
            view.maxN,
            k,
            area.x,
            area.y,
            p.id,
            area.w,
            area.h,
          ].join(",")}
          x={area.x}
          y={area.y}
          width={area.w}
          height={area.h}
          fill="transparent"
          pointerEvents="all"
          style={{ cursor: "grab" }}
        />
      )}
      <g clipPath={`url(#${clipId})`}>
        {projectBg && (
          <LineworkLayer
            sets={sets}
            area={view}
            project={projectBg}
            mmPerM={k}
            widthScale={lw * 3.3}
          />
        )}
        {route && routeShown && (
          <path
            d={routePath(route, project, 0.05)}
            fill="none"
            stroke={st.routeColor}
            strokeWidth={lw * 2}
            strokeLinejoin="round"
          />
        )}
        {st.showBoundaries &&
          frames.map((f, i) => {
            const pts = f
              .map(([e, n]) => `${sx(e).toFixed(2)},${sy(n).toFixed(2)}`)
              .join(" ");
            const cur = i === sheetIndex;
            const zoneHandlers = cur
              ? {
                  onPointerEnter: () => setZone(true),
                  onPointerLeave: () => setZone(false),
                }
              : {};
            return (
              <g key={i}>
                <polygon
                  points={pts}
                  fill="none"
                  stroke={cur ? st.currentColor : st.boundaryColor}
                  strokeWidth={cur ? lw * 2.4 : lw * 1.6}
                />
                {cur && (
                  <polygon
                    points={pts}
                    fill="transparent"
                    pointerEvents="all"
                    data-kzone
                    {...zoneHandlers}
                  />
                )}
                <polygon
                  className="kp-frame-hit"
                  points={pts}
                  data-frame={i}
                  data-view={[view.minE, view.maxN, k, area.x, area.y].join(
                    ",",
                  )}
                  pointerEvents="stroke"
                  strokeWidth={Math.max(lw * 6, 0.8)}
                  {...zoneHandlers}
                >
                  <title>{`Chart ${i + 1}: drag along the line to fine-tune`}</title>
                </polygon>
              </g>
            );
          })}
      </g>
      {st.showBoundaries &&
        frames[sheetIndex] &&
        frames[sheetIndex].length === 4 && (
          <RotateHandle
            f={frames[sheetIndex]}
            sx={sx}
            sy={sy}
            index={sheetIndex}
            viewAttr={[view.minE, view.maxN, k, area.x, area.y].join(",")}
            lw={lw}
            color={st.currentColor}
            area={area}
            show={zone || kv.rotating}
            onZone={setZone}
          />
        )}
      {route && (st.showMatchlines || picking) && (
        <g clipPath={`url(#${clipId})`}>
          <KeyplanMatchlines
            template={template}
            route={route}
            project={project}
            half={half}
            lw={lw}
            picking={picking}
          />
        </g>
      )}
      {picking && (
        <g
          className="mpick-layer"
          data-mview={[view.minE, view.maxN, k, area.x, area.y].join(",")}
          pointerEvents="all"
          clipPath={`url(#${clipId})`}
        >
          <rect
            x={area.x}
            y={area.y}
            width={area.w}
            height={area.h}
            fill="transparent"
            style={{ cursor: "crosshair" }}
          />
          {[sheetIndex - 1, sheetIndex].map((b) => {
            if (b < 0 || b + 1 >= frames.length) return null;
            const o = clipPolygon(frames[b], frames[b + 1]);
            if (o.length < 3) return null;
            return (
              <polygon
                key={b}
                className="mpick-overlap"
                data-mpick={b}
                points={o
                  .map(([e, n]) => `${sx(e).toFixed(2)},${sy(n).toFixed(2)}`)
                  .join(" ")}
                fill="#22c55e"
                fillOpacity={0.35}
                stroke="#15803d"
                strokeWidth={lw * 2}
                style={{
                  cursor: pick.tool === "pick" ? "pointer" : "crosshair",
                }}
              >
                <title>{`Overlap of Charts ${b + 1} and ${b + 2}${pick.tool === "pick" ? ": click to put their matchline here" : ""}`}</title>
              </polygon>
            );
          })}
          {pick.tool === "draw" && pick.first && (
            <>
              <circle
                cx={sx(pick.first[0])}
                cy={sy(pick.first[1])}
                r={lw * 3}
                fill="#15803d"
              />
              {pick.hover && (
                <line
                  x1={sx(pick.first[0])}
                  y1={sy(pick.first[1])}
                  x2={sx(pick.hover[0])}
                  y2={sy(pick.hover[1])}
                  stroke="#15803d"
                  strokeWidth={lw * 2.4}
                  strokeDasharray={`${lw * 6} ${lw * 3}`}
                />
              )}
            </>
          )}
        </g>
      )}
      {st.showGrid && (
        <Grid
          area={area}
          view={view}
          sx={sx}
          sy={sy}
          spacing={
            st.gridSpacing ||
            niceGrid(Math.max(view.maxE - view.minE, view.maxN - view.minN))
          }
          color={st.gridColor}
          lw={lw}
        />
      )}
      {st.showNorthArrow && (
        <NorthArrow
          x={area.x + area.w - Math.min(area.w, area.h) * 0.08}
          y={area.y + Math.min(area.w, area.h) * 0.12}
          size={Math.min(area.w, area.h) * 0.13}
        />
      )}
    </g>
  );
}

/** Every chart's matchlines in the key plan: across the line, as wide as the chart frames. */
function KeyplanMatchlines({
  template,
  route,
  project,
  half,
  lw,
  picking,
}: {
  picking: boolean;
  template: ChartTemplate;
  route: Route;
  project: (e: number, n: number) => [number, number];
  half: number;
  lw: number;
}) {
  const plan = planPanel(template);
  const ml = { ...DEFAULT_MATCHLINES, ...(plan ? planStyle(plan).match : {}) };
  const k0 = (parseFloat(template.fields.START_KP ?? "0") || 0) * 1000;
  const n = sheetCount(template);
  const ranges = Array.from({ length: n }, (_, i) => {
    const r = sheetRange(template, i);
    return { start: r.start * 1000, end: r.end * 1000 };
  });
  const shown = ranges.map((_, i) => {
    const r = chartKpRange(template, i);
    return { start: r.start * 1000, end: r.end * 1000 };
  });
  return (
    <g>
      {boundaryLines(ranges, ml.mode, shown, ml.pairs).map((m) => {
        const c = pointAt(route, m.kp - k0);
        let d: [number, number];
        if (m.a && m.b) d = [m.b[0] - m.a[0], m.b[1] - m.a[1]];
        else {
          const p1 = pointAt(route, m.kp - k0 + 1);
          const p0 = pointAt(route, m.kp - k0 - 1);
          d = [-(p1[1] - p0[1]), p1[0] - p0[0]];
        }
        const l = Math.hypot(d[0], d[1]) || 1;
        const r = half || 50;
        const a = project(c[0] - (d[0] / l) * r, c[1] - (d[1] / l) * r);
        const b = project(c[0] + (d[0] / l) * r, c[1] + (d[1] / l) * r);
        const own = !!ml.pairs?.[String(m.boundary)];
        return (
          <line
            key={m.boundary}
            className="kp-matchline"
            data-boundary={m.boundary}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke={own && picking ? "#15803d" : ml.color}
            strokeWidth={lw * 2.2}
            strokeDasharray={`${lw * 8} ${lw * 3} ${lw * 1.5} ${lw * 3}`}
          >
            <title>{`Matchline of Charts ${m.boundary + 1} and ${m.boundary + 2}, KP ${(m.kp / 1000).toFixed(3)}${own ? " (chosen in the key plan)" : ""}`}</title>
          </line>
        );
      })}
    </g>
  );
}

/**
 * A round grip off the end of the current chart's frame; drag it to turn the frame. It shows
 * while the pointer is over the chart's box (or while it is dragged). When the box, or the
 * grip, is outside the key plan it is always shown, held at the panel's edge.
 */
function RotateHandle({
  f,
  sx,
  sy,
  index,
  viewAttr,
  lw,
  color,
  area,
  show,
  onZone,
}: {
  f: [number, number][];
  sx: (e: number) => number;
  sy: (n: number) => number;
  index: number;
  viewAttr: string;
  lw: number;
  color: string;
  area: { x: number; y: number; w: number; h: number };
  show: boolean;
  onZone(v: boolean): void;
}) {
  const ce = (f[0][0] + f[2][0]) / 2;
  const cn = (f[0][1] + f[2][1]) / 2;
  const me = (f[1][0] + f[2][0]) / 2;
  const mn = (f[1][1] + f[2][1]) / 2;
  const [cx, cy] = [sx(ce), sy(cn)];
  const [mx, my] = [sx(me), sy(mn)];
  const d = Math.hypot(mx - cx, my - cy) || 1;
  const off = Math.max(lw * 10, 1.6);
  const hx = mx + ((mx - cx) / d) * off;
  const hy = my + ((my - cy) / d) * off;
  const r = Math.max(lw * 4, 0.7);
  const m = r + lw * 2;
  const within = (x: number, y: number) =>
    x >= area.x + m &&
    x <= area.x + area.w - m &&
    y >= area.y + m &&
    y <= area.y + area.h - m;
  // Is any of the chart's box inside the key plan? If not, the grip stays on show.
  const xs = f.map(([e]) => sx(e));
  const ys = f.map(([, n]) => sy(n));
  const seen =
    Math.max(...xs) >= area.x &&
    Math.min(...xs) <= area.x + area.w &&
    Math.max(...ys) >= area.y &&
    Math.min(...ys) <= area.y + area.h;
  const out = !within(hx, hy);
  if (!show && seen) return null;
  const px = Math.min(Math.max(hx, area.x + m), area.x + area.w - m);
  const py = Math.min(Math.max(hy, area.y + m), area.y + area.h - m);
  const zone = {
    onPointerEnter: () => onZone(true),
    onPointerLeave: () => onZone(false),
  };
  return (
    <g data-rotate-handle={seen ? "hover" : "always"}>
      {!out && (
        <>
          <line
            x1={mx}
            y1={my}
            x2={px}
            y2={py}
            stroke={color}
            strokeWidth={lw}
          />
          <line
            x1={mx}
            y1={my}
            x2={px}
            y2={py}
            stroke="transparent"
            strokeWidth={Math.max(lw * 8, 1.2)}
            pointerEvents="stroke"
            {...zone}
          />
        </>
      )}
      <circle
        className="kp-rotate"
        cx={px}
        cy={py}
        r={r}
        fill="#fff"
        stroke={color}
        strokeWidth={lw * 1.4}
        strokeDasharray={out ? `${lw * 2} ${lw * 1.5}` : undefined}
        pointerEvents="all"
        data-frame={index}
        data-view={viewAttr}
        data-centre={`${ce},${cn}`}
        {...zone}
      >
        <title>
          {!seen
            ? `Chart ${index + 1} is outside the key plan: drag this to rotate it (hold Shift for any angle)`
            : "Drag to rotate this chart (hold Shift for any angle)"}
        </title>
      </circle>
    </g>
  );
}

function Grid({
  area,
  view,
  sx,
  sy,
  spacing,
  color,
  lw,
}: {
  area: { x: number; y: number; w: number; h: number };
  view: Bounds;
  sx: (e: number) => number;
  sy: (n: number) => number;
  spacing: number;
  color: string;
  lw: number;
}) {
  const es: number[] = [];
  const ns: number[] = [];
  for (
    let e = Math.ceil(view.minE / spacing) * spacing;
    e <= view.maxE;
    e += spacing
  )
    es.push(e);
  for (
    let n = Math.ceil(view.minN / spacing) * spacing;
    n <= view.maxN;
    n += spacing
  )
    ns.push(n);
  const cap = Math.max(0.9, Math.min(area.w, area.h) / 45);
  const tick = cap * 1.4;
  const cross = cap * 0.9;
  const fs = fontSize(cap);
  const label = (v: number) => Math.round(v).toString();
  return (
    <g stroke={color} fill={color} strokeWidth={lw * 1.4}>
      <rect
        x={area.x}
        y={area.y}
        width={area.w}
        height={area.h}
        fill="none"
        strokeWidth={lw * 3}
      />
      {es.map((e) => {
        const x = sx(e);
        return (
          <g key={`e${e}`}>
            <line x1={x} y1={area.y} x2={x} y2={area.y + tick} />
            <line
              x1={x}
              y1={area.y + area.h}
              x2={x}
              y2={area.y + area.h - tick}
            />
            <text
              stroke="none"
              fontSize={fs}
              fontWeight="bold"
              textAnchor="end"
              transform={`translate(${x - fs * 0.2} ${area.y + tick + 0.4}) rotate(-90)`}
            >
              {label(e)}E
            </text>
            <text
              stroke="none"
              fontSize={fs}
              fontWeight="bold"
              transform={`translate(${x - fs * 0.2} ${area.y + area.h - tick - 0.4}) rotate(-90)`}
            >
              {label(e)}E
            </text>
            {ns.map((n) => (
              <g key={n}>
                <line x1={x - cross} y1={sy(n)} x2={x + cross} y2={sy(n)} />
                <line x1={x} y1={sy(n) - cross} x2={x} y2={sy(n) + cross} />
              </g>
            ))}
          </g>
        );
      })}
      {ns.map((n) => {
        const y = sy(n);
        return (
          <g key={`n${n}`}>
            <line x1={area.x} y1={y} x2={area.x + tick} y2={y} />
            <line
              x1={area.x + area.w}
              y1={y}
              x2={area.x + area.w - tick}
              y2={y}
            />
            <text
              stroke="none"
              fontSize={fs}
              x={area.x + tick + 0.4}
              y={y - 0.4}
            >
              {label(n)}N
            </text>
            <text
              stroke="none"
              fontSize={fs}
              x={area.x + area.w - tick - 0.4}
              y={y - 0.4}
              textAnchor="end"
            >
              {label(n)}N
            </text>
          </g>
        );
      })}
    </g>
  );
}

function NorthArrow({ x, y, size }: { x: number; y: number; size: number }) {
  const w = size * 0.28;
  return (
    <g stroke="#666" strokeWidth={size * 0.04} fill="#888">
      <path
        d={`M${x} ${y - size / 2} L${x + w} ${y + size * 0.25} L${x} ${y + size * 0.1} Z`}
      />
      <path
        d={`M${x} ${y - size / 2} L${x - w} ${y + size * 0.25} L${x} ${y + size * 0.1} Z`}
        fill="none"
      />
      <line x1={x} y1={y + size * 0.1} x2={x} y2={y + size * 0.55} />
      <text
        x={x}
        y={y + size * 0.42}
        fontSize={size * 0.38}
        fontWeight="bold"
        textAnchor="middle"
        fill="#666"
        stroke="none"
      >
        N
      </text>
    </g>
  );
}
