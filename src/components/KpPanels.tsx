import { useMemo, type ReactElement } from 'react';
import type { Dataset } from '../model/datasets';
import { kpInterval, planStyle } from '../model/planStyle';
import { chartGeometry, gridToPlan, pointAt, type Route } from '../model/route';
import { planPanel, sheetRange } from '../model/scale';
import type { ChartTemplate, Panel } from '../model/types';
import { useSurvey } from '../state/surveyData';
import { niceGrid } from './Keyplan';
import { fontSize } from './svgText';

/**
 * Paper x of a KP (metres) for one chart. With a route loaded it is where that KP
 * falls in the plan view, so every KP-aligned panel lines up under the plan view;
 * without one it runs evenly across the chart's KP range.
 */
export function kpToX(t: ChartTemplate, route: Route | null, sheetIndex: number): ((kp: number) => number) | null {
  const plan = planPanel(t);
  if (!plan) return null;
  const k0 = (parseFloat(t.fields.START_KP ?? '0') || 0) * 1000;
  if (route) {
    const g = chartGeometry(t, route, sheetIndex);
    if (!g) return null;
    const project = gridToPlan(g, plan);
    return (kp) => project(...pointAt(route, kp - k0))[0];
  }
  const { start, end } = sheetRange(t, sheetIndex);
  return (kp) => plan.x + ((kp / 1000 - start) / (end - start)) * plan.w;
}

export function useKpToX(t: ChartTemplate, sheetIndex: number) {
  const route = useSurvey((s) => s.route);
  return useMemo(() => kpToX(t, route, sheetIndex), [t, route, sheetIndex]);
}

