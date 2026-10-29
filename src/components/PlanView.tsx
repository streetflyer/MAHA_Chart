import { useMemo, type ReactElement } from 'react';
import { chartGeometry, gridToPlan, pointAt, type Bounds, type ChartGeometry } from '../model/route';
import type { ChartTemplate, Panel, PlanStyle } from '../model/types';
import { DEFAULT_PLAN, kpInterval, planStyle } from '../model/planStyle';
import { useSurvey } from '../state/surveyData';

export { DEFAULT_PLAN, planStyle };
import { niceGrid } from './Keyplan';
import { linesPath, routePath } from './linework';
import { fontSize, measureText } from './svgText';


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
      {st.showNorth && <PlanNorth p={p} project={project} st={st} />}
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
  const interval = kpInterval(st, template.scale.horizontal);
  const out = [];
  const size = st.kpBlockSize;
  const half = size / 2;
  const reach = st.kpStem + size;
  const rot = (st.kpRotation * Math.PI) / 180;
  // Every block along the line is tested, so a turned or extra chart still gets the right ones.
  for (let kp = Math.ceil(k0 / interval) * interval; kp <= k0 + route.length + 1e-6; kp += interval) {
    const [x, y] = project(...pointAt(route, kp - k0));
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    // Stand the block up from the line; hang it below instead if it would leave the frame.
    let dx = Math.sin(rot);
    let dy = -Math.cos(rot);
    const tipY = y + dy * reach;
    const tipX = x + dx * reach;
    if (tipY < rect.y || tipY > rect.y + rect.h || tipX < rect.x || tipX > rect.x + rect.w) {
      dx = -dx;
      dy = -dy;
    }
    const sx = x + dx * st.kpStem;
    const sy = y + dy * st.kpStem;
    const cx = sx + dx * half;
    const cy = sy + dy * half;
    const label = (kp / 1000).toFixed(3);
    // Shrink the text if it would spill out of the diamond.
    const cap = Math.min(st.kpTextSize, (st.kpTextSize * size * 0.58) / Math.max(measureText(label, st.kpTextSize, true), 1e-6));
    out.push(
      <g key={kp}>
        <line x1={x} y1={y} x2={sx} y2={sy} stroke={st.kpColor} strokeWidth={0.2} />
        <g transform={`rotate(${st.kpRotation} ${cx} ${cy})`}>
          <path d={`M${cx} ${cy - half}L${cx + half} ${cy}L${cx} ${cy + half}L${cx - half} ${cy}Z`} fill={st.kpFill} stroke={st.kpColor} strokeWidth={0.25} />
          <text x={cx} y={cy + cap / 2} fontSize={fontSize(cap)} fontWeight="bold" textAnchor="middle" fill={st.kpTextColor}>
            {label}
          </text>
        </g>
      </g>,
    );
    if (out.length > 400) break;
  }
  return <g>{out}</g>;
}

/** Grid north arrow; drag it to place it anywhere in the plan view. */
function PlanNorth({ p, project, st }: { p: Panel; project: (e: number, n: number) => Pt; st: PlanStyle }) {
  const [x0, y0] = project(0, 0);
  const [x1, y1] = project(0, 1000);
  const angle = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
  const s = st.northSize;
  const x = p.x + st.northX * p.w;
  const y = p.y + st.northY * p.h;
  const w = s * 0.28;
  return (
    <g data-north={p.id} pointerEvents="all" style={{ cursor: 'move' }} transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-s * 0.4} y={-s * 0.55} width={s * 0.8} height={s * 1.15} fill="transparent" />
      <g stroke={st.northColor} strokeWidth={s * 0.035} fill={st.northColor}>
        <path d={`M0 ${-s / 2} L${w} ${s * 0.25} L0 ${s * 0.1} Z`} />
        <path d={`M0 ${-s / 2} L${-w} ${s * 0.25} L0 ${s * 0.1} Z`} fill="none" />
        <line x1={0} y1={s * 0.1} x2={0} y2={s * 0.55} />
      </g>
      <text x={0} y={s * 0.45} fontSize={s * 0.36} fontWeight="bold" textAnchor="middle" fill={st.northColor} transform={`rotate(${-angle} 0 ${s * 0.32})`}>
        N
      </text>
      <title>Drag to move the north arrow</title>
    </g>
  );
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
