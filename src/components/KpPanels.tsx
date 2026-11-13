import { useMemo, type ReactElement } from 'react';
import { nearestProfile } from '../model/crossProfile';
import { DEFAULT_LONG_OPTS, type CpSymbol, type DataFont, type Dataset, type LabelPos } from '../model/datasets';
import { codeMatcher, isKpRow, rowCodes, splitRanges, type EventMark, type EventRange, type LinkedEvent } from '../model/events';
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

/** SVG text attributes for a data font. */
export const fontProps = (f: DataFont) => ({
  fontFamily: `${f.family}, Arial, Helvetica, sans-serif`,
  fontWeight: f.bold ? 700 : undefined,
  fontStyle: f.italic ? 'italic' : undefined,
  fill: f.color,
});

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

interface AxisOpts {
  /** Grid line interval; labels, major and minor ticks default to it (0 = none for minor). */
  line: number;
  label?: number;
  major?: number;
  minor?: number;
  tickLen?: number;
  suffix?: string;
  side?: 'left' | 'right' | 'both';
}

const onStep = (v: number, step: number) => step > 0 && Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** Depth labels down the edges, with dotted guide lines and ticks, as on the reference charts. */
function DepthAxis({ p, y, lo, hi, o }: { p: Panel; y: (v: number) => number; lo: number; hi: number; o: AxisOpts }) {
  const out: ReactElement[] = [];
  const cap = 1.8;
  const label = o.label || o.line;
  const major = o.major || o.line;
  const minor = o.minor || 0;
  const len = o.tickLen ?? 1.5;
  const side = o.side ?? 'both';
  const unit = o.suffix ?? 'm';
  const left = side !== 'right';
  const right = side !== 'left';
  // Walk the finest interval asked for and draw what falls on each.
  const fine = Math.min(...[o.line, label, major, minor].filter((x) => x > 0));
  if (!(fine > 0) || (hi - lo) / fine > 2000) return null;
  for (let i = Math.ceil(lo / fine); i * fine <= hi + 1e-9; i++) {
    const v = Number((i * fine).toFixed(6));
    const yy = y(v);
    if (yy < p.y + 0.5 || yy > p.y + p.h - 0.5) continue;
    const isLine = onStep(v, o.line);
    const isMajor = onStep(v, major);
    const isMinor = !isMajor && onStep(v, minor);
    const isLabel = onStep(v, label) && yy > p.y + 2 && yy < p.y + p.h - 2;
    const t = isMajor ? len : isMinor ? len / 2 : 0;
    const text = `${Number(v.toFixed(2))}${unit}`;
    out.push(
      <g key={v}>
        {isLine && <line className="depth-tick" x1={p.x} y1={yy} x2={p.x + p.w} y2={yy} />}
        {t > 0 && left && <line className="depth-mark" x1={p.x} y1={yy} x2={p.x + t} y2={yy} />}
        {t > 0 && right && <line className="depth-mark" x1={p.x + p.w - t} y1={yy} x2={p.x + p.w} y2={yy} />}
        {isLabel && left && (
          <text x={p.x + len + 0.5} y={yy + fontSize(cap) * 0.35} fontSize={fontSize(cap)} className="depth-label">
            {text}
          </text>
        )}
        {isLabel && right && (
          <text x={p.x + p.w - len - 0.5} y={yy + fontSize(cap) * 0.35} fontSize={fontSize(cap)} className="depth-label" textAnchor="end">
            {text}
          </text>
        )}
      </g>,
    );
  }
  return <g>{out}</g>;
}

/** Positive values are depths unless the data is mostly negative (levels). */
export function depthSense(d: Extract<Dataset, { kind: 'long' }>): 1 | -1 {
  const o = d.opts?.zSense ?? 'auto';
  if (o === 'depth') return 1;
  if (o === 'level') return -1;
  const s = d.series[d.top ?? 0] ?? d.series[0];
  if (!s) return 1;
  let neg = 0;
  let pos = 0;
  for (let i = 0; i < s.values.length; i += Math.max(1, Math.floor(s.values.length / 500))) {
    const v = s.values[i];
    if (v < 0) neg++;
    else if (v > 0) pos++;
  }
  return neg > pos ? -1 : 1;
}

/**
 * The pipe as a band between top and bottom of pipe, with seabed lines, at the
 * longitudinal vertical scale, set up as in AutoChart's Create Profile: values as
 * depths or levels, optionally normalised on the top of pipe, placed upper / middle /
 * lower (or from a forced top value), with the depth grid and hatching chosen.
 */
