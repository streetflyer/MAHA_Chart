import { useMemo, type ReactElement } from 'react';
import { nearestProfile } from '../model/crossProfile';
import type { Dataset } from '../model/datasets';
import { codeMatcher, isKpRow, rowCodes, splitRanges, type EventMark, type EventRange } from '../model/events';
import { kpInterval, planStyle } from '../model/planStyle';
import { chartGeometry, gridToPlan, pointAt, type Route } from '../model/route';
import { planPanel, sheetRange } from '../model/scale';
import type { ChartTemplate, Panel } from '../model/types';
import { useSurvey } from '../state/surveyData';
import { niceGrid } from './Keyplan';
import { fontSize, measureText } from './svgText';

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
  const ticks = kpTicks(t, toX, x0, p.x + p.w, k0, len);
  const lines = route || mine.length > 0;
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={x0} y={p.y} width={p.x + p.w - x0} height={p.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {lines && p.type !== 'events' && ticks.map(([kp, x]) => <line key={kp} className="kp-line" x1={x} y1={p.y} x2={x} y2={p.y + p.h} />)}
        {span &&
          mine.map((d) => {
            if (d.kind === 'long') return <LongProfile key={d.id} d={d} p={p} t={t} toX={toX} span={span} />;
            if (d.kind === 'cp') return <Cp key={d.id} d={d} p={p} toX={toX} span={span} />;
            if (d.kind === 'trans') return <TransProfiles key={d.id} d={d} p={p} t={t} toX={toX} span={span} />;
            return null;
          })}
        {p.type === 'events' && span && <EventsPanel p={p} x0={x0} toX={toX} span={span} sets={mine.filter((d): d is EventsSet => d.kind === 'events')} ticks={ticks} routeEnd={k0 + len} />}
        {lines && (p.type === 'longProfile' || p.type === 'transProfile') && <KpLabels ticks={ticks} y={p.y + p.h - 1.2} />}
      </g>
    </g>
  );
}

type EventsSet = Extract<Dataset, { kind: 'events' }>;

/** KP values (m) at the plan view's KP interval, with their paper x, inside [x0, x1]. */
function kpTicks(t: ChartTemplate, toX: (kp: number) => number, x0: number, x1: number, k0: number, len: number): [number, number][] {
  const plan = planPanel(t);
  if (!plan) return [];
  const interval = kpInterval(planStyle(plan), t.scale.horizontal);
  const out: [number, number][] = [];
  for (let kp = Math.ceil((k0 - len * 0.05) / interval) * interval; kp <= k0 + len * 1.05 && out.length < 400; kp += interval) {
    const x = toX(kp);
    if (x >= x0 - 0.01 && x <= x1 + 0.01) out.push([kp, x]);
  }
  return out;
}

const kpText = (kp: number) => (kp / 1000).toFixed(3);

