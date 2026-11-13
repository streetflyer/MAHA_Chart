import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Dataset } from '../model/datasets';
import { splitRanges } from '../model/events';
import { buildDataset, DEFAULT_COLOURS, type Mapping } from '../model/importers';
import { makeRoute } from '../model/route';
import { splitAtKp0, type Runline } from '../model/runline';
import type { Table } from '../model/tables';
import type { Linework } from '../model/dxf';
import type { ImportTarget, DataStyle } from '../model/datasets';
import { applyStyle } from './DataStyleControls';
import { CpMark, depthSense, fontProps } from './KpPanels';
import { useEditor } from '../state/store';

const W = 600;
const H = 180;
const PAD = 28;

interface PreviewItem {
  file: File;
  target: ImportTarget;
  mapping: Mapping;
  style: DataStyle;
  lw?: Linework;
  runlines?: Runline[];
  tables?: Table[];
}

/** A quick drawing of the data as it is mapped now, so a wrong column shows before import. */
export function ImportPreview({ it, table }: { it: PreviewItem; table: Table | null }) {
  const d = useMemo((): Dataset | string => {
    let out: Dataset | string;
    if (it.runlines) {
      const rl = it.runlines.find((r) => r.name === it.mapping.layer) ?? it.runlines[0];
      const { line, before } = splitAtKp0(rl);
      out = { id: 'preview', name: rl.name, target: 'route', visible: true, color: DEFAULT_COLOURS.route!, kind: 'route', route: makeRoute(rl.name, line), width: 0.35, before: before ? new Float64Array(before) : undefined };
    } else out = buildDataset(it.target, it.file.name, table, it.mapping, it.lw);
    return typeof out === 'string' ? out : applyStyle(out, it.style);
  }, [it.runlines, it.target, it.file.name, table, it.mapping, it.lw, it.style]);
  if (typeof d === 'string') return <p className="hint warn">Preview: {d}</p>;
  let body: ReactElement | null = null;
  if (d.kind === 'route' || d.kind === 'linework') body = <MapPreview d={d} />;
  else if (d.kind === 'long') body = <LongPreview d={d} />;
  else if (d.kind === 'trans') body = <TransPreview d={d} />;
  else if (d.kind === 'events') body = <EventsPreview d={d} />;
  else if (d.kind === 'cp') body = <CpPreview d={d} />;
  return <PanZoomSvg>{body}</PanZoomSvg>;
}

type Box = [number, number, number, number];

/**
 * The preview drawing in a box that can be resized (drag its corner), zoomed
 * (wheel, or the + / − buttons) and panned (drag). Double-click goes back to the whole drawing.
 */
function PanZoomSvg({ children }: { children: ReactElement | null }) {
  const full: Box = [0, 0, W, H];
  const [vb, setVb] = useState<Box>(full);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: Box } | null>(null);
  const zoomAt = (f: number, cx = 0.5, cy = 0.5) =>
    setVb(([x, y, w, h]) => {
      const nw = Math.min(W * 4, Math.max(W / 200, w * f));
      const nh = (nw / w) * h;
      return [x + (w - nw) * cx, y + (h - nh) * cy, nw, nh];
    });
  // Wheel zoom needs a non-passive listener so the page doesn't scroll as well.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const zoomPct = Math.round((W / vb[2]) * 100);
  return (
    <div className="pz-wrap">
      <div className="pz-tools">
        <button type="button" title="Zoom out" onClick={() => zoomAt(1.25)}>
          −
        </button>
        <span className="pz-zoom">{zoomPct}%</span>
        <button type="button" title="Zoom in" onClick={() => zoomAt(0.8)}>
          +
        </button>
        <button type="button" title="Show all (or double-click the drawing)" onClick={() => setVb(full)}>
          Fit
        </button>
        <span className="hint">Wheel to zoom, drag to pan, drag the corner to resize</span>
      </div>
      <div className="pz-box">
        <svg
          ref={svg}
          className="import-preview"
          viewBox={vb.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Preview of the mapped data"
          onDoubleClick={() => setVb(full)}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, vb };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !svg.current) return;
            const r = svg.current.getBoundingClientRect();
            const k = Math.max(d.vb[2] / r.width, d.vb[3] / r.height);
            setVb([d.vb[0] - (e.clientX - d.x) * k, d.vb[1] - (e.clientY - d.y) * k, d.vb[2], d.vb[3]]);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <rect x={-W * 10} y={-H * 10} width={W * 21} height={H * 21} fill="#fff" />
          {children}
        </svg>
      </div>
    </div>
  );
}

type Fit = (e: number, n: number) => [number, number];

function fitBox(minX: number, maxX: number, minY: number, maxY: number, keepAspect: boolean): Fit {
  const sx = (W - 2 * PAD) / Math.max(1e-9, maxX - minX);
  const sy = (H - 2 * PAD) / Math.max(1e-9, maxY - minY);
  const k = Math.min(sx, sy);
  const kx = keepAspect ? k : sx;
  const ky = keepAspect ? k : sy;
  const ox = PAD + (W - 2 * PAD - (maxX - minX) * kx) / 2;
  const oy = PAD + (H - 2 * PAD - (maxY - minY) * ky) / 2;
  return (x, y) => [ox + (x - minX) * kx, oy + (maxY - y) * ky];
}

