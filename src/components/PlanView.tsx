import { useMemo, type ReactElement } from 'react';
import { chartGeometry, gridToPlan, pointAt, type Bounds, type ChartGeometry } from '../model/route';
import type { ChartTemplate, Panel, PlanStyle } from '../model/types';
import { useSurvey } from '../state/surveyData';
import { niceGrid } from './Keyplan';
import { linesPath, routePath } from './linework';
import { fontSize, measureText } from './svgText';

export const DEFAULT_PLAN: PlanStyle = {
  routeColor: '#e00000',
  routeWidth: 0.5,
  dxfColor: '#8a8a8a',
  showKp: true,
  kpInterval: 500,
  kpColor: '#e00000',
  kpFill: '#ffffff',
  kpTextColor: '#e00000',
  kpTextSize: 1.5,
  kpBlockSize: 8,
  kpStem: 10,
  showGrid: true,
  gridSpacing: 0,
  gridTextSize: 2,
  gridTextColor: '#3d6170',
  crossSize: 6,
  crossColor: '#3d6170',
  tickSize: 3,
  tickColor: '#3d6170',
};

export const planStyle = (p: Panel): PlanStyle => ({ ...DEFAULT_PLAN, ...p.plan });

type Rect = { x: number; y: number; w: number; h: number };
type Pt = [number, number];

/**
 * The plan view for one chart: background DXF, the survey line with KP blocks and
 * an easting/northing grid, turned so the line runs left to right (alignment
 * sheets) or kept north-up.
 */
export function PlanView({ p, template, sheetIndex, tokens }: { p: Panel; template: ChartTemplate; sheetIndex: number; tokens: Record<string, string> }) {
  const route = useSurvey((s) => s.route);
  const background = useSurvey((s) => s.background);
  const st = planStyle(p);
  const rect = useMemo(() => ({ x: p.x, y: p.y, w: p.w, h: p.h }), [p.x, p.y, p.w, p.h]);
  const along = (p.w * template.scale.horizontal) / 1000;
  const across = (p.h * template.scale.horizontal) / 1000;

  const geo = useMemo<ChartGeometry | null>(() => {
    if (route) return chartGeometry(template, route, sheetIndex);
    if (!background) return null;
    // No route yet: show the middle of the background at the chart scale.
    const b = background.bounds;
    return { origin: [(b.minE + b.maxE) / 2 - along / 2, (b.minN + b.maxN) / 2], u: [1, 0], along, across, northUp: true };
  }, [route, background, template, sheetIndex, along, across]);

  const paths = useMemo(() => {
    if (!geo) return null;
    const project = gridToPlan(geo, rect);
    return {
      bg: background ? linesPath(background.lines, frameBounds(geo), project, 0.05) : '',
      route: route ? routePath(route, project, 0.05) : '',
    };
  }, [geo, background, route, rect]);

  if (!geo || !paths) return null;
  const project = gridToPlan(geo, rect);
  const clipId = `plan-clip-${p.id}`;
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {paths.bg && <path d={paths.bg} fill="none" stroke={st.dxfColor} strokeWidth={0.18} />}
        {st.showGrid && <PlanGrid geo={geo} rect={rect} st={st} />}
        {paths.route && <path d={paths.route} fill="none" stroke={st.routeColor} strokeWidth={st.routeWidth} strokeLinejoin="round" />}
        {route && st.showKp && <KpBlocks template={template} project={project} rect={rect} st={st} />}
      </g>
      {!route && (
        <>
          <text className="hint" x={p.x + 3} y={p.y + p.h - 3} fontSize={fontSize(2)}>
            KP {tokens.KP_START}
          </text>
          <text className="hint" x={p.x + p.w - 3} y={p.y + p.h - 3} fontSize={fontSize(2)} textAnchor="end">
            KP {tokens.KP_END}
          </text>
        </>
      )}
    </g>
  );
}