function KpLabels({ ticks, y }: { ticks: [number, number][]; y: number }) {
  const cap = 1.8;
  return (
    <g className="kp-label">
      {ticks.map(([kp, x]) => (
        <text key={kp} x={x} y={y} fontSize={fontSize(cap)} textAnchor="middle">
          {kpText(kp)}
        </text>
      ))}
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

/** Depth labels down both edges, with dotted guide lines, as on the reference charts. */
function DepthAxis({ p, y, lo, hi, step, unit = 'm' }: { p: Panel; y: (v: number) => number; lo: number; hi: number; step: number; unit?: string }) {
  const out: ReactElement[] = [];
  const cap = 1.8;
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const yy = y(v);
    if (yy < p.y + 2 || yy > p.y + p.h - 4) continue;
    const label = `${Number(v.toFixed(2))}${unit}`;
    out.push(
      <g key={v}>
        <line className="depth-tick" x1={p.x} y1={yy} x2={p.x + p.w} y2={yy} />
        <line className="depth-mark" x1={p.x} y1={yy} x2={p.x + 1.5} y2={yy} />
        <line className="depth-mark" x1={p.x + p.w - 1.5} y1={yy} x2={p.x + p.w} y2={yy} />
        <text x={p.x + 2} y={yy + fontSize(cap) * 0.35} fontSize={fontSize(cap)} className="depth-label">
          {label}
        </text>
        <text x={p.x + p.w - 2} y={yy + fontSize(cap) * 0.35} fontSize={fontSize(cap)} className="depth-label" textAnchor="end">
          {label}
        </text>
      </g>,
    );
  }
  return <g>{out}</g>;
}

/** The pipe as a band between top and bottom of pipe, with seabed lines, at the longitudinal vertical scale. */
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
  const mid = (min + max) / 2;
  const cy = p.y + (p.h - 4) / 2;
  const y = (v: number) => cy + (v - mid) * k;
  const stride = Math.max(1, Math.floor((b - a) / 4000));
  const line = (vals: Float64Array, from: number, to: number, dir = 1) => {
    let s = '';
    let pen = false;
    for (let i = dir > 0 ? from : to; dir > 0 ? i <= to : i >= from; i += dir * stride) {
      const v = vals[i];
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      s += `${pen ? 'L' : 'M'}${toX(d.kp[i]).toFixed(2)} ${y(v).toFixed(2)}`;
      pen = true;
    }
    return s;
  };
  const top = d.top !== undefined ? d.series[d.top] : undefined;
  const bop = d.bop !== undefined ? d.series[d.bop] : undefined;
  let band = '';
  if (top && bop) {
    // Top forwards then bottom backwards, closed: the pipe body.
    const fwd = line(top.values, a, b);
    const back = line(bop.values, a, b, -1).replace(/^M/, 'L');
    band = fwd + back + 'Z';
  }
  const half = p.h / 2 / k;
  const step = niceGrid(half * 2) / 2;
  return (
    <g>
      <DepthAxis p={p} y={y} lo={mid - half} hi={mid + half} step={step} />
      {band && <path d={band} fill="#6b6b6b" stroke="none" />}
      {d.series.map((s, j) => (
        <path key={j} d={line(s.values, a, b)} fill="none" stroke={s.color} strokeWidth={j === d.top || j === d.bop ? 0.3 : 0.2} />
      ))}
    </g>
  );
}

/**
 * Cross profiles turned on their side, as on the reference charts: lateral offset
 * runs up the panel (5 m to -5 m) and height runs across, so each profile sits on
 * its KP with the pipe drawn as a circle on the centre line.
 */
