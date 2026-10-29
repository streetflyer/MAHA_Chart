import { useMemo } from 'react';
import type { Linework } from '../model/dxf';
import { chartFrames, emptyBounds, extend, routeBounds, type Bounds, type Route } from '../model/route';
import type { ChartTemplate, KeyplanStyle, Panel } from '../model/types';
import { useSurvey } from '../state/surveyData';
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
  const background = useSurvey((s) => s.background);
  const st = keyplanStyle(p);
  const area = { x: p.x + 0.6, y: top + 0.3, w: p.w - 1.2, h: p.y + p.h - top - 0.9 };
  const frames = useMemo(() => (route ? chartFrames(template, route) : []), [route, template]);

  const view = useMemo(() => {
    const b = emptyBounds();
    if (route) {
      const rb = routeBounds(route);
      extend(b, rb.minE, rb.minN);
      extend(b, rb.maxE, rb.maxN);
      if (st.showBoundaries) for (const f of frames) for (const [e, n] of f) extend(b, e, n);
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
  }, [route, background, frames, st.showBoundaries, area.w, area.h]);

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
        {background && <BackgroundLines lw={background} view={view} sx={sx} sy={sy} k={k} color={st.dxfColor} width={lw * 0.6} />}
        {route && <path d={routePath(route, sx, sy, k)} fill="none" stroke={st.routeColor} strokeWidth={lw * 2} strokeLinejoin="round" />}
        {st.showBoundaries &&
          frames.map((f, i) => (
            <polygon
              key={i}
              points={f.map(([e, n]) => `${sx(e).toFixed(2)},${sy(n).toFixed(2)}`).join(' ')}
              fill="none"
              stroke={i === sheetIndex ? st.currentColor : st.boundaryColor}
              strokeWidth={i === sheetIndex ? lw * 2.4 : lw * 1.6}
            />
          ))}
      </g>
      {st.showGrid && <Grid area={area} view={view} sx={sx} sy={sy} spacing={st.gridSpacing || niceGrid(Math.max(view.maxE - view.minE, view.maxN - view.minN))} color={st.gridColor} lw={lw} />}
      {st.showNorthArrow && <NorthArrow x={area.x + area.w - Math.min(area.w, area.h) * 0.08} y={area.y + Math.min(area.w, area.h) * 0.12} size={Math.min(area.w, area.h) * 0.13} />}
    </g>
  );
}

function routePath(r: Route, sx: (e: number) => number, sy: (n: number) => number, k: number): string {
  // Drop vertices closer than ~0.05 mm on paper; a long route has one per metre.
  const tol = 0.05 / k;
  let d = `M${sx(r.en[0]).toFixed(2)} ${sy(r.en[1]).toFixed(2)}`;
  let le = r.en[0];
  let ln = r.en[1];
  const last = r.en.length - 2;
  for (let i = 2; i <= last; i += 2) {
    const e = r.en[i];
    const n = r.en[i + 1];
    if (i !== last && Math.abs(e - le) < tol && Math.abs(n - ln) < tol) continue;
    d += `L${sx(e).toFixed(2)} ${sy(n).toFixed(2)}`;
    le = e;
    ln = n;
  }
  return d;
}

function BackgroundLines({ lw, view, sx, sy, k, color, width }: { lw: Linework; view: Bounds; sx: (e: number) => number; sy: (n: number) => number; k: number; color: string; width: number }) {
  const d = useMemo(() => {
    const tol = 0.08 / k;
    const parts: string[] = [];
    for (const l of lw.lines) {
      let inView = false;
      for (let i = 0; i < l.length && !inView; i += 2) inView = l[i] >= view.minE && l[i] <= view.maxE && l[i + 1] >= view.minN && l[i + 1] <= view.maxN;
      if (!inView) continue;
      let s = `M${sx(l[0]).toFixed(2)} ${sy(l[1]).toFixed(2)}`;
      let le = l[0];
      let ln = l[1];
      for (let i = 2; i < l.length; i += 2) {
        if (i < l.length - 2 && Math.abs(l[i] - le) < tol && Math.abs(l[i + 1] - ln) < tol) continue;
        s += `L${sx(l[i]).toFixed(2)} ${sy(l[i + 1]).toFixed(2)}`;
        le = l[i];
        ln = l[i + 1];
      }
      parts.push(s);
    }
    return parts.join('');
  }, [lw, view, sx, sy, k]);
  return <path d={d} fill="none" stroke={color} strokeWidth={width} />;
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