function KpBlocks({ template, project, rect, st }: { template: ChartTemplate; project: (e: number, n: number) => Pt; rect: Rect; st: PlanStyle }) {
  const route = useSurvey((s) => s.route)!;
  const k0 = (parseFloat(template.fields.START_KP ?? '0') || 0) * 1000;
  const interval = Math.max(1, st.kpInterval);
  const out = [];
  const half = st.kpBlockSize / 2;
  // Every block along the line is tested, so a rotated or extra chart still gets the right ones.
  for (let kp = Math.ceil(k0 / interval) * interval; kp <= k0 + route.length + 1e-6; kp += interval) {
    const [x, y] = project(...pointAt(route, kp - k0));
    if (x < rect.x - half || x > rect.x + rect.w + half || y < rect.y - half || y > rect.y + rect.h + half) continue;
    const top = y - st.kpStem;
    const cy = top - half;
    out.push(
      <g key={kp}>
        <line x1={x} y1={y} x2={x} y2={top} stroke={st.kpColor} strokeWidth={0.2} />
        <path d={`M${x} ${cy - half}L${x + half} ${cy}L${x} ${cy + half}L${x - half} ${cy}Z`} fill={st.kpFill} stroke={st.kpColor} strokeWidth={0.2} />
        <text x={x} y={cy + st.kpTextSize / 2} fontSize={fontSize(st.kpTextSize)} fontWeight="bold" textAnchor="middle" fill={st.kpTextColor}>
          {(kp / 1000).toFixed(3)}
        </text>
      </g>,
    );
    if (out.length > 400) break;
  }
  return <g>{out}</g>;
}

/** Easting/northing ticks at the frame edge and crosses inside, with labels that never collide. */
function PlanGrid({ geo, rect, st }: { geo: ChartGeometry; rect: Rect; st: PlanStyle }) {
  const project = gridToPlan(geo, rect);
  const toGrid = planToGrid(geo, rect);
  const corners = [toGrid(rect.x, rect.y), toGrid(rect.x + rect.w, rect.y), toGrid(rect.x, rect.y + rect.h), toGrid(rect.x + rect.w, rect.y + rect.h)];
  const b: Bounds = {
    minE: Math.min(...corners.map((c) => c[0])),
    maxE: Math.max(...corners.map((c) => c[0])),
    minN: Math.min(...corners.map((c) => c[1])),
    maxN: Math.max(...corners.map((c) => c[1])),
  };
  const spacing = st.gridSpacing > 0 ? st.gridSpacing : niceGrid((geo.along * 4) / Math.max(1, rect.w / 70));
  const es: number[] = [];
  const ns: number[] = [];
  for (let e = Math.ceil(b.minE / spacing) * spacing; e <= b.maxE && es.length < 200; e += spacing) es.push(e);
  for (let n = Math.ceil(b.minN / spacing) * spacing; n <= b.maxN && ns.length < 200; n += spacing) ns.push(n);

  const fs = fontSize(st.gridTextSize);
  const ticks: ReactElement[] = [];
  const labels: { x: number; y: number; angle: number; anchor: 'start' | 'end'; text: string; box: Bounds; dir: Pt }[] = [];
  const line = (a: Pt, c: Pt, key: string) => {
    const seg = clip(project(...a), project(...c), rect);
    if (!seg) return;
    const [p0, p1] = seg;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (len < 1e-6) return;
    const d: Pt = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    for (const [pt, dir] of [
      [p0, d],
      [p1, [-d[0], -d[1]]],
    ] as [Pt, Pt][]) {
      if (!onEdge(pt, rect)) continue;
      ticks.push(<line key={`${key}${pt[0]}`} x1={pt[0]} y1={pt[1]} x2={pt[0] + dir[0] * st.tickSize} y2={pt[1] + dir[1] * st.tickSize} stroke={st.tickColor} strokeWidth={0.2} />);
      labels.push(labelAt(pt, dir, key, st, fs));
    }
  };
  for (const e of es) line([e, b.minN], [e, b.maxN], `${Math.round(e)}E`);
  for (const n of ns) line([b.minE, n], [b.maxE, n], `${Math.round(n)}N`);

  // Keep a label only if its box stays inside the frame and clear of every label already kept.
  const kept: typeof labels = [];
  const pad = fs * 0.25;
  for (const l of labels) {
    // A label leaving the frame at a slant pokes out near its start; slide it inward along its line.
    for (let k = 0; k < 4; k++) {
      const over = Math.max(rect.x - l.box.minE, l.box.maxE - rect.x - rect.w, rect.y - l.box.minN, l.box.maxN - rect.y - rect.h);
      if (over <= 1e-6) break;
      const step = over + 0.2;
      l.x += l.dir[0] * step;
      l.y += l.dir[1] * step;
      l.box = { minE: l.box.minE + l.dir[0] * step, maxE: l.box.maxE + l.dir[0] * step, minN: l.box.minN + l.dir[1] * step, maxN: l.box.maxN + l.dir[1] * step };
    }
    const bx = l.box;
    if (bx.minE < rect.x || bx.maxE > rect.x + rect.w || bx.minN < rect.y || bx.maxN > rect.y + rect.h) continue;
    if (kept.some((k) => bx.minE < k.box.maxE + pad && bx.maxE > k.box.minE - pad && bx.minN < k.box.maxN + pad && bx.maxN > k.box.minN - pad)) continue;
    kept.push(l);
  }

  const [ux, uy] = [project(1, 0)[0] - project(0, 0)[0], project(1, 0)[1] - project(0, 0)[1]];
  const ul = Math.hypot(ux, uy);
  const de: Pt = [ux / ul, uy / ul];
  const dn: Pt = [-de[1], de[0]];
  const h = st.crossSize / 2;
  const crosses: ReactElement[] = [];
  for (const e of es)
    for (const n of ns) {
      const [x, y] = project(e, n);
      if (x < rect.x + h || x > rect.x + rect.w - h || y < rect.y + h || y > rect.y + rect.h - h) continue;
      crosses.push(
        <path key={`${e},${n}`} d={`M${x - de[0] * h} ${y - de[1] * h}L${x + de[0] * h} ${y + de[1] * h}M${x - dn[0] * h} ${y - dn[1] * h}L${x + dn[0] * h} ${y + dn[1] * h}`} stroke={st.crossColor} strokeWidth={0.2} />,
      );
    }

  return (
    <g>
      {crosses}
      {ticks}
      {kept.map((l, i) => (
        <text key={i} fontSize={fs} fill={st.gridTextColor} textAnchor={l.anchor} transform={`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.angle.toFixed(2)})`}>
          {l.text}
        </text>
      ))}
    </g>
  );
}