function TransProfiles({ d, p, t, toX, span }: { d: Extract<Dataset, { kind: 'trans' }>; p: Panel; t: ChartTemplate; toX: (kp: number) => number; span: [number, number] }) {
  const every = d.every > 0 ? d.every : Math.max(1, t.scale.horizontal / 50);
  const k = 1000 / Math.max(1, t.scale.verticalTrans);
  const labelRoom = 9;
  const cy = p.y + labelRoom + (p.h - labelRoom - 4) / 2;
  const picks: typeof d.profiles = [];
  for (let kp = Math.ceil(span[0] / every) * every; kp <= span[1]; kp += every) {
    const pr = nearestProfile(d.profiles, kp, Math.max(1, every / 10));
    if (pr) picks.push(pr);
  }
  // The first and last profiles of the survey are worth showing even off the interval.
  for (const pr of [d.profiles[0], d.profiles[d.profiles.length - 1]]) {
    if (pr && pr.kp >= span[0] && pr.kp <= span[1] && picks.every((x) => Math.abs(x.kp - pr.kp) > every / 4)) picks.push(pr);
  }
  const room = Math.max(1, Math.abs(toX(span[0] + every) - toX(span[0])) * 0.45);
  const maxLat = (p.h - labelRoom - 4) / 2 / k;
  const cap = 1.8;
  return (
    <g>
      <DepthAxis p={p} y={(v) => cy - v * k} lo={-maxLat} hi={maxLat} step={niceGrid(maxLat * 2) / 2} />
      {picks.map((pr) => {
        const x0 = toX(pr.kp);
        let dots = '';
        for (let i = 0; i < pr.pts.length; i += 2) {
          const lat = pr.pts[i];
          const h = pr.pts[i + 1];
          if (Math.abs(lat) > maxLat) continue;
          const dx = h * k;
          if (Math.abs(dx) > room) continue;
          dots += `M${(x0 + dx).toFixed(2)} ${(cy - lat * k).toFixed(2)}h0.01`;
        }
        return (
          <g key={pr.kp}>
            <path d={dots} stroke={d.color} strokeWidth={0.3} strokeLinecap="round" fill="none" />
            <circle cx={x0} cy={cy} r={Math.max(0.4, (pr.diameter / 2) * k)} fill="#bdbdbd" stroke={d.pipeColor} strokeWidth={0.15} />
            <line x1={x0} y1={p.y} x2={x0} y2={p.y + 1.5} stroke="currentColor" strokeWidth={0.15} />
            <text fontSize={fontSize(cap)} transform={`translate(${x0 - fontSize(cap) * 0.35} ${p.y + 2}) rotate(90)`}>
              {kpText(pr.kp)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Engineering events in the panel's rows by code: start/end pairs (pipe spec,
 * coating, video...) as grey bars carrying their description, single events as
 * ticks up from the row's foot, and the KP row with the KP labels.
 */
function EventsPanel({ p, x0, toX, span, sets, ticks, routeEnd }: { p: Panel; x0: number; toX: (kp: number) => number; span: [number, number]; sets: EventsSet[]; ticks: [number, number][]; routeEnd: number }) {
  const rows = p.rows ?? [];
  const split = useMemo(() => sets.map((d) => ({ d, ...splitRanges(d.records) })), [sets]);
  if (!rows.length) return null;
  const rh = p.h / rows.length;
  const x1 = p.x + p.w;
  const out: ReactElement[] = [];
  rows.forEach((r, ri) => {
    const y0 = p.y + ri * rh;
    if (isKpRow(r)) {
      const cap = Math.min(1.8, rh / 3);
      for (const [kp, x] of ticks) {
        out.push(
          <g key={`kp${kp}`}>
            <line x1={x} y1={y0 + rh - 1.2} x2={x} y2={y0 + rh} stroke="currentColor" strokeWidth={0.15} />
            <text x={x} y={y0 + rh / 2 + fontSize(cap) * 0.35} fontSize={fontSize(cap)} textAnchor="middle">
              {kpText(kp)}
            </text>
          </g>,
        );
      }
      return;
    }
    const match = codeMatcher(rowCodes(r));
    for (const { d, points, ranges } of split) {
      const rs = ranges.filter((e) => match(e.code) && (Number.isFinite(e.end) ? e.end : routeEnd) >= span[0] && e.kp <= span[1]);
      rs.forEach((e, j) => out.push(<RangeBar key={`${r.id}-${d.id}-r${j}`} e={e} y0={y0} rh={rh} toX={toX} x0={x0} x1={x1} routeEnd={routeEnd} color={d.color} n={rs.length} j={j} />));
      const ps = points.filter((e) => match(e.code) && e.kp >= span[0] && e.kp <= span[1]);
      out.push(<PointTicks key={`${r.id}-${d.id}-p`} list={ps} y0={y0} rh={rh} toX={toX} color={d.color} labels={d.labels} />);
    }
  });
  return <g>{out}</g>;
}

function RangeBar({ e, y0, rh, toX, x0, x1, routeEnd, color, n, j }: { e: EventRange; y0: number; rh: number; toX: (kp: number) => number; x0: number; x1: number; routeEnd: number; color: string; n: number; j: number }) {
  // Several bars in one row share it top to bottom.
  const slot = rh / Math.max(1, n);
  const bh = Math.min(slot * 0.5, 3.2);
  const cy = y0 + slot * (j + 0.5);
  const xa = Math.max(x0, toX(e.kp));
  const xb = Math.min(x1, toX(Number.isFinite(e.end) ? e.end : routeEnd));
  if (xb <= xa) return null;
  const cap = Math.min(1.6, bh * 0.6);
  let text = e.value && e.value !== '0' ? e.value : e.code;
  const room = xb - xa - 2;
  while (text.length > 3 && measureText(text, cap) > room) text = text.slice(0, -2);
  if (text !== (e.value || e.code) && text.length > 3) text = text.slice(0, -1) + '…';
  return (
    <g>
      <rect x={xa} y={cy - bh / 2} width={xb - xa} height={bh} fill="#cfcfcf" />
      <line x1={xa} y1={cy} x2={xb} y2={cy} stroke={color} strokeWidth={0.12} />
      {room > 6 && (
        <text x={(xa + xb) / 2} y={cy - bh / 2 - 0.5} fontSize={fontSize(cap)} fill={color} textAnchor="middle">
          {text}
        </text>
      )}
    </g>
  );
}

function PointTicks({ list, y0, rh, toX, color, labels }: { list: EventMark[]; y0: number; rh: number; toX: (kp: number) => number; color: string; labels: boolean }) {
  if (!list.length) return null;
  const foot = y0 + rh;
  const len = Math.min(rh * 0.25, 2.5);
  const cap = Math.min(1.3, rh / 5);
  const fs = fontSize(cap);
  let path = '';
  const texts: ReactElement[] = [];
  let lastX = -Infinity;
  for (const e of list) {
    const x = toX(e.kp);
    path += `M${x.toFixed(2)} ${foot.toFixed(2)}v${(-len).toFixed(2)}`;
    // Label sparse events with their code; dense ones (field joints) stay as ticks.
    if (labels && x - lastX > fs * 1.15 && list.length <= 80) {
      texts.push(
        <text key={texts.length} fontSize={fs} fill={color} transform={`translate(${(x + fs * 0.35).toFixed(2)} ${(foot - len - 0.4).toFixed(2)}) rotate(-90)`}>
          {e.code}
        </text>,
      );
      lastX = x;
    }
  }
  return (
    <g>
      <path d={path} stroke={color} strokeWidth={0.15} fill="none" />
      {texts}
    </g>
  );
}

/** CP readings: ticks with the reading, like engineering events, or a gradient line. */
function Cp({ d, p, toX, span }: { d: Extract<Dataset, { kind: 'cp' }>; p: Panel; toX: (kp: number) => number; span: [number, number] }) {
  const [a, b] = indexRange(d.kp, span);
  if (b < a) return null;
  if (d.style === 'ticks') {
    const foot = p.y + p.h;
    const len = Math.min(p.h * 0.25, 3);
    const fs = fontSize(Math.min(1.4, p.h / 8));
    const out: ReactElement[] = [];
    let path = '';
    let lastX = -Infinity;
    for (let i = a; i <= b; i++) {
      if (d.kp[i] < span[0] || d.kp[i] > span[1]) continue;
      const x = toX(d.kp[i]);
      path += `M${x.toFixed(2)} ${foot.toFixed(2)}v${(-len).toFixed(2)}`;
      if (x - lastX > fs * 1.15) {
        out.push(
          <text key={i} fontSize={fs} fill={d.color} transform={`translate(${(x + fs * 0.35).toFixed(2)} ${(foot - len - 0.4).toFixed(2)}) rotate(-90)`}>
            {Math.round(d.mv[i])} mV
          </text>,
        );
        lastX = x;
      }
    }
    return (
      <g>
        <path d={path} stroke={d.color} strokeWidth={0.15} fill="none" />
        {out}
      </g>
    );
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = a; i <= b; i++) {
    min = Math.min(min, d.mv[i]);
    max = Math.max(max, d.mv[i]);
  }
  const pad = Math.max(10, (max - min) * 0.15);
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => p.y + p.h - ((v - lo) / (hi - lo)) * p.h;
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
