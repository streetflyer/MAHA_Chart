import { useMemo } from 'react';
import { planPanel } from '../model/scale';
import { chartFrames, emptyBounds, extend, routeBounds, type Bounds } from '../model/route';
import type { ChartTemplate, KeyplanStyle, Panel } from '../model/types';
import { useSurvey } from '../state/surveyData';
import { routePath } from './linework';
import { LineworkLayer } from './LineworkLayer';
import { lineworkFor } from '../model/datasets';
import { fontSize } from './svgText';

export const DEFAULT_KEYPLAN: KeyplanStyle = {
  background: '#cfe6ff',
  dxfColor: '#8a8a8a',
  routeColor: '#7a7a7a',
  boundaryColor: '#000000',
  currentColor: '#e00000',
  gridSpacing: 0,
  gridColor: '#5b9bb5',
  showGrid: true,
  showNorthArrow: true,
  showBoundaries: true,
};

export const keyplanStyle = (p: Panel): KeyplanStyle => ({ ...DEFAULT_KEYPLAN, ...p.keyplan });

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
export function Keyplan({ p, top, template, sheetIndex }: { p: Panel; top: number; template: ChartTemplate; sheetIndex: number }) {
  const route = useSurvey((s) => s.route);
  const datasets = useSurvey((s) => s.datasets);
  const sets = useMemo(() => lineworkFor(datasets, 'siteplan'), [datasets]);
  const background = sets[0]?.lw ?? null;
  const st = keyplanStyle(p);
  const area = { x: p.x + 0.6, y: top + 0.3, w: p.w - 1.2, h: p.y + p.h - top - 0.9 };
  const frames = useMemo(() => (route ? chartFrames(template, route) : []), [route, template]);

  const half = ((planPanel(template)?.h ?? 0) * template.scale.horizontal) / 2000;
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
    return { minE: cE - w / 2, maxE: cE + w / 2, minN: cN - h / 2, maxN: cN + h / 2 } as Bounds;
  }, [route, background, half, st.showBoundaries, area.w, area.h]);

  const projectBg = useMemo(() => {
    if (!view) return null;
    const k = area.w / (view.maxE - view.minE);
    return (e: number, n: number): [number, number] => [area.x + (e - view.minE) * k, area.y + (view.maxN - n) * k];
  }, [view, area.x, area.y, area.w]);

  if (!view) {
    return (
      <g pointerEvents="none">
        <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={st.background} />
        <text className="hint" x={p.x + p.w / 2} y={area.y + area.h / 2} fontSize={fontSize(1.6)} textAnchor="middle">
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
      <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={st.background} />
      <g clipPath={`url(#${clipId})`}>
        {projectBg && <LineworkLayer sets={sets} area={view} project={projectBg} mmPerM={k} widthScale={lw * 3.3} />}
        {route && <path d={routePath(route, project, 0.05)} fill="none" stroke={st.routeColor} strokeWidth={lw * 2} strokeLinejoin="round" />}
        {st.showBoundaries &&
          frames.map((f, i) => {
            const pts = f.map(([e, n]) => `${sx(e).toFixed(2)},${sy(n).toFixed(2)}`).join(' ');
            return (
              <g key={i}>
                <polygon points={pts} fill="none" stroke={i === sheetIndex ? st.currentColor : st.boundaryColor} strokeWidth={i === sheetIndex ? lw * 2.4 : lw * 1.6} />
                <polygon
                  className="kp-frame-hit"
                  points={pts}
                  data-frame={i}
                  data-view={[view.minE, view.maxN, k, area.x, area.y].join(',')}
                  pointerEvents="stroke"
                  strokeWidth={Math.max(lw * 6, 0.8)}
                >
                  <title>{`Chart ${i + 1}: drag along the line to fine-tune`}</title>
                </polygon>
                {i === sheetIndex && <RotateHandle f={f} sx={sx} sy={sy} index={i} viewAttr={[view.minE, view.maxN, k, area.x, area.y].join(',')} lw={lw} color={st.currentColor} />}
              </g>
            );
          })}
      </g>
      {st.showGrid && <Grid area={area} view={view} sx={sx} sy={sy} spacing={st.gridSpacing || niceGrid(Math.max(view.maxE - view.minE, view.maxN - view.minN))} color={st.gridColor} lw={lw} />}
      {st.showNorthArrow && <NorthArrow x={area.x + area.w - Math.min(area.w, area.h) * 0.08} y={area.y + Math.min(area.w, area.h) * 0.12} size={Math.min(area.w, area.h) * 0.13} />}
    </g>
  );
}

