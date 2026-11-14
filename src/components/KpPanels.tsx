import { Cp } from "./CpPanel";
import { useEditor } from "../state/store";
import { useProject } from "../state/project";
import { useVideo } from "../state/video";
import { productIn, productKeys, videoRange, videoText } from "../model/video";
import { useMemo, type ReactElement } from "react";
import { nearestProfile } from "../model/crossProfile";
import {
  DEFAULT_EVENT_LAYOUT,
  DEFAULT_FONT,
  DEFAULT_LONG_OPTS,
  type CpSymbol,
  type LongSeries,
  type DataFont,
  type Dataset,
  type EventLayout,
  type LabelPos,
} from "../model/datasets";
import {
  codeMatcher,
  isKpRow,
  isVideoRow,
  rowCodes,
  splitRanges,
  type EventMark,
  type EventRange,
  type LinkedEvent,
} from "../model/events";
import { kpInterval, planStyle } from "../model/planStyle";
import { chartGeometry, gridToPlan, pointAt, type Route } from "../model/route";
import { planPanel, sheetRange } from "../model/scale";
import type { ChartTemplate, Panel } from "../model/types";
import { useSurvey } from "../state/surveyData";
import { niceGrid } from "./Keyplan";
import { fontSize, measureText } from "./svgText";

/**
 * Paper x of a KP (metres) for one chart. With a route loaded it is where that KP
 * falls in the plan view, so every KP-aligned panel lines up under the plan view;
 * without one it runs evenly across the chart's KP range.
 */
export function kpToX(
  t: ChartTemplate,
  route: Route | null,
  sheetIndex: number,
): ((kp: number) => number) | null {
  const plan = planPanel(t);
  if (!plan) return null;
  const k0 = (parseFloat(t.fields.START_KP ?? "0") || 0) * 1000;
  if (route) {
    const g = chartGeometry(t, route, sheetIndex);
    if (!g) return null;
    const project = gridToPlan(g, plan);
    const { start, end } = sheetRange(t, sheetIndex);
    return monotonicKp(
      start * 1000,
      end * 1000,
      k0,
      k0 + route.length,
      (plan.w * t.scale.horizontal) / 1000,
      (kp) => project(...pointAt(route, kp - k0))[0],
    );
  }
  const { start, end } = sheetRange(t, sheetIndex);
  return (kp) => plan.x + ((kp / 1000 - start) / (end - start)) * plan.w;
}

/**
 * KP to paper x for one chart, kept to that chart's own stretch of line so KP only
 * ever increases across the panels. Where the line curls back through the plan view
 * (the last chart of a short line, a tight bend) other stretches of the line also
 * fall inside the frame; they are left out, and any doubling back inside the chart's
 * own range is held at the furthest x reached. KPs outside the stretch map far off the panel.
 */
export function monotonicKp(
  start: number,
  end: number,
  lineStart: number,
  lineEnd: number,
  along: number,
  raw: (kp: number) => number,
): (kp: number) => number {
  const a = Math.max(lineStart, start - along);
  const b = Math.min(lineEnd, end + along);
  const s0 = Math.min(Math.max(start, lineStart), lineEnd);
  if (!(b > a)) return () => NaN;
  const step = Math.max(0.25, (b - a) / 6000);
  const n = Math.ceil((b - a) / step);
  const kps = new Float64Array(n + 1);
  const xs = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    kps[i] = Math.min(b, a + i * step);
    xs[i] = raw(kps[i]);
  }
  const i0 = Math.min(n, Math.max(0, Math.round((s0 - a) / step)));
  const tol = 0.05; // mm: jitter of the line, not a turn back
  // Forward from the chart's start: x never goes back; past the chart's end, stop where the line turns back.
  let hi = n;
  let run = xs[i0];
  for (let i = i0 + 1; i <= n; i++) {
    if (xs[i] < run - tol && kps[i] > end) {
      hi = i - 1;
      break;
    }
    run = Math.max(run, xs[i]);
    xs[i] = run;
  }
  // Backward from the start: x never goes forward; stop where the line turns back.
  let lo = 0;
  run = xs[i0];
  for (let i = i0 - 1; i >= 0; i--) {
    if (xs[i] > run + tol) {
      lo = i + 1;
      break;
    }
    run = Math.min(run, xs[i]);
    xs[i] = run;
  }
  const kLo = kps[lo];
  const kHi = kps[hi];
  return (kp) => {
    if (kp < kLo - 1e-6) return -1e6;
    if (kp > kHi + 1e-6) return 1e6;
    const f = (kp - a) / step;
    const i = Math.max(lo, Math.min(hi - 1, Math.floor(f)));
    if (hi <= lo) return xs[lo];
    const tt = Math.max(0, Math.min(1, f - i));
    return xs[i] + (xs[i + 1] - xs[i]) * tt;
  };
}

