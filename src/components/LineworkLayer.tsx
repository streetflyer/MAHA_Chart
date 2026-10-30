import { useMemo } from 'react';
import type { Dataset } from '../model/datasets';
import type { Bounds } from '../model/route';
import { linesPath } from './linework';
import { fontSize } from './svgText';

type LineworkSet = Extract<Dataset, { kind: 'linework' }>;
type Project = (e: number, n: number) => [number, number];

/** Texts smaller than this on paper can't be read and only cost time. */
const MIN_TEXT_MM = 0.15;
const MAX_TEXTS = 4000;
const AUTO_MIN_MM = 1.2;
const AUTO_MAX_MM = 3;

/**
 * Imported drawings (DXF, .dig, listings) in a map panel: lines in the
 * dataset's colour and width, and DXF texts either scaled with the map or at a
 * fixed paper height.
 */
export function LineworkLayer({
  sets,
  area,
  project,
  mmPerM,
  uAngle = 0,
  widthScale = 1,
}: {
  sets: LineworkSet[];
  /** Grid box that can show; anything outside is skipped. */
  area: Bounds;
  project: Project;
  /** Paper millimetres per grid metre. */
  mmPerM: number;
  /** Direction of the paper's x axis in the grid, degrees anticlockwise from east. */
  uAngle?: number;
  widthScale?: number;
}) {
  const paths = useMemo(() => sets.map((d) => linesPath(d.lw.lines, area, project, 0.05)), [sets, area, project]);
  return (
    <>
      {sets.map((d, i) => (
        <g key={d.id}>
          {paths[i] && <path d={paths[i]} fill="none" stroke={d.color} strokeWidth={d.width * widthScale} strokeLinejoin="round" />}
          <Texts d={d} area={area} project={project} mmPerM={mmPerM} uAngle={uAngle} />
        </g>
      ))}
    </>
  );
}

/** Paper cap height of a DXF text. */
export function textHeightMm(d: LineworkSet, h: number, mmPerM: number): number {
  if (d.textMode === 'fixed') return d.textHeight;
  const drawn = (h || 2.5) * mmPerM;
  // Auto: follow the map scale, but never so small it can't be read or so big it swamps the chart.
  // Text far too small for this scale (a site plan seen whole) is left out rather than blown up.
  if (d.textMode === 'auto' && drawn < AUTO_MIN_MM / 4) return 0;
  const size = d.textMode === 'auto' ? Math.min(AUTO_MAX_MM, Math.max(AUTO_MIN_MM, drawn)) : drawn;
  return size * (d.textScale / 100);
}

function Texts({ d, area, project, mmPerM, uAngle }: { d: LineworkSet; area: Bounds; project: Project; mmPerM: number; uAngle: number }) {
  const out = [];
  for (const t of d.lw.texts) {
    if (out.length >= MAX_TEXTS) break;
    if (t.x < area.minE || t.x > area.maxE || t.y < area.minN || t.y > area.maxN) continue;
    const cap = textHeightMm(d, t.h, mmPerM);
    if (cap < MIN_TEXT_MM) continue;
    const [x, y] = project(t.x, t.y);
    const lines = t.text.split('\n');
    // Keep text readable: turn anything that would read upside down on paper the right way up.
    let ang = (((uAngle - t.rot) % 360) + 540) % 360 - 180;
    let anchor = t.align;
    if (ang > 90 || ang < -90) {
      ang += ang > 0 ? -180 : 180;
      anchor = t.align === 'start' ? 'end' : t.align === 'end' ? 'start' : 'middle';
    }
    const fs = fontSize(cap);
    out.push(
      <text
        key={out.length}
        x={x}
        y={y}
        fontSize={fs}
        fill={d.color}
        textAnchor={anchor}
        transform={`rotate(${ang.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`}
      >
        {lines.length === 1
          ? t.text
          : lines.map((l, i) => (
              <tspan key={i} x={x} dy={i === 0 ? 0 : fs * 1.2}>
                {l}
              </tspan>
            ))}
      </text>,
    );
  }
  return <>{out}</>;
}