/** A label running inward along a grid line from where it meets the frame, sat just beside the tick. */
function labelAt(pt: Pt, dir: Pt, text: string, st: PlanStyle, fs: number) {
  let angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  let anchor: 'start' | 'end' = 'start';
  if (dir[0] < -1e-6 || (Math.abs(dir[0]) <= 1e-6 && dir[1] < 0)) {
    angle += 180;
    anchor = 'end';
  }
  const gap = st.tickSize * 0.3 + 0.6;
  // Baseline a little to the side of the line so the tick doesn't strike through the text.
  const rad = (angle * Math.PI) / 180;
  const side: Pt = [Math.sin(rad), -Math.cos(rad)];
  const x = pt[0] + dir[0] * gap + side[0] * fs * 0.15;
  const y = pt[1] + dir[1] * gap + side[1] * fs * 0.15;
  const w = measureText(text, st.gridTextSize);
  const hgt = st.gridTextSize * 1.1;
  // Four corners of the text box, for the collision check.
  const ax = Math.cos(rad);
  const ay = Math.sin(rad);
  const s0 = anchor === 'start' ? 0 : -w;
  const pts: Pt[] = [
    [s0, 0],
    [s0 + w, 0],
    [s0, -hgt],
    [s0 + w, -hgt],
  ].map(([u, v]) => [x + u * ax - v * ay, y + u * ay + v * ax]);
  const box: Bounds = {
    minE: Math.min(...pts.map((q) => q[0])),
    maxE: Math.max(...pts.map((q) => q[0])),
    minN: Math.min(...pts.map((q) => q[1])),
    maxN: Math.max(...pts.map((q) => q[1])),
  };
  return { x, y, angle, anchor, text, box, dir };
}

function onEdge([x, y]: Pt, r: Rect) {
  const eps = 1e-3;
  return Math.abs(x - r.x) < eps || Math.abs(x - r.x - r.w) < eps || Math.abs(y - r.y) < eps || Math.abs(y - r.y - r.h) < eps;
}

/** Liang–Barsky clip of a segment to a rectangle. */
function clip(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** Paper millimetres inside the plan view back to grid metres. */
function planToGrid(g: ChartGeometry, plan: Rect) {
  const s = plan.w / g.along;
  const [ux, uy] = g.u;
  const cy = plan.y + plan.h / 2;
  return (x: number, y: number): Pt => {
    const a = (x - plan.x) / s;
    const b = (cy - y) / s;
    return [g.origin[0] + a * ux - b * uy, g.origin[1] + a * uy + b * ux];
  };
}

/** Grid box around a chart's frame, for skipping background lines that can't show. */
function frameBounds(g: ChartGeometry): Bounds {
  const [ox, oy] = g.origin;
  const [ux, uy] = g.u;
  const h = g.across / 2;
  const xs = [ox - uy * h, ox + uy * h, ox + ux * g.along - uy * h, ox + ux * g.along + uy * h];
  const ys = [oy + ux * h, oy - ux * h, oy + uy * g.along + ux * h, oy + uy * g.along - ux * h];
  return { minE: Math.min(...xs), maxE: Math.max(...xs), minN: Math.min(...ys), maxN: Math.max(...ys) };
}
