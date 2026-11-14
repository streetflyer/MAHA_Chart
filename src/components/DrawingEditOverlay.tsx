import { useMemo } from "react";
import { type Preview } from "../state/drawingEdit";
import type { Panel } from "../model/types";
import { linesPath } from "./linework";
import { TextNode, placeText, type LineworkSet } from "./LineworkLayer";
import { rotateHandle, selectionBox } from "./drawingEditing";
import { fontSize } from "./svgText";
import type { PlanContext } from "../state/drawingEdit";

type Pt = [number, number];
const BLUE = "#0a84ff";
const EVERYTHING = {
  minE: -Infinity,
  maxE: Infinity,
  minN: -Infinity,
  maxN: Infinity,
};

/** SVG matrix that carries paper points the way a grid transform carries grid points. */
function paperMatrix(
  ctx: PlanContext,
  about: Pt,
  f: (e: number, n: number) => Pt,
): string {
  const g0: Pt[] = [about, [about[0] + 1, about[1]], [about[0], about[1] + 1]];
  const P0 = g0.map(([e, n]) => ctx.project(e, n));
  const P1 = g0.map(([e, n]) => {
    const [fe, fn] = f(e, n);
    return ctx.project(fe, fn);
  });
  const l0 = [
    P0[1][0] - P0[0][0],
    P0[1][1] - P0[0][1],
    P0[2][0] - P0[0][0],
    P0[2][1] - P0[0][1],
  ];
  const l1 = [
    P1[1][0] - P1[0][0],
    P1[1][1] - P1[0][1],
    P1[2][0] - P1[0][0],
    P1[2][1] - P1[0][1],
  ];
  const det = l0[0] * l0[3] - l0[2] * l0[1] || 1;
  // inverse of L0 = [[l0[0], l0[2]], [l0[1], l0[3]]]
  const i = [l0[3] / det, -l0[1] / det, -l0[2] / det, l0[0] / det];
  const a = l1[0] * i[0] + l1[2] * i[1];
  const b = l1[1] * i[0] + l1[3] * i[1];
  const c = l1[0] * i[2] + l1[2] * i[3];
  const d = l1[1] * i[2] + l1[3] * i[3];
  const e = P1[0][0] - (a * P0[0][0] + c * P0[0][1]);
  const ff = P1[0][1] - (b * P0[0][0] + d * P0[0][1]);
  return `matrix(${a} ${b} ${c} ${d} ${e} ${ff})`;
}

/**
 * Drawing-edit mode in the plan view: the chosen objects in blue (moving or
 * turning live while dragged), the selection box, and the rotate handle.
 */
export function DrawingEditOverlay({
  p,
  clipId,
  sets,
  ctx,
  selected,
  preview,
}: {
  p: Panel;
  clipId: string;
  sets: LineworkSet[];
  ctx: PlanContext;
  selected: Record<string, number[]>;
  preview: Preview | null;
}) {
  const parts = useMemo(
    () =>
      sets.map((d) => {
        const g = new Set(selected[d.id] ?? []);
        if (!g.size) return null;
        const lines = d.lw.lines.filter((_, i) => g.has(d.lw.groups[i]));
        const texts = d.lw.texts.filter((t) => g.has(t.group));
        return {
          d,
          path: linesPath(lines, EVERYTHING, ctx.project, 0.001),
          texts,
        };
      }),
    [sets, selected, ctx],
  );
  const box = useMemo(() => selectionBox(selected), [selected, sets]);
  const handle = useMemo(
    () => rotateHandle(ctx, selected),
    [ctx, selected, sets],
  );

  let transform: string | undefined;
  if (box && preview?.kind === "move") {
    const about: Pt = [(box.minE + box.maxE) / 2, (box.minN + box.maxN) / 2];
    transform = paperMatrix(ctx, about, (e, n) => [
      e + preview.dE,
      n + preview.dN,
    ]);
  } else if (box && preview?.kind === "rotate") {
    const c = Math.cos(preview.angle);
    const s = Math.sin(preview.angle);
    transform = paperMatrix(ctx, [preview.cE, preview.cN], (e, n) => [
      preview.cE + (e - preview.cE) * c - (n - preview.cN) * s,
      preview.cN + (e - preview.cE) * s + (n - preview.cN) * c,
    ]);
  }

  const outline: Pt[] | null = box
    ? [
        ctx.project(box.minE, box.minN),
        ctx.project(box.maxE, box.minN),
        ctx.project(box.maxE, box.maxN),
        ctx.project(box.minE, box.maxN),
      ]
    : null;

  return (
    <g pointerEvents="none">
      <g clipPath={`url(#${clipId})`}>
        <g transform={transform}>
          {parts.map((x) =>
            x ? (
              <g key={x.d.id}>
                {x.path && (
                  <path
                    d={x.path}
                    fill="none"
                    stroke={BLUE}
                    strokeWidth={Math.max(0.4, x.d.width * 2)}
                    strokeLinejoin="round"
                  />
                )}
                {x.texts.map((t, i) => {
                  const hl = {
                    ...x.d,
                    textColor: BLUE,
                    layers: {},
                  } as LineworkSet;
                  const pl = placeText(
                    x.d,
                    t,
                    ctx.project,
                    ctx.mmPerM,
                    ctx.uAngle,
                  );
                  return pl ? <TextNode key={i} d={hl} t={t} pl={pl} /> : null;
                })}
              </g>
            ) : null,
          )}
          {outline && (
            <path
              d={`M${outline.map((q) => q.join(" ")).join("L")}Z`}
              fill="none"
              stroke={BLUE}
              strokeWidth={0.2}
              strokeDasharray="1.2 0.8"
            />
          )}
        </g>
      </g>
      {handle && !preview && (
        <g>
          <line
            x1={handle.x}
            y1={handle.y + 1.6}
            x2={handle.cx}
            y2={handle.cy}
            stroke={BLUE}
            strokeWidth={0.15}
            strokeDasharray="0.8 0.6"
          />
          <circle
            cx={handle.x}
            cy={handle.y}
            r={1.6}
            fill="#fff"
            stroke={BLUE}
            strokeWidth={0.35}
          />
          <path
            d={`M${handle.x - 0.8} ${handle.y + 0.1}a0.9 0.9 0 1 1 0.5 0.8`}
            fill="none"
            stroke={BLUE}
            strokeWidth={0.25}
          />
        </g>
      )}
      {preview?.kind === "box" && (
        <rect
          x={Math.min(preview.x0, preview.x1)}
          y={Math.min(preview.y0, preview.y1)}
          width={Math.abs(preview.x1 - preview.x0)}
          height={Math.abs(preview.y1 - preview.y0)}
          fill={
            preview.x1 < preview.x0
              ? "rgba(40,180,90,0.12)"
              : "rgba(10,132,255,0.12)"
          }
          stroke={preview.x1 < preview.x0 ? "#28b45a" : BLUE}
          strokeWidth={0.25}
          strokeDasharray={preview.x1 < preview.x0 ? "1 0.7" : undefined}
        />
      )}
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
      <text x={p.x + 2} y={p.y + p.h - 2} fontSize={fontSize(1.6)} fill={BLUE}>
        Editing the drawing: click or drag a box to choose, drag to move, drag
        the round handle to turn, Delete removes. Esc or Done to finish.
      </text>
    </g>
  );
}