function LongProfile({ d, p, t, toX, span }: { d: Extract<Dataset, { kind: 'long' }>; p: Panel; t: ChartTemplate; toX: (kp: number) => number; span: [number, number] }) {
  const o = { ...DEFAULT_LONG_OPTS, ...d.opts };
  const [a, b] = indexRange(d.kp, span);
  const sgn = depthSense(d);
  const top = d.top !== undefined ? d.series[d.top] : undefined;
  const bop = d.bop !== undefined ? d.series[d.bop] : undefined;
  const ref = (i: number) => (o.normalise && top ? top.values[i] : 0);
  const val = (vals: Float64Array, i: number) => vals[i] - ref(i);
  // u runs down the page: depth, or minus the level.
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const s of d.series)
    for (let i = a; i <= b; i++) {
      const v = val(s.values, i);
      if (Number.isFinite(v)) {
        uMin = Math.min(uMin, sgn * v);
        uMax = Math.max(uMax, sgn * v);
      }
    }
  if (!Number.isFinite(uMin)) return null;
  const k = 1000 / Math.max(1, t.scale.verticalLong);
  const inner = p.h - 4;
  const dataH = (uMax - uMin) * k;
  let yTop: number;
  if (o.forceTop !== null && Number.isFinite(o.forceTop)) yTop = p.y + (uMin - sgn * o.forceTop) * k;
  else if (o.placement === 'upper') yTop = p.y + inner * 0.1;
  else if (o.placement === 'lower') yTop = p.y + inner * 0.9 - dataH;
  else yTop = p.y + (inner - dataH) / 2;
  const yU = (u: number) => yTop + (u - uMin) * k;
  const y = (v: number) => yU(sgn * v);
  const stride = Math.max(1, Math.floor((b - a) / 4000));
  const line = (vals: Float64Array, from: number, to: number, dir = 1) => {
    let s = '';
    let pen = false;
    for (let i = dir > 0 ? from : to; dir > 0 ? i <= to : i >= from; i += dir * stride) {
      const v = val(vals, i);
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      s += `${pen ? 'L' : 'M'}${toX(d.kp[i]).toFixed(2)} ${y(v).toFixed(2)}`;
      pen = true;
    }
    return s;
  };
  let band = '';
  if (o.hatchPipe && top && bop) {
    // Top forwards then bottom backwards, closed: the pipe body.
    const fwd = line(top.values, a, b);
    const back = line(bop.values, a, b, -1).replace(/^M/, 'L');
    band = fwd + back + 'Z';
  }
  // Hatch under a seabed line: down to the panel's foot (or top, for levels drawn upside down).
  const under = o.hatchBelow ? d.series.find((s) => s.name === o.hatchBelow) : undefined;
  let below = '';
  if (under) {
    const l = line(under.values, a, b);
    const xs = [...l.matchAll(/[ML]([-\d.]+) /g)].map((m) => Number(m[1]));
    if (xs.length > 1) below = l.replace(/M/g, 'L').replace(/^L/, 'M') + `L${xs[xs.length - 1]} ${p.y + p.h}L${xs[0]} ${p.y + p.h}Z`;
  }
  // The axis runs from the panel top to its foot.
  const u0 = uMin - (yTop - p.y) / k;
  const u1 = u0 + p.h / k;
  const lo = Math.min(sgn * u0, sgn * u1);
  const hi = Math.max(sgn * u0, sgn * u1);
  const auto = niceGrid(p.h / k) / 2;
  return (
    <g>
      {o.hatchSea && <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={o.seaColor} stroke="none" />}
      {below && <path d={below} fill={o.belowColor} stroke="none" />}
      <DepthAxis
        p={p}
        y={y}
        lo={lo}
        hi={hi}
        o={{ line: o.gridLine || auto, label: o.gridLabel, major: o.majorTick, minor: o.minorTick, tickLen: o.tickLen, suffix: o.suffix, side: o.axisSide }}
      />
      {band && <path d={band} fill={d.fill} stroke="none" />}
      {d.series.map((s, j) => (
        <path key={j} d={line(s.values, a, b)} fill="none" stroke={s.color} strokeWidth={j === d.top || j === d.bop ? Math.max(0.3, o.lineWidth) : o.lineWidth} />
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
  // Two scales, as in AutoChart: the vertical scale sets heights (drawn across the
  // panel), the lateral scale sets the scan width (drawn up it). Equal values give 1:1.
  const kV = 1000 / Math.max(1, t.scale.verticalTrans);
  const kL = 1000 / Math.max(1, t.scale.lateralTrans || t.scale.verticalTrans);
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
  const maxLat = (p.h - labelRoom - 4) / 2 / kL;
  const cap = 1.8;
  return (
    <g>
      <DepthAxis p={p} y={(v) => cy - v * kL} lo={-maxLat} hi={maxLat} o={{ line: niceGrid(maxLat * 2) / 2 }} />
      {picks.map((pr) => {
        const x0 = toX(pr.kp);
        let dots = '';
        for (let i = 0; i < pr.pts.length; i += 2) {
          const lat = pr.pts[i];
          const h = pr.pts[i + 1];
          if (Math.abs(lat) > maxLat) continue;
          const dx = h * kV;
          if (Math.abs(dx) > room) continue;
          dots += `M${(x0 + dx).toFixed(2)} ${(cy - lat * kL).toFixed(2)}h0.01`;
        }
        return (
          <g key={pr.kp}>
            <path d={dots} stroke={d.color} strokeWidth={0.3} strokeLinecap="round" fill="none" />
            <ellipse cx={x0} cy={cy} rx={Math.max(0.4, (pr.diameter / 2) * kV)} ry={Math.max(0.4, (pr.diameter / 2) * kL)} fill={d.pipeFill} stroke={d.pipeColor} strokeWidth={0.15} />
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
  const split = useMemo(() => sets.map((d) => ({ d, ...splitRanges(d.records, d.links) })), [sets]);
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
    for (const { d, points, ranges, linked } of split) {
      const rs = ranges.filter((e) => match(e.code) && (Number.isFinite(e.end) ? e.end : routeEnd) >= span[0] && e.kp <= span[1]);
      rs.forEach((e, j) => out.push(<RangeBar key={`${r.id}-${d.id}-r${j}`} e={e} y0={y0} rh={rh} toX={toX} x0={x0} x1={x1} routeEnd={routeEnd} color={d.color} font={d.font} n={rs.length} j={j} />));
      const ls = linked.filter((e) => match(e.startCode) && e.end >= span[0] && e.kp <= span[1]);
      if (ls.length) out.push(<LinkedEvents key={`${r.id}-${d.id}-l`} list={ls} y0={y0} rh={rh} toX={toX} font={d.font} labels={d.labels} />);
      const ps = points.filter((e) => match(e.code) && e.kp >= span[0] && e.kp <= span[1]);
      out.push(<PointTicks key={`${r.id}-${d.id}-p`} list={ps} y0={y0} rh={rh} toX={toX} color={d.color} font={d.font} labels={d.labels} />);
    }
  });
  return <g>{out}</g>;
}

function RangeBar({ e, y0, rh, toX, x0, x1, routeEnd, color, font, n, j }: { e: EventRange; y0: number; rh: number; toX: (kp: number) => number; x0: number; x1: number; routeEnd: number; color: string; font: DataFont; n: number; j: number }) {
  // Several bars in one row share it top to bottom.
  const slot = rh / Math.max(1, n);
  const bh = Math.min(slot * 0.5, 3.2);
  const cy = y0 + slot * (j + 0.5);
  const xa = Math.max(x0, toX(e.kp));
  const xb = Math.min(x1, toX(Number.isFinite(e.end) ? e.end : routeEnd));
  if (xb <= xa) return null;
  const cap = Math.min(font.size, slot * 0.4);
  let text = e.value && e.value !== '0' ? e.value : e.code;
  const room = xb - xa - 2;
  while (text.length > 3 && measureText(text, cap) > room) text = text.slice(0, -2);
  if (text !== (e.value || e.code) && text.length > 3) text = text.slice(0, -1) + '…';
  return (
    <g>
      <rect x={xa} y={cy - bh / 2} width={xb - xa} height={bh} fill="#cfcfcf" />
      <line x1={xa} y1={cy} x2={xb} y2={cy} stroke={color} strokeWidth={0.12} />
      {room > 6 && (
        <text x={(xa + xb) / 2} y={cy - bh / 2 - 0.5} fontSize={fontSize(cap)} {...fontProps(font)} textAnchor="middle">
          {text}
        </text>
      )}
    </g>
  );
}

function PointTicks({ list, y0, rh, toX, color, font, labels }: { list: EventMark[]; y0: number; rh: number; toX: (kp: number) => number; color: string; font: DataFont; labels: boolean }) {
  if (!list.length) return null;
  const foot = y0 + rh;
  const len = Math.min(rh * 0.25, 2.5);
  const cap = Math.min(font.size, rh / 5);
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
        <text key={texts.length} fontSize={fs} {...fontProps(font)} transform={`translate(${(x + fs * 0.35).toFixed(2)} ${(foot - len - 0.4).toFixed(2)}) rotate(-90)`}>
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

/**
 * Linked events (freespan, burial): a line at each end, a bar between them, the
 * length above and the height below by default, and the codes along the end lines.
 */
function LinkedEvents({ list, y0, rh, toX, font, labels }: { list: LinkedEvent[]; y0: number; rh: number; toX: (kp: number) => number; font: DataFont; labels: boolean }) {
  const fs = fontSize(Math.min(font.size, rh / 6));
  const barTop = y0 + rh * 0.22;
  const barBot = y0 + rh * 0.42;
  const pos = (p: LabelPos) => (p === 'top' ? barTop - fs * 0.35 : y0 + rh * 0.62);
  return (
    <g>
      {list.map((e, i) => {
        const xa = toX(e.kp);
        const xb = toX(e.end);
        const mid = (xa + xb) / 2;
        const c = e.link.color;
        const t = { ...fontProps(font), fill: c };
        const lines = `M${xa.toFixed(2)} ${(y0 + rh * 0.1).toFixed(2)}V${(y0 + rh).toFixed(2)}M${xb.toFixed(2)} ${(y0 + rh * 0.1).toFixed(2)}V${(y0 + rh).toFixed(2)}`;
        return (
          <g key={i}>
            <rect x={xa} y={barTop} width={Math.max(0.1, xb - xa)} height={barBot - barTop} fill={c} />
            <path d={lines} stroke={font.color} strokeWidth={0.12} fill="none" />
            {e.link.lengthPos !== 'none' && (
              <text x={mid} y={pos(e.link.lengthPos)} fontSize={fs} textAnchor="middle" {...t}>
                {e.length.toFixed(2)}
              </text>
            )}
            {e.link.heightPos !== 'none' && e.height !== undefined && (
              <text x={mid} y={pos(e.link.heightPos)} fontSize={fs} textAnchor="middle" {...t}>
                {e.height.toFixed(2)}
              </text>
            )}
            {labels && xb - xa > fs * 2.2 && (
              <>
                <text fontSize={fs} {...fontProps(font)} transform={`translate(${(xa - fs * 0.35).toFixed(2)} ${(barBot + 0.6).toFixed(2)}) rotate(90)`}>
                  {e.startCode}
                </text>
                <text fontSize={fs} {...fontProps(font)} transform={`translate(${(xb - fs * 0.35).toFixed(2)} ${(barBot + 0.6).toFixed(2)}) rotate(90)`}>
                  {e.endCode}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** A CP marker symbol centred on (x, y). */
export function CpMark({ symbol, x, y, r, color }: { symbol: CpSymbol; x: number; y: number; r: number; color: string }) {
  const fill = symbol.endsWith('Fill') ? color : 'none';
  const st = { stroke: color, strokeWidth: 0.2, fill };
  if (symbol === 'tick') return null;
  if (symbol.startsWith('circle')) return <circle cx={x} cy={y} r={r} {...st} />;
  if (symbol.startsWith('square')) return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...st} />;
  if (symbol.startsWith('triangle')) return <path d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}L${x - r} ${y + r * 0.8}Z`} {...st} />;
  return <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} {...st} />;
}

/** CP readings: ticks with the reading, like engineering events, or a gradient line. */
function Cp({ d, p, toX, span }: { d: Extract<Dataset, { kind: 'cp' }>; p: Panel; toX: (kp: number) => number; span: [number, number] }) {
  const [a, b] = indexRange(d.kp, span);
  if (b < a) return null;
  if (d.style === 'ticks') {
    const foot = p.y + p.h;
    const len = Math.min(p.h * 0.25, 3);
    const fs = fontSize(Math.min(d.font.size, p.h / 8));
    const r = Math.max(0.4, fs * 0.35);
    const top = d.symbol === 'tick' ? 0 : 2 * r;
    const out: ReactElement[] = [];
    let path = '';
    let lastX = -Infinity;
    for (let i = a; i <= b; i++) {
      if (d.kp[i] < span[0] || d.kp[i] > span[1]) continue;
      const x = toX(d.kp[i]);
      path += `M${x.toFixed(2)} ${foot.toFixed(2)}v${(-len).toFixed(2)}`;
      out.push(<CpMark key={`m${i}`} symbol={d.symbol} x={x} y={foot - len - r} r={r} color={d.color} />);
      if (x - lastX > fs * 1.15) {
        out.push(
          <text key={i} fontSize={fs} {...fontProps(d.font)} transform={`translate(${(x + fs * 0.35).toFixed(2)} ${(foot - len - top - 0.4).toFixed(2)}) rotate(-90)`}>
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