/** Visible KP span of a panel, found by stepping the mapping (it may be non-linear on a turned chart). */
function kpSpan(toX: (kp: number) => number, x0: number, x1: number, routeLen: number, k0: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const step = Math.max(1, routeLen / 4000);
  for (let kp = k0 - routeLen * 0.05; kp <= k0 + routeLen * 1.05; kp += step) {
    const x = toX(kp);
    if (x >= x0 && x <= x1) {
      lo = Math.min(lo, kp);
      hi = Math.max(hi, kp);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Light KP lines down a KP-aligned panel, at the same interval as the plan view's KP blocks. */
function KpLines({ p, t, toX, x0 }: { p: Panel; t: ChartTemplate; toX: (kp: number) => number; x0: number }) {
  const route = useSurvey((s) => s.route);
  const plan = planPanel(t);
  if (!plan) return null;
  const interval = kpInterval(planStyle(plan), t.scale.horizontal);
  const k0 = (parseFloat(t.fields.START_KP ?? '0') || 0) * 1000;
  const len = route?.length ?? t.scale.routeLength;
  const out: ReactElement[] = [];
  for (let kp = Math.ceil(k0 / interval) * interval; kp <= k0 + len + 1e-6 && out.length < 300; kp += interval) {
    const x = toX(kp);
    if (x < x0 || x > p.x + p.w) continue;
    out.push(<line key={kp} className="kp-line" x1={x} y1={p.y} x2={x} y2={p.y + p.h} />);
  }
  return <g>{out}</g>;
}

/** Data drawn in the longitudinal, transverse, events and CP panels for the current chart. */
export function KpPanelData({ p, t, sheetIndex }: { p: Panel; t: ChartTemplate; sheetIndex: number }) {
  const toX = useKpToX(t, sheetIndex);
  const datasets = useSurvey((s) => s.datasets);
  const route = useSurvey((s) => s.route);
  if (!toX) return null;
  const x0 = p.type === 'events' ? p.x + (p.labelWidth ?? 30) : p.x;
  const clipId = `kp-clip-${p.id}`;
  const k0 = (parseFloat(t.fields.START_KP ?? '0') || 0) * 1000;
  const len = route?.length ?? t.scale.routeLength;
  const span = kpSpan(toX, x0, p.x + p.w, len, k0);
  const mine = datasets.filter((d) => d.visible && targetPanel(d) === p.type);
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={x0} y={p.y} width={p.x + p.w - x0} height={p.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {(route || mine.length > 0) && <KpLines p={p} t={t} toX={toX} x0={x0} />}
        {span &&
          mine.map((d) => {
            if (d.kind === 'long') return <LongProfile key={d.id} d={d} p={p} t={t} toX={toX} span={span} />;
            if (d.kind === 'events') return <Events key={d.id} d={d} p={p} toX={toX} span={span} />;
            if (d.kind === 'cp') return <Cp key={d.id} d={d} p={p} toX={toX} span={span} />;
            if (d.kind === 'trans') return <TransMarks key={d.id} d={d} p={p} toX={toX} span={span} />;
            return null;
          })}
      </g>
    </g>
  );
}

const targetPanel = (d: Dataset) => ({ long: 'longProfile', trans: 'transProfile', events: 'events', cp: 'cp' })[d.target as string];

function indexRange(kp: Float64Array, [lo, hi]: [number, number]): [number, number] {
  let a = 0;
  while (a < kp.length && kp[a] < lo) a++;
  let b = kp.length - 1;
  while (b > 0 && kp[b] > hi) b--;
  return [Math.max(0, a - 1), Math.min(kp.length - 1, b + 1)];
}

/** Depth lines at the longitudinal vertical scale, centred on the data shown in this chart. */
function LongProfile({ d, p, t, toX, span }: { d: Extract<Dataset, { kind: 'long' }>; p: Panel; t: ChartTemplate; toX: (kp: number) => number; span: [number, number] }) {
  const [a, b] = indexRange(d.kp, span);
  let min = Infinity;
  let max = -Infinity;
  for (const s of d.series)
    for (let i = a; i <= b; i++) {
      const v = s.values[i];
      if (Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
  if (!Number.isFinite(min)) return null;
  const k = 1000 / Math.max(1, t.scale.verticalLong);
  const cy = p.y + p.h / 2;
  const mid = (min + max) / 2;
  const y = (v: number) => cy + (v - mid) * k;
  const stride = Math.max(1, Math.floor((b - a) / 3000));
  const paths = d.series.map((s, j) => {
    let path = '';
    let pen = false;
    for (let i = a; i <= b; i += stride) {
      const v = s.values[i];
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      path += `${pen ? 'L' : 'M'}${toX(d.kp[i]).toFixed(2)} ${y(v).toFixed(2)}`;
      pen = true;
    }
    return <path key={j} d={path} fill="none" stroke={s.color} strokeWidth={0.25} />;
  });
  // Depth ticks along the left edge.
  const step = niceGrid((p.h / k) * 4) / 2;
  const ticks: ReactElement[] = [];
  for (let v = Math.ceil((mid - p.h / 2 / k) / step) * step; v <= mid + p.h / 2 / k; v += step) {
    const yy = y(v);
    ticks.push(
      <g key={v}>
        <line className="depth-tick" x1={p.x} y1={yy} x2={p.x + p.w} y2={yy} />
        <text x={p.x + 1} y={yy - 0.4} fontSize={fontSize(1.4)} className="depth-label">
          {v.toFixed(step < 1 ? 1 : 0)} m
        </text>
      </g>,
    );
  }
  return (
    <g>
      {ticks}
      {paths}
    </g>
  );
}

function Events({ d, p, toX, span }: { d: Extract<Dataset, { kind: 'events' }>; p: Panel; toX: (kp: number) => number; span: [number, number] }) {
  const rows = p.rows ?? [];
  const ri = Math.max(0, rows.findIndex((r) => r.id === d.rowId));
  const rh = p.h / Math.max(1, rows.length);
  const y0 = p.y + ri * rh;
  const cap = Math.min(1.4, rh / 4);
  const out: ReactElement[] = [];
  for (const e of d.records) {
    if (e.kp < span[0] || e.kp > span[1]) continue;
    const x = toX(e.kp);
    out.push(
      <g key={`${e.kp}-${e.code}-${out.length}`}>
        <line x1={x} y1={y0 + rh * 0.55} x2={x} y2={y0 + rh * 0.95} stroke={d.color} strokeWidth={0.25} />
        <text fontSize={fontSize(cap)} fill={d.color} transform={`translate(${x + fontSize(cap) * 0.35} ${y0 + rh * 0.5}) rotate(-90)`}>
          {e.code}
        </text>
      </g>,
    );
    if (out.length > 1500) break;
  }
  return <g>{out}</g>;
}

function Cp({ d, p, toX, span }: { d: Extract<Dataset, { kind: 'cp' }>; p: Panel; toX: (kp: number) => number; span: [number, number] }) {
  const [a, b] = indexRange(d.kp, span);
  let min = Infinity;
  let max = -Infinity;
  for (let i = a; i <= b; i++) {
    min = Math.min(min, d.mv[i]);
    max = Math.max(max, d.mv[i]);
  }
  if (!Number.isFinite(min)) return null;
  const pad = Math.max(10, (max - min) * 0.15);
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => p.y + p.h - ((v - lo) / (hi - lo)) * p.h;
  if (d.style === 'ticks') {
    return (
      <g>
        {Array.from({ length: b - a + 1 }, (_, j) => a + j).map((i) => {
          const x = toX(d.kp[i]);
          return (
            <g key={i}>
              <line x1={x} y1={p.y + p.h} x2={x} y2={p.y + p.h * 0.55} stroke={d.color} strokeWidth={0.3} />
              <text fontSize={fontSize(1.4)} fill={d.color} transform={`translate(${x - 0.5} ${p.y + p.h * 0.52}) rotate(-90)`}>
                {Math.round(d.mv[i])} mV
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  let path = '';
  for (let i = a; i <= b; i++) path += `${i === a ? 'M' : 'L'}${toX(d.kp[i]).toFixed(2)} ${y(d.mv[i]).toFixed(2)}`;
  return (
    <g>
      <text x={p.x + 1} y={p.y + 3} fontSize={fontSize(1.4)} className="depth-label">
        {Math.round(hi)} mV
      </text>
      <text x={p.x + 1} y={p.y + p.h - 1} fontSize={fontSize(1.4)} className="depth-label">
        {Math.round(lo)} mV
      </text>
      <path d={path} fill="none" stroke={d.color} strokeWidth={0.3} />
    </g>
  );
}

/** Where each cross profile was taken; the profiles themselves are drawn in a later step. */
function TransMarks({ d, p, toX, span }: { d: Extract<Dataset, { kind: 'trans' }>; p: Panel; toX: (kp: number) => number; span: [number, number] }) {
  const [a, b] = indexRange(d.kp, span);
  const stride = Math.max(1, Math.floor((b - a) / 400));
  const out: ReactElement[] = [];
  for (let i = a; i <= b; i += stride) {
    const x = toX(d.kp[i]);
    out.push(<line key={i} x1={x} y1={p.y + p.h - 3} x2={x} y2={p.y + p.h} stroke={d.color} strokeWidth={0.2} />);
  }
  return <g>{out}</g>;
}
