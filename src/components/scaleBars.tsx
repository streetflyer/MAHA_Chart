import type { ScaleBarStyle } from "../model/types";

/**
 * A scale bar in one of the AutoCAD-like styles. (x0, yb) is the left end of the bar's
 * centre line; it is `n` divisions of `seg` mm. Styles whose name says "subdivided" split
 * the first division in four.
 */
export function BarShape({
  style,
  x0,
  yb,
  seg,
  n,
  h = 1.2,
}: {
  style: ScaleBarStyle;
  x0: number;
  yb: number;
  seg: number;
  n: number;
  h?: number;
}) {
  const W = seg * n;
  const lw = Math.max(0.1, h * 0.1);
  const ink = { stroke: "var(--ink)", strokeWidth: lw, fill: "none" };
  const dark = { fill: "var(--ink)" };
  const light = { fill: "var(--paper)" };
  // Cells: the first division split in four for the subdivided styles.
  const cells = (sub: boolean) => {
    const out: { x: number; w: number }[] = [];
    for (let k = 0; k < n; k++) {
      if (sub && k === 0)
        for (let j = 0; j < 4; j++)
          out.push({ x: x0 + (j * seg) / 4, w: seg / 4 });
      else out.push({ x: x0 + k * seg, w: seg });
    }
    return out;
  };
  const r = (
    k: string | number,
    x: number,
    y: number,
    w: number,
    hh: number,
    filled: boolean,
  ) => (
    <rect
      key={k}
      x={x}
      y={y}
      width={w}
      height={hh}
      {...(filled ? dark : light)}
    />
  );
  const half = h / 2;
  switch (style) {
    case "stepLine": {
      let d = `M${x0} ${yb - half}`;
      for (let k = 0; k < n; k++) {
        const y = k % 2 ? yb - half : yb + half;
        d += `V${y}H${x0 + (k + 1) * seg}`;
      }
      return <path d={d} {...ink} />;
    }
    case "stepBold":
      return (
        <g>
          {Array.from({ length: n }, (_, k) =>
            r(k, x0 + k * seg, k % 2 ? yb : yb - h * 0.45, seg, h * 0.45, true),
          )}
        </g>
      );
    case "fillLine":
      return (
        <g>
          {cells(false).map((c, k) =>
            r(k, c.x, yb - h * 0.25, c.w, h * 0.5, k % 2 === 0),
          )}
          <rect x={x0} y={yb - h * 0.25} width={W} height={h * 0.5} {...ink} />
        </g>
      );
    case "doubleOutline": {
      let d = `M${x0} ${yb - half}h${W}v${h}h${-W}z`;
      for (let k = 1; k < n; k++) d += `M${x0 + k * seg} ${yb - half}v${h}`;
      for (let k = 0; k < n; k += 2) d += `M${x0 + k * seg} ${yb}h${seg}`;
      return <path d={d} {...ink} />;
    }
    case "checker":
    case "subChecker":
      return (
        <g>
          {cells(style === "subChecker").map((c, k) => (
            <g key={k}>
              {r("a", c.x, yb - half, c.w, half, k % 2 === 1)}
              {r("b", c.x, yb, c.w, half, k % 2 === 0)}
            </g>
          ))}
          <rect x={x0} y={yb - half} width={W} height={h} {...ink} />
        </g>
      );
    case "ticks": {
      let d = `M${x0} ${yb}h${W}`;
      for (const c of cells(true)) d += `M${c.x} ${yb - h}v${h}`;
      d += `M${x0 + W} ${yb - h}v${h}`;
      return <path d={d} {...ink} />;
    }
    case "blocksTicks": {
      let d = "";
      for (let k = 0; k <= n; k++)
        d += `M${x0 + k * seg} ${yb + half}v${h * 0.5}`;
      return (
        <g>
          {cells(false).map((c, k) =>
            r(k, c.x, yb - half, c.w, h, k % 2 === 0),
          )}
          <rect x={x0} y={yb - half} width={W} height={h} {...ink} />
          <path d={d} {...ink} />
        </g>
      );
    }
    case "subBar":
      return (
        <g>
          {cells(true).map((c, k) =>
            r(k, c.x, yb - h * 0.3, c.w, h * 0.6, k % 2 === 0),
          )}
          <rect x={x0} y={yb - h * 0.3} width={W} height={h * 0.6} {...ink} />
        </g>
      );
    case "stepBlocks": {
      let d = "";
      cells(true).forEach((c) => (d += `M${c.x} ${yb - h}v${2 * h}`));
      d += `M${x0 + W} ${yb - h}v${2 * h}`;
      return (
        <g>
          {cells(true).map((c, k) =>
            r(k, c.x, k % 2 ? yb + h * 0.1 : yb - h * 0.6, c.w, h * 0.5, true),
          )}
          <path d={d} {...ink} strokeWidth={lw * 0.8} />
        </g>
      );
    }
    default:
      return (
        <g>
          {Array.from({ length: n }, (_, k) =>
            r(k, x0 + k * seg, yb - half, seg, h, k % 2 === 0),
          )}
          <rect x={x0} y={yb - half} width={W} height={h} {...ink} />
        </g>
      );
  }
}