function poly(l: ArrayLike<number>, f: Fit, step = 1): string {
  let s = '';
  for (let i = 0; i < l.length; i += 2 * step) {
    const [x, y] = f(l[i], l[i + 1]);
    s += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return s;
}

const Axis = ({ text, x, y, anchor = 'start' }: { text: string; x: number; y: number; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} fontSize={10} fill="#5b6670" textAnchor={anchor}>
    {text}
  </text>
);

function MapPreview({ d }: { d: Extract<Dataset, { kind: 'route' | 'linework' }> }) {
  const lines = d.kind === 'route' ? [d.route.en, ...(d.before ? [d.before] : [])] : d.lw.lines.slice(0, 4000);
  const b = d.kind === 'route' ? undefined : d.lw.bounds;
  let minE = b?.minE ?? Infinity;
  let maxE = b?.maxE ?? -Infinity;
  let minN = b?.minN ?? Infinity;
  let maxN = b?.maxN ?? -Infinity;
  if (!b)
    for (const l of lines)
      for (let i = 0; i < l.length; i += 2) {
        minE = Math.min(minE, l[i]);
        maxE = Math.max(maxE, l[i]);
        minN = Math.min(minN, l[i + 1]);
        maxN = Math.max(maxN, l[i + 1]);
      }
  const f = fitBox(minE, maxE, minN, maxN, true);
  const sw = Math.max(0.6, d.width * 4);
  return (
    <g>
      {lines.map((l, i) => (
        <path key={i} d={poly(l, f, Math.max(1, Math.floor(l.length / 4000)))} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={d.kind === 'route' && i > 0 ? '4 2' : undefined} />
      ))}
      {d.kind === 'route' && (
        <>
          <Axis text="KP 0.000" x={f(d.route.en[0], d.route.en[1])[0]} y={f(d.route.en[0], d.route.en[1])[1] - 6} anchor="middle" />
          <Axis text={`KP ${(d.route.length / 1000).toFixed(3)}`} x={f(d.route.en[d.route.en.length - 2], d.route.en[d.route.en.length - 1])[0]} y={f(d.route.en[d.route.en.length - 2], d.route.en[d.route.en.length - 1])[1] - 6} anchor="middle" />
        </>
      )}
      <Axis text={`${Math.round(minE)} E – ${Math.round(maxE)} E`} x={PAD} y={H - 6} />
    </g>
  );
}

function LongPreview({ d }: { d: Extract<Dataset, { kind: 'long' }> }) {
  const n = d.kp.length;
  const step = Math.max(1, Math.floor(n / 800));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of d.series)
    for (let i = 0; i < n; i += step) {
      const v = s.values[i];
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  const sg = depthSense(d);
  const f = fitBox(d.kp[0], d.kp[n - 1], sg > 0 ? -hi : lo, sg > 0 ? -lo : hi, false);
  const line = (vals: Float64Array, rev = false) => {
    let s = '';
    const idx = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (rev) idx.reverse();
    for (const i of idx) {
      if (!Number.isFinite(vals[i])) continue;
      const [x, y] = f(d.kp[i], -sg * vals[i]);
      s += `${s ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return s;
  };
  const top = d.top !== undefined ? d.series[d.top] : undefined;
  const bop = d.bop !== undefined ? d.series[d.bop] : undefined;
  return (
    <g>
      {top && bop && <path d={line(top.values) + line(bop.values, true).replace(/^M/, 'L') + 'Z'} fill={d.fill} />}
      {d.series.map((s, j) => (
        <path key={j} d={line(s.values)} fill="none" stroke={s.color} strokeWidth={1} />
      ))}
      <Axis text={`KP ${(d.kp[0] / 1000).toFixed(3)}`} x={PAD} y={H - 6} />
      <Axis text={`KP ${(d.kp[n - 1] / 1000).toFixed(3)}`} x={W - PAD} y={H - 6} anchor="end" />
      <Axis text={`${(sg > 0 ? lo : hi).toFixed(1)} m`} x={4} y={PAD} />
      <Axis text={`${(sg > 0 ? hi : lo).toFixed(1)} m`} x={4} y={H - PAD} />
    </g>
  );
}

function TransPreview({ d }: { d: Extract<Dataset, { kind: 'trans' }> }) {
  const n = Math.min(5, d.profiles.length);
  const picks = Array.from({ length: n }, (_, i) => d.profiles[Math.floor((i * (d.profiles.length - 1)) / Math.max(1, n - 1))]);
  const k = (H - 2 * PAD) / 10; // ±5 m across the height
  const sc = useEditor((s) => s.template?.scale);
  // Heights are stretched by the vertical exaggeration (lateral scale / vertical scale).
  const kh = k * (sc ? (sc.lateralTrans || sc.verticalTrans) / Math.max(1, sc.verticalTrans) : 1);
  const slot = (W - 2 * PAD) / n;
  const cy = H / 2;
  return (
    <g>
      {picks.map((p, j) => {
        const x0 = PAD + slot * (j + 0.5);
        let dots = '';
        for (let i = 0; i < p.pts.length; i += 2) {
          if (Math.abs(p.pts[i]) > 5 || Math.abs(p.pts[i + 1] * kh) > slot * 0.45) continue;
          dots += `M${(x0 + p.pts[i + 1] * kh).toFixed(1)} ${(cy - p.pts[i] * k).toFixed(1)}h0.1`;
        }
        return (
          <g key={j}>
            <path d={dots} stroke={d.color} strokeWidth={1.4} strokeLinecap="round" />
            <ellipse cx={x0} cy={cy} rx={Math.max(2, (p.diameter / 2) * kh)} ry={Math.max(2, (p.diameter / 2) * k)} fill={d.pipeFill} stroke={d.pipeColor} strokeWidth={0.8} />
            <Axis text={(p.kp / 1000).toFixed(3)} x={x0} y={14} anchor="middle" />
          </g>
        );
      })}
      <Axis text={`${d.profiles.length.toLocaleString()} profiles`} x={W - PAD} y={H - 6} anchor="end" />
    </g>
  );
}

function EventsPreview({ d }: { d: Extract<Dataset, { kind: 'events' }> }) {
  const { points, ranges, linked } = splitRanges(d.records, d.links);
  const kps = d.records.map((r) => r.kp);
  const lo = Math.min(...kps);
  const hi = Math.max(...kps, lo + 1);
  const groups = [...new Set([...ranges.map((r) => r.code.split('.')[0]), ...linked.map((l) => `${l.startCode}→${l.endCode}`), ...points.map((p) => p.code.split('.')[0])])].slice(0, 8);
  const rh = (H - 20) / Math.max(1, groups.length);
  const x = (kp: number) => 70 + ((kp - lo) / (hi - lo)) * (W - 90);
  const font = fontProps(d.font);
  return (
    <g>
      {groups.map((g, i) => {
        const y0 = 4 + i * rh;
        return (
          <g key={g}>
            <line x1={0} x2={W} y1={y0 + rh} y2={y0 + rh} stroke="#ccc" />
            <text x={4} y={y0 + rh / 2 + 4} fontSize={10} {...font}>
              {g}
            </text>
            {ranges
              .filter((r) => r.code.split('.')[0] === g)
              .map((r, j) => (
                <rect key={j} x={x(r.kp)} y={y0 + rh * 0.35} width={Math.max(1, x(Number.isFinite(r.end) ? r.end : hi) - x(r.kp))} height={rh * 0.3} fill="#cfcfcf" />
              ))}
            {linked
              .filter((l) => `${l.startCode}→${l.endCode}` === g)
              .map((l, j) => (
                <rect key={j} x={x(l.kp)} y={y0 + rh * 0.25} width={Math.max(1, x(l.end) - x(l.kp))} height={rh * 0.5} fill={l.link.color} />
              ))}
            <path
              d={points
                .filter((p) => p.code.split('.')[0] === g)
                .map((p) => `M${x(p.kp).toFixed(1)} ${(y0 + rh).toFixed(1)}v${(-rh * 0.4).toFixed(1)}`)
                .join('')}
              stroke={d.color}
              strokeWidth={0.6}
            />
          </g>
        );
      })}
      <Axis text={`KP ${(lo / 1000).toFixed(3)}`} x={70} y={H - 3} />
      <Axis text={`KP ${(hi / 1000).toFixed(3)} · ${d.records.length} events`} x={W - 4} y={H - 3} anchor="end" />
    </g>
  );
}

function CpPreview({ d }: { d: Extract<Dataset, { kind: 'cp' }> }) {
  const n = d.kp.length;
  const lo = d.kp[0];
  const hi = Math.max(d.kp[n - 1], lo + 1);
  const x = (kp: number) => PAD + ((kp - lo) / (hi - lo)) * (W - 2 * PAD);
  const foot = H - 22;
  const step = Math.max(1, Math.ceil(n / 60));
  const out: ReactElement[] = [];
  for (let i = 0; i < n; i += step) {
    const xx = x(d.kp[i]);
    out.push(
      <g key={i}>
        <line x1={xx} x2={xx} y1={foot} y2={foot - 18} stroke={d.color} strokeWidth={0.8} />
        <CpMark symbol={d.symbol} x={xx} y={foot - 22} r={3.5} color={d.color} />
        <text fontSize={9} {...fontProps(d.font)} transform={`translate(${xx + 3} ${foot - 28}) rotate(-90)`}>
          {Math.round(d.mv[i])} mV
        </text>
      </g>,
    );
  }
  return (
    <g>
      <line x1={0} x2={W} y1={foot} y2={foot} stroke="#ccc" />
      {out}
      <Axis text={`KP ${(lo / 1000).toFixed(3)}`} x={PAD} y={H - 6} />
      <Axis text={`KP ${(hi / 1000).toFixed(3)} · ${n} readings`} x={W - PAD} y={H - 6} anchor="end" />
    </g>
  );
}