export function useKpToX(t: ChartTemplate, sheetIndex: number) {
  const route = useSurvey((s) => s.route);
  return useMemo(() => kpToX(t, route, sheetIndex), [t, route, sheetIndex]);
}

/** Visible KP span of a panel, found by stepping the mapping (it may be non-linear on a turned chart). */
function kpSpan(
  toX: (kp: number) => number,
  x0: number,
  x1: number,
  routeLen: number,
  k0: number,
): [number, number] | null {
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
  // The scan is in steps, so the true edge can lie up to a step beyond: pad so a reading right on the edge is kept (the panel clips it).
  return lo <= hi ? [lo - 2 * step, hi + 2 * step] : null;
}

/** Data drawn in the longitudinal, transverse, events and CP panels for the current chart. */
export function KpPanelData({
  p,
  t,
  sheetIndex,
}: {
  p: Panel;
  t: ChartTemplate;
  sheetIndex: number;
}) {
  const toX = useKpToX(t, sheetIndex);
  const datasets = useSurvey((s) => s.datasets);
  const route = useSurvey((s) => s.route);
  if (!toX) return null;
  const x0 = p.type === "events" ? p.x + (p.labelWidth ?? 30) : p.x;
  const clipId = `kp-clip-${p.id}`;
  const k0 = (parseFloat(t.fields.START_KP ?? "0") || 0) * 1000;
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
        {lines &&
          p.type !== "events" &&
          p.kpLines !== false &&
          ticks.map(([kp, x]) => (
            <line
              key={kp}
              className="kp-line"
              x1={x}
              y1={p.y}
              x2={x}
              y2={p.y + p.h}
            />
          ))}
        {span &&
          mine.map((d) => {
            if (d.kind === "long")
              return (
                <LongProfile
                  key={d.id}
                  d={d}
                  p={p}
                  t={t}
                  toX={toX}
                  span={span}
                />
              );
            if (d.kind === "cp")
              return <Cp key={d.id} d={d} p={p} toX={toX} span={span} />;
            if (d.kind === "trans")
              return (
                <TransProfiles
                  key={d.id}
                  d={d}
                  p={p}
                  t={t}
                  toX={toX}
                  span={span}
                />
              );
            return null;
          })}
        {p.type === "events" && span && (
          <EventsPanel
            p={p}
            x0={x0}
            toX={toX}
            span={span}
            sets={mine.filter((d): d is EventsSet => d.kind === "events")}
            ticks={ticks}
            routeEnd={k0 + len}
          />
        )}
        {lines &&
          (p.type === "longProfile" ||
            p.type === "transProfile" ||
            p.type === "cp") &&
          p.kpLabels !== false && (
            <KpLabels ticks={ticks} y={p.y + p.h - 1.2} />
          )}
      </g>
    </g>
  );
}

type EventsSet = Extract<Dataset, { kind: "events" }>;

