import { useEffect, type ReactElement } from "react";
import type { CpPoint, Dataset } from "../model/datasets";
import { clockText, cpLabel, cpLayout, pointsOf } from "../model/cpEdit";
import type { Panel } from "../model/types";
import { useCpEdit } from "../state/cpEdit";
import { CpMark, fontProps } from "./KpPanels";
import { fontSize } from "./svgText";

const BLUE = "#0a84ff";

type CpSet = Extract<Dataset, { kind: "cp" }>;

/** KP (m) at a paper x, by bisection over the span the panel shows (x grows with KP inside a chart). */
function kpFinder(toX: (kp: number) => number, span: [number, number]) {
  return (x: number) => {
    let lo = span[0];
    let hi = span[1];
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (toX(mid) < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
}

/** CP readings: symbols with their values (at one height or plotted by value), or a gradient line. */
export function Cp({
  d,
  p,
  toX,
  span,
}: {
  d: CpSet;
  p: Panel;
  toX: (kp: number) => number;
  span: [number, number];
}) {
  const editing = useCpEdit(
    (s) => s.active && s.panelId === p.id && s.datasetId === d.id,
  );
  const selPts = useCpEdit((s) => s.selPts);
  const selNotes = useCpEdit((s) => s.selNotes);
  const preview = useCpEdit((s) => s.preview);
  const layout = cpLayout(d, p);
  useEffect(() => {
    if (!editing) return;
    useCpEdit.getState().setCtx({
      panelId: p.id,
      datasetId: d.id,
      rect: { x: p.x, y: p.y, w: p.w, h: p.h },
      toX,
      kpAt: kpFinder(toX, span),
      layout,
    });
  });

  if (d.style !== "ticks") return <CpLine d={d} p={p} toX={toX} span={span} />;

  const look = layout.look;
  const pts = pointsOf(d);
  const fs = fontSize(Math.min(d.font.size, p.h / 3));
  const cap = fs * 0.7;
  const r = Math.max(0.2, look.symbolSize / 2);
  const foot = p.y + p.h;
  const out: ReactElement[] = [];
  let path = "";
  const lastX = new Map<string, number>();
  // Chosen items follow the pointer while they are dragged.
  const shift = (sel: boolean) => (sel && preview ? preview : { dx: 0, dy: 0 });
  const inView = (kp: number) => kp >= span[0] && kp <= span[1];
  const order = pts.map((_, i) => i).sort((a, b) => pts[a].kp - pts[b].kp);

  if (look.yMode === "value") {
    for (const t of layout.ticks) {
      if (look.yGrid)
        out.push(
          <line
            key={`g${t.mv}`}
            x1={p.x}
            x2={p.x + p.w}
            y1={t.y}
            y2={t.y}
            stroke={look.gridColor}
            strokeWidth={look.gridWidth}
            strokeDasharray={look.gridDash || undefined}
          />,
        );
      if (look.yLabels)
        out.push(
          <text
            key={`t${t.mv}`}
            x={p.x + 1}
            y={t.y - 0.4}
            fontSize={fontSize(1.5)}
            className="depth-label"
          >
            {look.yAbs ? Math.abs(t.mv) : t.mv < 0 ? `-${-t.mv}` : t.mv}
          </text>,
        );
    }
  }

  for (const i of order) {
    const pt: CpPoint = pts[i];
    if (!inView(pt.kp)) continue;
    const sel = editing && selPts.includes(i);
    const o = shift(sel);
    const x = toX(pt.kp) + o.dx;
    const cy = layout.yOf(pt) + o.dy;
    const rr = pt.size ? Math.max(0.2, pt.size / 2) : r;
    const color = pt.color ?? d.color;
    if (d.symbol === "tick")
      path += `M${x.toFixed(2)} ${(cy + rr).toFixed(2)}V${(cy - rr).toFixed(2)}`;
    else if (look.stem)
      path += `M${x.toFixed(2)} ${foot.toFixed(2)}V${cy.toFixed(2)}`;
    out.push(
      <CpMark
        key={`m${i}`}
        symbol={d.symbol}
        x={x}
        y={cy}
        r={rr}
        color={color}
      />,
    );
    if (sel)
      out.push(
        <circle
          key={`s${i}`}
          cx={x}
          cy={cy}
          r={rr + 0.9}
          fill="none"
          stroke={BLUE}
          strokeWidth={0.25}
          strokeDasharray="0.8 0.6"
        />,
      );
    if (!look.showText) continue;
    const label = cpLabel(pt, look);
    const clock = pt.textClock ?? look.textClock;
    const rot = look.textRotation;
    const horizontal = Math.abs(Math.sin((rot * Math.PI) / 180)) < 0.5;
    // Neighbouring readings on the same side must not print over each other.
    const need = horizontal ? label.length * fs * 0.6 + 0.5 : fs * 1.15;
    const key = `${clock}`;
    if (!editing && !look.showAll && x - (lastX.get(key) ?? -Infinity) <= need) continue;
    lastX.set(key, x);
    const c = clockText(
      clock,
      d.symbol === "tick" ? 0 : rr,
      look.textGap,
      cap,
      rot,
    );
    out.push(
      <text
        key={`x${i}`}
        fontSize={fs}
        {...fontProps(d.font)}
        textAnchor={c.anchor}
        transform={`translate(${(x + c.ox).toFixed(2)} ${(cy + c.oy).toFixed(2)}) rotate(${-rot})`}
      >
        {label}
      </text>,
    );
  }
  (d.notes ?? []).forEach((n, i) => {
    if (!inView(n.kp)) return;
    const sel = editing && selNotes.includes(i);
    const o = shift(sel);
    const nfs = fontSize(n.size ?? d.font.size);
    const f = fontProps(d.font);
    out.push(
      <text
        key={`n${i}`}
        fontSize={nfs}
        {...f}
        style={n.color ? { fill: n.color } : f.style}
        transform={`translate(${(toX(n.kp) + o.dx).toFixed(2)} ${(p.y + p.h * n.y + o.dy).toFixed(2)}) rotate(${-(n.rot ?? 0)})`}
      >
        {n.text}
      </text>,
    );
    if (sel)
      out.push(
        <rect
          key={`ns${i}`}
          x={toX(n.kp) + o.dx - 0.5}
          y={p.y + p.h * n.y + o.dy - (n.size ?? d.font.size) - 0.5}
          width={n.text.length * nfs * 0.55 + 1}
          height={(n.size ?? d.font.size) + 1.5}
          fill="none"
          stroke={BLUE}
          strokeWidth={0.2}
          strokeDasharray="0.8 0.6"
        />,
      );
  });
  return (
    <g>
      <path d={path} stroke={d.color} strokeWidth={0.15} fill="none" />
      {out}
      {editing && (
        <rect
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill="none"
          stroke={BLUE}
          strokeWidth={0.5}
          strokeDasharray="2.5 1.5"
        />
      )}
    </g>
  );
}

function CpLine({
  d,
  p,
  toX,
  span,
}: {
  d: CpSet;
  p: Panel;
  toX: (kp: number) => number;
  span: [number, number];
}) {
  let a = 0;
  while (a < d.kp.length && d.kp[a] < span[0]) a++;
  let b = d.kp.length - 1;
  while (b > 0 && d.kp[b] > span[1]) b--;
  a = Math.max(0, a - 1);
  b = Math.min(d.kp.length - 1, b + 1);
  if (b < a) return null;
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
  let path = "";
  for (let i = a; i <= b; i++)
    path += `${i === a ? "M" : "L"}${toX(d.kp[i]).toFixed(2)} ${y(d.mv[i]).toFixed(2)}`;
  return (
    <g>
      <text
        x={p.x + 1}
        y={p.y + 3}
        fontSize={fontSize(1.4)}
        className="depth-label"
      >
        {Math.round(hi)} mV
      </text>
      <text
        x={p.x + 1}
        y={p.y + p.h - 1}
        fontSize={fontSize(1.4)}
        className="depth-label"
      >
        {Math.round(lo)} mV
      </text>
      <path d={path} fill="none" stroke={d.color} strokeWidth={0.3} />
    </g>
  );
}
