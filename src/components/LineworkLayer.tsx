import { useMemo } from 'react';
import { DEFAULT_LINEWORK_LOOK, type Dataset, type LineworkLook } from '../model/datasets';
import type { DxfText } from '../model/dxf';
import type { Bounds } from '../model/route';
import { linesPath } from './linework';
import { fontSize } from './svgText';

export type LineworkSet = Extract<Dataset, { kind: 'linework' }>;
type Project = (e: number, n: number) => [number, number];

/** Texts smaller than this on paper can't be seen even zoomed right in. */
const MIN_TEXT_MM = 0.002;
const MAX_TEXTS = 20000;
const AUTO_MIN_MM = 1.2;
const AUTO_MAX_MM = 3;

/** A drawing's look settings with defaults filled in. */
export const lookOf = (d: LineworkSet): LineworkLook => ({ ...DEFAULT_LINEWORK_LOOK, ...d, layers: d.layers ?? {} });

/** Is this layer drawn? The user's choice wins; otherwise the drawing's own on/off. */
export function layerShown(d: LineworkSet, layer: string): boolean {
  const o = d.layers?.[layer];
  if (o?.hidden !== undefined) return !o.hidden;
  return !d.lw.layerInfo.find((l) => l.name === layer)?.off;
}

/** The colour a layer is drawn in: the user's, else the drawing's (when kept), else the data colour. */
export function layerColour(d: LineworkSet, layer: string): string {
  const o = d.layers?.[layer]?.color;
  if (o) return o;
  if (d.drawingColours === false) return d.color;
  return d.lw.layerInfo.find((l) => l.name === layer)?.color || d.color;
}

/** Colour of one polyline (its own colour in the drawing unless the user recoloured its layer). */
export function lineColour(d: LineworkSet, i: number): string {
  const layer = d.lw.layers[i];
  if (d.layers?.[layer]?.color) return d.layers[layer].color!;
  if (d.drawingColours === false) return d.color;
  return d.lw.colors[i] || layerColour(d, layer);
}

export function textColour(d: LineworkSet, t: DxfText): string {
  if (d.textColor) return d.textColor;
  const o = d.layers?.[t.layer]?.color;
  if (o) return o;
  if (d.drawingColours === false) return d.color;
  return t.color || layerColour(d, t.layer);
}

/** Polylines of a drawing grouped by colour, as one path per colour; `skip` leaves out whole objects. */
export function colourPaths(d: LineworkSet, area: Bounds, project: Project, skip?: Set<number>): { color: string; d: string }[] {
  const byColour = new Map<string, Float64Array[]>();
  const lines = d.lw.lines;
  for (let i = 0; i < lines.length; i++) {
    if (!layerShown(d, d.lw.layers[i])) continue;
    if (skip?.has(d.lw.groups[i])) continue;
    const c = lineColour(d, i);
    let list = byColour.get(c);
    if (!list) byColour.set(c, (list = []));
    list.push(lines[i]);
  }
  const out: { color: string; d: string }[] = [];
  for (const [color, list] of byColour) {
    // Every vertex is kept (to 0.001 mm on paper) so small symbols keep their shape.
    const path = linesPath(list, area, project, 0.001);
    if (path) out.push({ color, d: path });
  }
  return out;
}

/**
 * Imported drawings (DXF, DWG, .dig, listings) in a map panel: lines in the
 * drawing's own colours (or the data colour) and the width set for the data, and
 * the drawing's texts either scaled with the map or at a fixed paper height.
 */
export function LineworkLayer({
  sets,
  area,
  project,
  mmPerM,
  uAngle = 0,
  widthScale = 1,
  skip,
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
  /** Objects being edited (drawn elsewhere), by dataset id. */
  skip?: Map<string, Set<number>>;
}) {
  const paths = useMemo(() => sets.map((d) => colourPaths(d, area, project, skip?.get(d.id))), [sets, area, project, skip]);
  return (
    <>
      {sets.map((d, i) => (
        <g key={d.id}>
          {paths[i].map((p) => (
            <path key={p.color} d={p.d} fill="none" stroke={p.color} strokeWidth={d.width * widthScale} strokeLinejoin="round" />
          ))}
          <Texts d={d} area={area} project={project} mmPerM={mmPerM} uAngle={uAngle} skip={skip?.get(d.id)} />
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

/** Where and how one text is drawn on paper; null when it is hidden or too small. */
export function placeText(d: LineworkSet, t: DxfText, project: Project, mmPerM: number, uAngle: number) {
  if (!layerShown(d, t.layer)) return null;
  const cap = textHeightMm(d, t.h, mmPerM);
  if (cap < MIN_TEXT_MM) return null;
  const [x, y] = project(t.x, t.y);
  // Paper turns clockwise as the grid turns anticlockwise; the user's turn is anticlockwise on paper.
  let ang = (((uAngle - t.rot - (d.textRotation ?? 0)) % 360) + 540) % 360 - 180;
  let anchor = t.align;
  // Keep text readable: turn anything that would read upside down on paper the right way up.
  if (d.textUpright !== false && (ang > 90 || ang < -90)) {
    ang += ang > 0 ? -180 : 180;
    anchor = t.align === 'start' ? 'end' : t.align === 'end' ? 'start' : 'middle';
  }
  return { x, y, cap, ang, anchor };
}

function Texts({ d, area, project, mmPerM, uAngle, skip }: { d: LineworkSet; area: Bounds; project: Project; mmPerM: number; uAngle: number; skip?: Set<number> }) {
  const out = [];
  for (const t of d.lw.texts) {
    if (out.length >= MAX_TEXTS) break;
    if (t.x < area.minE || t.x > area.maxE || t.y < area.minN || t.y > area.maxN) continue;
    if (skip?.has(t.group)) continue;
    const pl = placeText(d, t, project, mmPerM, uAngle);
    if (!pl) continue;
    out.push(<TextNode key={out.length} d={d} t={t} pl={pl} />);
  }
  return <>{out}</>;
}

/** One drawing text, in the data's text look (or its own, if it was edited). */
export function TextNode({ d, t, pl }: { d: LineworkSet; t: DxfText; pl: NonNullable<ReturnType<typeof placeText>> }) {
  const { x, y, ang, anchor } = pl;
  const lines = t.text.split('\n');
  const fs = fontSize(pl.cap);
  const family = t.font || d.textFamily;
  const bold = t.bold ?? d.textBold;
  const italic = t.italic ?? d.textItalic;
  return (
    <text
      x={x}
      y={y}
      fontSize={fs}
      fill={textColour(d, t)}
      textAnchor={anchor}
      fontFamily={family ? `${family}, Arial, sans-serif` : undefined}
      fontWeight={bold ? 700 : undefined}
      fontStyle={italic ? 'italic' : undefined}
      transform={`rotate(${ang.toFixed(2)} ${x.toFixed(4)} ${y.toFixed(4)})`}
    >
      {lines.length === 1
        ? t.text
        : lines.map((l, i) => (
            <tspan key={i} x={x} dy={i === 0 ? 0 : fs * 1.2}>
              {l}
            </tspan>
          ))}
    </text>
  );
}
