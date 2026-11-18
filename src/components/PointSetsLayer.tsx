import { useMemo } from "react";
import { plotPoints, type PointSet } from "../model/pointSets";
import { fontSize } from "./svgText";
import { useSurvey } from "../state/surveyData";
import { Marker, MarkerHatch } from "./Marker";

type Project = (e: number, n: number) => [number, number];

/** Default place of a label: up and to the right of its symbol. */
export const labelOffset = (s: PointSet, key: string) =>
  s.labelAt?.[key] ?? { dx: s.size * 0.8, dy: -s.size * 0.8 };

/**
 * The point sets of a plan view, drawn with their symbols and descriptions. In the plan view
 * (`interactive`) points and labels can be dragged and right-clicked; a label moved away from
 * its point gets a leader line. The key plan draws only the symbols, smaller.
 */
export function PointSetsLayer({
  panelId,
  sets,
  project,
  k0,
  interactive,
  scale = 1,
}: {
  panelId: string;
  sets: PointSet[];
  project: Project;
  k0: number;
  interactive: boolean;
  scale?: number;
}) {
  const route = useSurvey((s) => s.route);
  const datasets = useSurvey((s) => s.datasets);
  const plotted = useMemo(
    () =>
      sets.map((s) => {
        const d = datasets.find(
          (x) => x.kind === "events" && x.name === s.source,
        );
        return {
          s,
          pts: d?.kind === "events" ? plotPoints(s, d, route, k0).points : [],
        };
      }),
    [sets, datasets, route, k0],
  );
  return (
    <g data-point-sets={panelId}>
      {plotted.map(({ s, pts }) => {
        const hid = `pts-h-${panelId}-${s.id}`;
        const sz = s.size * scale;
        const fs = fontSize(s.label.size);
        return (
          <g key={s.id}>
            {s.fill === "hatch" && (
              <defs>
                <MarkerHatch id={hid} color={s.fillColor ?? s.color} />
              </defs>
            )}
            {pts.map((pt) => {
              const [x, y] = project(pt.e, pt.n);
              const off = labelOffset(s, pt.key);
              const lx = x + off.dx;
              const ly = y + off.dy;
              const far = Math.hypot(off.dx, off.dy) > s.size * 2;
              const id = `${panelId}|${s.id}|${pt.key}`;
              return (
                <g key={pt.key}>
                  <Marker
                    shape={s.shape}
                    x={x}
                    y={y}
                    s={sz}
                    color={s.color}
                    width={s.width * scale}
                    fill={s.fill}
                    fillColor={s.fillColor}
                    hatchId={hid}
                  />
                  {interactive && (
                    <circle
                      className="row-hit pts-hit"
                      data-pts={id}
                      cx={x}
                      cy={y}
                      r={Math.max(sz / 2, 1)}
                      pointerEvents="all"
                    />
                  )}
                  {interactive && s.label.show && pt.text && (
                    <>
                      {far && (
                        <line
                          x1={x}
                          y1={y}
                          x2={lx}
                          y2={ly}
                          style={{ stroke: s.color, strokeWidth: 0.15 }}
                        />
                      )}
                      <text
                        x={lx}
                        y={ly}
                        fontSize={fs}
                        style={{ fill: s.label.color }}
                      >
                        {pt.text.split("\n").map((l, i) => (
                          <tspan key={i} x={lx} dy={i ? fs * 1.2 : 0}>
                            {l}
                          </tspan>
                        ))}
                      </text>
                      <rect
                        className="row-hit pts-hit"
                        data-ptslabel={id}
                        x={lx - 0.3}
                        y={ly - fs}
                        width={
                          Math.max(
                            ...pt.text.split("\n").map((l) => l.length),
                          ) *
                            fs *
                            0.62 +
                          0.6
                        }
                        height={fs * 1.2 * pt.text.split("\n").length + 0.4}
                        pointerEvents="all"
                      />
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