/** KP values (m) at the plan view's KP interval, with their paper x, inside [x0, x1]. */
function kpTicks(
  t: ChartTemplate,
  toX: (kp: number) => number,
  x0: number,
  x1: number,
  k0: number,
  len: number,
): [number, number][] {
  const plan = planPanel(t);
  if (!plan) return [];
  const interval = kpInterval(planStyle(plan), t.scale.horizontal);
  const out: [number, number][] = [];
  for (
    let kp = Math.ceil((k0 - len * 0.05) / interval) * interval;
    kp <= k0 + len * 1.05 && out.length < 400;
    kp += interval
  ) {
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
  fontStyle: f.italic ? "italic" : undefined,
  // The sheet's stylesheet paints text in the ink colour (so a dark sheet works), which beats a fill attribute:
  // a colour the user chose has to go in the style. Black stays "ink".
  style: /^#(000|111|000000|111111)$/i.test(f.color)
    ? undefined
    : { fill: f.color },
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

const targetPanel = (d: Dataset) =>
  ({ long: "longProfile", trans: "transProfile", events: "events", cp: "cp" })[
    d.target as string
  ];

function indexRange(
  kp: Float64Array,
  [lo, hi]: [number, number],
): [number, number] {
  let a = 0;
  while (a < kp.length && kp[a] < lo) a++;
  let b = kp.length - 1;
  while (b > 0 && kp[b] > hi) b--;
  return [Math.max(0, a - 1), Math.min(kp.length - 1, b + 1)];
}

interface AxisOpts {
  /** Leave out the label at either end of the axis. */
  omitEnds?: boolean;
  /** Grid line interval; labels, major and minor ticks default to it (0 = none for minor). */
  line: number;
  label?: number;
  major?: number;
  minor?: number;
  tickLen?: number;
  suffix?: string;
  side?: "left" | "right" | "both";
  grid?: { show: boolean; color: string; width: number; dash: string };
}

const onStep = (v: number, step: number) =>
  step > 0 && Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** Depth labels down the edges, with dotted guide lines and ticks, as on the reference charts. */
function DepthAxis({
  p,
  y,
  lo,
  hi,
  o,
}: {
  p: Panel;
  y: (v: number) => number;
  lo: number;
  hi: number;
  o: AxisOpts;
}) {
  const out: ReactElement[] = [];
  const cap = 1.8;
  const label = o.label || o.line;
  const major = o.major || o.line;
  const minor = o.minor || 0;
  const len = o.tickLen ?? 1.5;
  const side = o.side ?? "both";
  const unit = o.suffix ?? "m";
  const left = side !== "right";
  const right = side !== "left";
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
    const endGap = o.omitEnds ? 4.5 : 2;
    const isLabel =
      onStep(v, label) && yy > p.y + endGap && yy < p.y + p.h - endGap;
    const t = isMajor ? len : isMinor ? len / 2 : 0;
    const text = `${Number(v.toFixed(2))}${unit}`;
    out.push(
      <g key={v}>
        {isLine && (o.grid?.show ?? true) && (
          <line
            className="depth-tick"
            style={
              o.grid
                ? {
                    stroke: o.grid.color,
                    strokeWidth: o.grid.width,
                    strokeDasharray: o.grid.dash || "none",
                  }
                : undefined
            }
            x1={p.x}
            y1={yy}
            x2={p.x + p.w}
            y2={yy}
          />
        )}
        {t > 0 && left && (
          <line className="depth-mark" x1={p.x} y1={yy} x2={p.x + t} y2={yy} />
        )}
        {t > 0 && right && (
          <line
            className="depth-mark"
            x1={p.x + p.w - t}
            y1={yy}
            x2={p.x + p.w}
            y2={yy}
          />
        )}
        {isLabel && left && (
          <text
            x={p.x + len + 0.5}
            y={yy + fontSize(cap) * 0.35}
            fontSize={fontSize(cap)}
            className="depth-label"
          >
            {text}
          </text>
        )}
        {isLabel && right && (
          <text
            x={p.x + p.w - len - 0.5}
            y={yy + fontSize(cap) * 0.35}
            fontSize={fontSize(cap)}
            className="depth-label"
            textAnchor="end"
          >
            {text}
          </text>
        )}
      </g>,
    );
  }
  return <g>{out}</g>;
}

/** Positive values are depths unless the data is mostly negative (levels). */
export function depthSense(d: Extract<Dataset, { kind: "long" }>): 1 | -1 {
  const o = d.opts?.zSense ?? "auto";
  if (o === "depth") return 1;
  if (o === "level") return -1;
  const s = d.series[d.top ?? 0] ?? d.series[0];
  if (!s) return 1;
  let neg = 0;
  let pos = 0;
  for (
    let i = 0;
    i < s.values.length;
    i += Math.max(1, Math.floor(s.values.length / 500))
  ) {
    const v = s.values[i];
    if (v < 0) neg++;
    else if (v > 0) pos++;
  }
  return neg > pos ? -1 : 1;
}

/** The series with BOP replaced by TOP plus the median TOP-to-BOP gap (smooth, as a pipe is). */
function smoothBop(d: Extract<Dataset, { kind: "long" }>): LongSeries[] {
  if (d.top === undefined || d.bop === undefined) return d.series;
  const top = d.series[d.top].values;
  const bop = d.series[d.bop];
  const gaps: number[] = [];
  for (let i = 0; i < top.length; i++) {
    const g = bop.values[i] - top[i];
    if (Number.isFinite(g)) gaps.push(g);
  }
  if (!gaps.length) return d.series;
  gaps.sort((x, y) => x - y);
  const gap = gaps[gaps.length >> 1];
  const values = Float64Array.from(top, (v) => v + gap);
  return d.series.map((s, i) => (i === d.bop ? { ...s, values } : s));
}

/**
 * Longitudinal profile after AutoChart's Create Profile: values pointing down or up,
 * placed upper / middle / lower (or from a forced top), the depth grid and hatching.
 * With "cut" the panel is divided wherever the profile would leave it: each part has
 * its own depth window, moved by a whole number of depth steps, so a large vertical
 * exaggeration still shows the pipe big and readable.
 */
function LongProfile({
  d,
  p,
  t,
  toX,
  span,
}: {
  d: Extract<Dataset, { kind: "long" }>;
  p: Panel;
  t: ChartTemplate;
  toX: (kp: number) => number;
  span: [number, number];
}) {
  const o = { ...DEFAULT_LONG_OPTS, ...d.opts };
  const [a, b] = indexRange(d.kp, span);
  const sgn = depthSense(d);
  // BOP is TOP less the pipe diameter, so it is drawn as the TOP line moved by the
  // median gap: the survey's rounded BOP values would otherwise show as steps.
  const series = useMemo(() => smoothBop(d), [d.series, d.top, d.bop]);
  const top = d.top !== undefined ? series[d.top] : undefined;
  const bop = d.bop !== undefined ? series[d.bop] : undefined;
  const ref = (i: number) => (o.normalise && top ? top.values[i] : 0);
  const val = (vals: Float64Array, i: number) => vals[i] - ref(i);
  // u runs down the page: depth, or minus the level.
  const uRange = (
    from: number,
    to: number,
    which: LongSeries[] = series,
  ): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of which)
      for (let i = from; i <= to; i++) {
        const v = val(s.values, i);
        if (Number.isFinite(v)) {
          lo = Math.min(lo, sgn * v);
          hi = Math.max(hi, sgn * v);
        }
      }
    return [lo, hi];
  };
  const [uMin, uMax] = uRange(a, b);
  if (!Number.isFinite(uMin)) return null;
  const k = 1000 / Math.max(1, t.scale.verticalLong);
  const inner = p.h - 4;
  const stride = Math.max(1, Math.floor((b - a) / 4000));

  /** One depth window: the lines, hatches and axis for points from..to, with u0 at the panel top. */
  const section = (
    from: number,
    to: number,
    u0: number,
    xa: number,
    xb: number,
    clipId?: string,
  ) => {
    const yU = (u: number) => p.y + (u - u0) * k;
    const y = (v: number) => yU(sgn * v);
    const line = (vals: Float64Array, dir = 1) => {
      let s = "";
      let pen = false;
      for (
        let i = dir > 0 ? from : to;
        dir > 0 ? i <= to : i >= from;
        i += dir * stride
      ) {
        const v = val(vals, i);
        if (!Number.isFinite(v)) {
          pen = false;
          continue;
        }
        s += `${pen ? "L" : "M"}${toX(d.kp[i]).toFixed(2)} ${y(v).toFixed(2)}`;
        pen = true;
      }
      return s;
    };
    let band = "";
    if (o.hatchPipe && top && bop)
      band = line(top.values) + line(bop.values, -1).replace(/^M/, "L") + "Z";
    const under = o.hatchBelow
      ? series.find((s) => s.name === o.hatchBelow)
      : undefined;
    let below = "";
    if (under) {
      const l = line(under.values);
      const xs = [...l.matchAll(/[ML]([-\d.]+) /g)].map((m) => Number(m[1]));
      if (xs.length > 1)
        below =
          l.replace(/M/g, "L").replace(/^L/, "M") +
          `L${xs[xs.length - 1]} ${p.y + p.h}L${xs[0]} ${p.y + p.h}Z`;
    }
    const u1 = u0 + p.h / k;
    const lo = Math.min(sgn * u0, sgn * u1);
    const hi = Math.max(sgn * u0, sgn * u1);
    const auto = niceGrid(p.h / k) / 2;
    const part = { ...p, x: xa, w: xb - xa };
    return (
      <g
        key={clipId ?? "all"}
        clipPath={clipId ? `url(#${clipId})` : undefined}
      >
        {clipId && (
          <defs>
            <clipPath id={clipId}>
              <rect x={xa} y={p.y} width={xb - xa} height={p.h} />
            </clipPath>
          </defs>
        )}
        {o.hatchSea && (
          <rect
            x={xa}
            y={p.y}
            width={xb - xa}
            height={p.h}
            fill={o.seaColor}
            stroke="none"
          />
        )}
        {below && <path d={below} fill={o.belowColor} stroke="none" />}
        <DepthAxis
          p={part}
          y={y}
          lo={lo}
          hi={hi}
          o={{
            line: o.gridLine || auto,
            label: o.gridLabel,
            major: o.majorTick,
            minor: o.minorTick,
            tickLen: o.tickLen,
            suffix: o.suffix,
            side: o.axisSide,
            omitEnds: o.omitEndLabels,
            grid: {
              show: o.gridShow,
              color: o.gridColor,
              width: o.gridWidth,
              dash: o.gridDash,
            },
          }}
        />
        {band && <path d={band} fill={d.fill} stroke="none" />}
        {series.map((s, j) => (
          <path
            key={j}
            d={line(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={
              s.width ??
              (j === d.top || j === d.bop ? o.pipeWidth : o.lineWidth)
            }
          />
        ))}
      </g>
    );
  };

  if (!o.cut) {
    const dataH = (uMax - uMin) * k;
    let yTop: number;
    if (o.forceTop !== null && Number.isFinite(o.forceTop))
      yTop = p.y + (uMin - sgn * o.forceTop) * k;
    else if (o.placement === "upper") yTop = p.y + inner * 0.1;
    else if (o.placement === "lower") yTop = p.y + inner * 0.9 - dataH;
    else yTop = p.y + (inner - dataH) / 2;
    return <g>{section(a, b, uMin - (yTop - p.y) / k, p.x, p.x + p.w)}</g>;
  }

  // Cut and divide: windows as tall as the panel, moved by whole depth steps.
  const W = p.h / k;
  const step = Math.max(0.01, o.cutStep);
  // The pipe decides where to cut; noisy seabed lines are simply clipped.
  const decide = top && bop ? [top, bop] : series;
  const fits = (i: number, u0: number) => {
    for (const s of decide) {
      const v = val(s.values, i);
      if (!Number.isFinite(v)) continue;
      const u = sgn * v;
      if (u < u0 || u > u0 + W) return false;
    }
    return true;
  };
  /**
   * How many points from `i` stay inside the window starting at u0. A spike of a few
   * points (a bad ping) does not count as leaving: only a longer excursion cuts the panel.
   */
  const run = (i: number, u0: number) => {
    let n = 0;
    let bad = 0;
    while (i + n <= b) {
      if (fits(i + n, u0)) bad = 0;
      else if (++bad > 3) return n - 3;
      n++;
    }
    return n;
  };
  const pieces: { from: number; to: number; u0: number }[] = [];
  let i = a;
  let u0 = Math.floor((uMin - (W - (uMax - uMin)) / 2) / step) * step;
  if (uMax - uMin > W)
    u0 =
      Math.floor((uMin + uMax) / 2 / step) * step -
      Math.round(W / 2 / step) * step;
  while (i <= b && pieces.length < 200) {
    // Best window here: the one that keeps the profile inside the longest.
    let bestN = run(i, u0);
    let best = u0;
    const all = uRange(a, b, decide);
    // The asked-for depth step first; when no such window keeps the pipe in for long
    // (the pipe is thicker than the room left), move by finer steps.
    for (const g of [step, step / 2, step / 5, step / 10]) {
      if (bestN >= 20 || i + bestN > b) break;
      const lowN = Math.floor((all[0] - W - u0) / g);
      const highN = Math.ceil((all[1] - u0) / g);
      for (let n = Math.max(lowN, -400); n <= Math.min(highN, 400); n++) {
        const cand = u0 + n * g;
        const r = run(i, cand);
        if (
          r > bestN ||
          (r === bestN && Math.abs(cand - u0) < Math.abs(best - u0))
        ) {
          bestN = r;
          best = cand;
        }
      }
    }
    u0 = best;
    const to = Math.min(b, i + Math.max(1, bestN) - 1);
    // The next part starts on the point that left, so the line runs on across the cut.
    pieces.push({ from: i, to: Math.min(b, to + 1), u0 });
    if (to >= b) break;
    i = to + 1;
  }
  const xs = pieces.map((q, n) => ({
    xa: n === 0 ? p.x : toX(d.kp[q.from]),
    xb: n === pieces.length - 1 ? p.x + p.w : toX(d.kp[pieces[n + 1].from]),
  }));
  return (
    <g>
      {pieces.map((q, n) =>
        section(
          q.from,
          q.to,
          q.u0,
          xs[n].xa,
          xs[n].xb,
          `lp-${p.id}-${d.id}-${n}`,
        ),
      )}
      {xs.slice(1).map((c, n) => (
        <line
          key={`cut${n}`}
          x1={c.xa}
          x2={c.xa}
          y1={p.y}
          y2={p.y + p.h}
          stroke="currentColor"
          strokeWidth={0.25}
        />
      ))}
    </g>
  );
}

/**
 * Cross profiles turned on their side, as on the reference charts: lateral offset
 * runs up the panel (5 m to -5 m) and height runs across, so each profile sits on
 * its KP with the pipe drawn as a circle on the centre line.
 */
function TransProfiles({
  d,
  p,
  t,
  toX,
  span,
}: {
  d: Extract<Dataset, { kind: "trans" }>;
  p: Panel;
  t: ChartTemplate;
  toX: (kp: number) => number;
  span: [number, number];
}) {
  const every = d.every > 0 ? d.every : Math.max(1, t.scale.horizontal / 50);
  // Two scales, as in AutoChart: the vertical scale sets heights (drawn across the
  // panel), the lateral scale sets the scan width (drawn up it). Equal values give 1:1.
  const kV = 1000 / Math.max(1, t.scale.verticalTrans);
  const kL = 1000 / Math.max(1, t.scale.lateralTrans || t.scale.verticalTrans);
  const labelRoom = 9;
  const cy = p.y + labelRoom + (p.h - labelRoom - 4) / 2;
  const picks: typeof d.profiles = [];
  for (
    let kp = Math.ceil(span[0] / every) * every;
    kp <= span[1];
    kp += every
  ) {
    const pr = nearestProfile(d.profiles, kp, Math.max(1, every / 10));
    if (pr) picks.push(pr);
  }
  // The first and last profiles of the survey are worth showing even off the interval.
  for (const pr of [d.profiles[0], d.profiles[d.profiles.length - 1]]) {
    if (
      pr &&
      pr.kp >= span[0] &&
      pr.kp <= span[1] &&
      picks.every((x) => Math.abs(x.kp - pr.kp) > every / 4)
    )
      picks.push(pr);
  }
  const room = Math.max(
    1,
    Math.abs(toX(span[0] + every) - toX(span[0])) * 0.45,
  );
  const maxLat = (p.h - labelRoom - 4) / 2 / kL;
  const cap = 1.8;
  return (
    <g>
      <DepthAxis
        p={p}
        y={(v) => cy - v * kL}
        lo={-maxLat}
        hi={maxLat}
        o={{ line: niceGrid(maxLat * 2) / 2 }}
      />
      {picks.map((pr) => {
        const x0 = toX(pr.kp);
        let dots = "";
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
            <path
              d={dots}
              stroke={d.color}
              strokeWidth={0.3}
              strokeLinecap="round"
              fill="none"
            />
            <ellipse
              cx={x0}
              cy={cy}
              rx={Math.max(0.4, (pr.diameter / 2) * (d.pipeRound ? kL : kV))}
              ry={Math.max(0.4, (pr.diameter / 2) * kL)}
              fill={d.pipeFill}
              stroke={d.pipeColor}
              strokeWidth={0.15}
            />
            <line
              x1={x0}
              y1={p.y}
              x2={x0}
              y2={p.y + 1.5}
              stroke="currentColor"
              strokeWidth={0.15}
            />
            <text
              fontSize={fontSize(cap)}
              transform={`translate(${x0 - fontSize(cap) * 0.35} ${p.y + 2}) rotate(90)`}
            >
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
function EventsPanel({
  p,
  x0,
  toX,
  span,
  sets,
  ticks,
  routeEnd,
}: {
  p: Panel;
  x0: number;
  toX: (kp: number) => number;
  span: [number, number];
  sets: EventsSet[];
  ticks: [number, number][];
  routeEnd: number;
}) {
  const rows = p.rows ?? [];
  const drawingNo = useEditor((s) => s.template?.fields.DRAWING_NO ?? "");
  const folder = useProject((s) => s.active ?? "");
  const video = useVideo((s) => s.rows);
  const split = useMemo(
    () => sets.map((d) => ({ d, ...splitRanges(d.records, d.links) })),
    [sets],
  );
  if (!rows.length) return null;
  const rh = p.h / rows.length;
  const x1 = p.x + p.w;
  const out: ReactElement[] = [];
  rows.forEach((row, ri) => {
    const y0 = p.y + ri * rh;
    // A video row prints "start to end" of its product, as a stripe along the row.
    let r = row;
    if (isVideoRow(row) && !isKpRow(row)) {
      const key =
        row.videoProduct ||
        productIn(video, drawingNo) ||
        productIn(video, folder) ||
        (productKeys(video).length === 1 ? productKeys(video)[0] : null);
      const range = key ? videoRange(video, key) : null;
      r = {
        ...row,
        textOnly: true,
        text: range ? videoText(range) : (row.text ?? ""),
        stripe: row.stripe ?? true,
        stripeColor: row.stripeColor ?? "#d9d9d9",
      };
    }
    if (isKpRow(r)) {
      const cap = Math.min(1.8, rh / 3);
      for (const [kp, x] of ticks) {
        out.push(
          <g key={`kp${kp}`}>
            <line
              x1={x}
              y1={y0 + rh - 1.2}
              x2={x}
              y2={y0 + rh}
              stroke="currentColor"
              strokeWidth={0.15}
            />
            <text
              x={x}
              y={y0 + rh / 2 + fontSize(cap) * 0.35}
              fontSize={fontSize(cap)}
              textAnchor="middle"
            >
              {kpText(kp)}
            </text>
          </g>,
        );
      }
      return;
    }
    if (r.textOnly) {
      const font = split[0]?.d.font ?? DEFAULT_FONT;
      const text = r.text ?? "";
      if (r.stripe)
        out.push(
          <rect
            key={`z${r.id}`}
            x={x0 + 1}
            y={y0 + rh / 2 - Math.max(0.15, ((rh - 2) * (r.stripeWidth ?? 100)) / 100) / 2}
            width={Math.max(0, x1 - x0 - 2)}
            height={Math.max(0.15, ((rh - 2) * (r.stripeWidth ?? 100)) / 100)}
            style={{ fill: r.stripeColor ?? "#d9d9d9" }}
            fillOpacity={r.stripeOpacity ?? 1}
          />,
        );
      if (!text.trim()) return;
      const w = x1 - x0 - 4;
      let cap = Math.min(font.size, rh * 0.6);
      while (cap > 0.8 && measureText(text, cap, !!font.bold, font.family) > w)
        cap -= 0.1;
      const align = r.textAlign ?? "middle";
      const tx =
        align === "start" ? x0 + 2 : align === "end" ? x1 - 2 : (x0 + x1) / 2;
      out.push(
        <text
          key={`t${r.id}`}
          x={tx}
          y={y0 + rh / 2 + fontSize(cap) * 0.35}
          fontSize={fontSize(cap)}
          {...fontProps(font)}
          textAnchor={align}
        >
          {text}
        </text>,
      );
      return;
    }
    const match = codeMatcher(rowCodes(r));
    for (const { d, points, ranges, linked } of split) {
      const rs = ranges.filter(
        (e) =>
          match(e.code) &&
          (Number.isFinite(e.end) ? e.end : routeEnd) >= span[0] &&
          e.kp <= span[1],
      );
      rs.forEach((e, j) =>
        out.push(
          <RangeBar
            key={`${r.id}-${d.id}-r${j}`}
            e={e}
            y0={y0}
            rh={rh}
            toX={toX}
            x0={x0}
            x1={x1}
            routeEnd={routeEnd}
            color={d.color}
            font={d.font}
            n={rs.length}
            j={j}
          />,
        ),
      );
      const ls = linked.filter(
        (e) => match(e.startCode) && e.end >= span[0] && e.kp <= span[1],
      );
      if (ls.length)
        out.push(
          <LinkedEvents
            key={`${r.id}-${d.id}-l`}
            list={ls}
            y0={y0}
            rh={rh}
            toX={toX}
            font={d.font}
            labels={d.labels}
          />,
        );
      const ps = points.filter(
        (e) => match(e.code) && e.kp >= span[0] && e.kp <= span[1],
      );
      out.push(
        <PointTicks
          key={`${r.id}-${d.id}-p`}
          list={ps}
          y0={y0}
          rh={rh}
          toX={toX}
          color={d.color}
          font={d.font}
          labels={d.labels}
          layout={d.layout ?? DEFAULT_EVENT_LAYOUT}
        />,
      );
    }
  });
  return <g>{out}</g>;
}

function RangeBar({
  e,
  y0,
  rh,
  toX,
  x0,
  x1,
  routeEnd,
  color,
  font,
  n,
  j,
}: {
  e: EventRange;
  y0: number;
  rh: number;
  toX: (kp: number) => number;
  x0: number;
  x1: number;
  routeEnd: number;
  color: string;
  font: DataFont;
  n: number;
  j: number;
}) {
  // Several bars in one row share it top to bottom.
  const slot = rh / Math.max(1, n);
  const bh = Math.min(slot * 0.5, 3.2);
  const cy = y0 + slot * (j + 0.5);
  const xa = Math.max(x0, toX(e.kp));
  const xb = Math.min(x1, toX(Number.isFinite(e.end) ? e.end : routeEnd));
  if (xb <= xa) return null;
  const cap = Math.min(font.size, slot * 0.4);
  let text = e.value && e.value !== "0" ? e.value : e.code;
  const room = xb - xa - 2;
  while (text.length > 3 && measureText(text, cap) > room)
    text = text.slice(0, -2);
  if (text !== (e.value || e.code) && text.length > 3)
    text = text.slice(0, -1) + "…";
  return (
    <g>
      <rect x={xa} y={cy - bh / 2} width={xb - xa} height={bh} fill="#cfcfcf" />
      <line x1={xa} y1={cy} x2={xb} y2={cy} stroke={color} strokeWidth={0.12} />
      {room > 6 && (
        <text
          x={(xa + xb) / 2}
          y={cy - bh / 2 - 0.5}
          fontSize={fontSize(cap)}
          {...fontProps(font)}
          textAnchor="middle"
        >
          {text}
        </text>
      )}
    </g>
  );
}

function PointTicks({
  list,
  y0,
  rh,
  toX,
  color,
  font,
  labels,
  layout,
}: {
  list: EventMark[];
  y0: number;
  rh: number;
  toX: (kp: number) => number;
  color: string;
  font: DataFont;
  labels: boolean;
  layout: EventLayout;
}) {
  if (!list.length) return null;
  const len = rh * layout.markLen;
  // Ticks stand on the row's bottom line, or are centred in the row.
  const top =
    layout.markPos === "middle" ? y0 + rh / 2 - len / 2 : y0 + rh - len;
  const bottom = top + len;
  const cap = Math.min(font.size, rh / 5);
  const fs = fontSize(cap);
  const rot = layout.labelRotation;
  const upright = Math.abs(Math.sin((rot * Math.PI) / 180)) > 0.7;
  let path = "";
  const texts: ReactElement[] = [];
  let lastX = -Infinity;
  for (const e of list) {
    const x = toX(e.kp);
    path += `M${x.toFixed(2)} ${bottom.toFixed(2)}V${top.toFixed(2)}`;
    // Label sparse events with their code; dense ones (field joints) stay as ticks.
    const room = upright
      ? fs * 1.15
      : measureText(e.code, cap, !!font.bold, font.family) + fs * 0.4;
    if (labels && x - lastX > room && list.length <= 80) {
      const ax = upright ? x + fs * 0.35 : x;
      const ay = top - layout.labelGap;
      texts.push(
        <text
          key={texts.length}
          fontSize={fs}
          {...fontProps(font)}
          textAnchor={upright ? "start" : "middle"}
          transform={`translate(${ax.toFixed(2)} ${ay.toFixed(2)}) rotate(${(-rot).toFixed(1)})`}
        >
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
function LinkedEvents({
  list,
  y0,
  rh,
  toX,
  font,
  labels,
}: {
  list: LinkedEvent[];
  y0: number;
  rh: number;
  toX: (kp: number) => number;
  font: DataFont;
  labels: boolean;
}) {
  const cap = Math.min(font.size, rh / 6);
  const fs = fontSize(cap);
  return (
    <g>
      {list.map((e, i) => {
        const l = e.link;
        const xa = toX(e.kp);
        const xb = toX(e.end);
        const mid = (xa + xb) / 2;
        const c = l.color;
        const t = { ...fontProps(font), style: { fill: c } };
        const gap = l.textGap ?? 0.6;
        // The bar sits where the user put it (the middle by default); the end lines are centred on it.
        const centre = y0 + rh * (l.barPos ?? 0.5);
        const bh = l.barHeight ?? Math.min(rh * 0.28, 2.2);
        const barTop = centre - bh / 2;
        const barBot = centre + bh / 2;
        const half = (rh * (l.lineExtent ?? 0.8)) / 2;
        const lineTop = Math.max(y0 + gap * 0.5, centre - half);
        const lineBot = Math.min(y0 + rh - gap * 0.5, centre + half);
        // Texts keep their gap from the bar and stay clear of the row's own lines.
        const lengthY = Math.max(y0 + gap + cap, barTop - gap);
        const heightY = Math.min(y0 + rh - gap, barBot + gap + cap);
        const textY = (p: LabelPos) => (p === "top" ? lengthY : heightY);
        const lines = `M${xa.toFixed(2)} ${lineTop.toFixed(2)}V${lineBot.toFixed(2)}M${xb.toFixed(2)} ${lineTop.toFixed(2)}V${lineBot.toFixed(2)}`;
        return (
          <g key={i}>
            <rect
              x={xa}
              y={barTop}
              width={Math.max(0.1, xb - xa)}
              height={bh}
              fill={c}
            />
            <path
              d={lines}
              stroke={font.color}
              strokeWidth={0.12}
              fill="none"
            />
            {l.lengthPos !== "none" && (
              <text
                x={mid}
                y={textY(l.lengthPos)}
                fontSize={fs}
                textAnchor="middle"
                {...t}
              >
                {e.length.toFixed(2)}
              </text>
            )}
            {l.heightPos !== "none" && e.height !== undefined && (
              <text
                x={mid}
                y={textY(l.heightPos)}
                fontSize={fs}
                textAnchor="middle"
                {...t}
              >
                {e.height.toFixed(2)}
              </text>
            )}
            {labels && xb - xa > fs * 2.2 && (
              <>
                <text
                  fontSize={fs}
                  {...fontProps(font)}
                  transform={`translate(${(xa - fs * 0.35).toFixed(2)} ${(lineBot - gap).toFixed(2)}) rotate(-90)`}
                  textAnchor="start"
                >
                  {e.startCode}
                </text>
                <text
                  fontSize={fs}
                  {...fontProps(font)}
                  transform={`translate(${(xb + fs * 1.05).toFixed(2)} ${(lineBot - gap).toFixed(2)}) rotate(-90)`}
                  textAnchor="start"
                >
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
export function CpMark({
  symbol,
  x,
  y,
  r,
  color,
}: {
  symbol: CpSymbol;
  x: number;
  y: number;
  r: number;
  color: string;
}) {
  const fill = symbol.endsWith("Fill") ? color : "none";
  const st = { stroke: color, strokeWidth: 0.2, fill };
  if (symbol === "tick") return null;
  if (symbol.startsWith("circle"))
    return <circle cx={x} cy={y} r={r} {...st} />;
  if (symbol.startsWith("square"))
    return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...st} />;
  if (symbol.startsWith("triangle"))
    return (
      <path
        d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}L${x - r} ${y + r * 0.8}Z`}
        {...st}
      />
    );
  return (
    <path
      d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
      {...st}
    />
  );
}