/** A round grip off the end of the current chart's frame; drag it to turn the frame. */
function RotateHandle({ f, sx, sy, index, viewAttr, lw, color }: { f: [number, number][]; sx: (e: number) => number; sy: (n: number) => number; index: number; viewAttr: string; lw: number; color: string }) {
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
  return (
    <g>
      <line x1={mx} y1={my} x2={hx} y2={hy} stroke={color} strokeWidth={lw} />
      <circle
        className="kp-rotate"
        cx={hx}
        cy={hy}
        r={r}
        fill="#fff"
        stroke={color}
        strokeWidth={lw * 1.4}
        pointerEvents="all"
        data-frame={index}
        data-view={viewAttr}
        data-centre={`${ce},${cn}`}
      >
        <title>Drag to rotate this chart (hold Shift for any angle)</title>
      </circle>
    </g>
  );
}

function Grid({ area, view, sx, sy, spacing, color, lw }: { area: { x: number; y: number; w: number; h: number }; view: Bounds; sx: (e: number) => number; sy: (n: number) => number; spacing: number; color: string; lw: number }) {
  const es: number[] = [];
  const ns: number[] = [];
  for (let e = Math.ceil(view.minE / spacing) * spacing; e <= view.maxE; e += spacing) es.push(e);
  for (let n = Math.ceil(view.minN / spacing) * spacing; n <= view.maxN; n += spacing) ns.push(n);
  const cap = Math.max(0.9, Math.min(area.w, area.h) / 45);
  const tick = cap * 1.4;
  const cross = cap * 0.9;
  const fs = fontSize(cap);
  const label = (v: number) => Math.round(v).toString();
  return (
    <g stroke={color} fill={color} strokeWidth={lw * 1.4}>
      <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="none" strokeWidth={lw * 3} />
      {es.map((e) => {
        const x = sx(e);
        return (
          <g key={`e${e}`}>
            <line x1={x} y1={area.y} x2={x} y2={area.y + tick} />
            <line x1={x} y1={area.y + area.h} x2={x} y2={area.y + area.h - tick} />
            <text stroke="none" fontSize={fs} fontWeight="bold" textAnchor="end" transform={`translate(${x - fs * 0.2} ${area.y + tick + 0.4}) rotate(-90)`}>
              {label(e)}E
            </text>
            <text stroke="none" fontSize={fs} fontWeight="bold" transform={`translate(${x - fs * 0.2} ${area.y + area.h - tick - 0.4}) rotate(-90)`}>
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
            <line x1={area.x + area.w} y1={y} x2={area.x + area.w - tick} y2={y} />
            <text stroke="none" fontSize={fs} x={area.x + tick + 0.4} y={y - 0.4}>
              {label(n)}N
            </text>
            <text stroke="none" fontSize={fs} x={area.x + area.w - tick - 0.4} y={y - 0.4} textAnchor="end">
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
      <path d={`M${x} ${y - size / 2} L${x + w} ${y + size * 0.25} L${x} ${y + size * 0.1} Z`} />
      <path d={`M${x} ${y - size / 2} L${x - w} ${y + size * 0.25} L${x} ${y + size * 0.1} Z`} fill="none" />
      <line x1={x} y1={y + size * 0.1} x2={x} y2={y + size * 0.55} />
      <text x={x} y={y + size * 0.42} fontSize={size * 0.38} fontWeight="bold" textAnchor="middle" fill="#666" stroke="none">
        N
      </text>
    </g>
  );
}
