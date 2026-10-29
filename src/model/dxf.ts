import { robustBounds, type Bounds } from './route';

/** Linework read from a DXF for use as a background (key plan, plan view). */
export interface Linework {
  name: string;
  /** Each polyline as interleaved x, y. */
  lines: Float64Array[];
  /** Extent of the bulk of the drawing, ignoring stray far-off entities. */
  bounds: Bounds;
}

/**
 * Read LINE, LWPOLYLINE, POLYLINE and CIRCLE/ARC outlines from the ENTITIES section
 * of an ASCII DXF. Blocks, text and hatches are left out; it is a background only.
 */
export function parseDxfLinework(text: string, name: string): Linework | null {
  const rows = text.split(/\r?\n/);
  const lines: Float64Array[] = [];
  let i = 0;
  // Skip to ENTITIES.
  for (; i < rows.length - 1; i += 2) {
    if (rows[i].trim() === '2' && rows[i + 1].trim() === 'ENTITIES') {
      i += 2;
      break;
    }
  }
  let type = '';
  let pts: number[] = [];
  let x = NaN;
  let closed = false;
  let poly: number[] | null = null;
  let polyClosed = false;
  const g: Record<string, number> = {};

  const push = (p: number[], close: boolean) => {
    if (p.length < 4) return;
    if (close) p.push(p[0], p[1]);
    lines.push(new Float64Array(p));
  };
  const finish = () => {
    if (type === 'LINE' && '10' in g && '11' in g) push([g['10'], g['20'], g['11'], g['21']], false);
    else if (type === 'LWPOLYLINE') push(pts, closed);
    else if (type === 'VERTEX' && poly && '10' in g) poly.push(g['10'], g['20']);
    else if ((type === 'CIRCLE' || type === 'ARC') && '40' in g) {
      const a0 = type === 'ARC' ? (g['50'] * Math.PI) / 180 : 0;
      let a1 = type === 'ARC' ? (g['51'] * Math.PI) / 180 : Math.PI * 2;
      if (a1 <= a0) a1 += Math.PI * 2;
      const p: number[] = [];
      const n = 24;
      for (let k = 0; k <= n; k++) {
        const a = a0 + ((a1 - a0) * k) / n;
        p.push(g['10'] + g['40'] * Math.cos(a), g['20'] + g['40'] * Math.sin(a));
      }
      push(p, false);
    }
  };

  for (; i < rows.length - 1; i += 2) {
    const code = rows[i].trim();
    const value = rows[i + 1].trim();
    if (code === '0') {
      finish();
      if (value === 'ENDSEC') break;
      if (value === 'SEQEND' && poly) {
        push(poly, polyClosed);
        poly = null;
      }
      type = value;
      pts = [];
      closed = false;
      x = NaN;
      for (const k in g) delete g[k];
      if (type === 'POLYLINE') poly = [];
      continue;
    }
    if (type === 'LWPOLYLINE') {
      if (code === '10') x = parseFloat(value);
      else if (code === '20') pts.push(x, parseFloat(value));
      else if (code === '70') closed = (parseInt(value, 10) & 1) === 1;
    } else {
      if (type === 'POLYLINE' && code === '70') polyClosed = (parseInt(value, 10) & 1) === 1;
      if (code === '10' || code === '20' || code === '11' || code === '21' || code === '40' || code === '50' || code === '51') g[code] = parseFloat(value);
    }
  }
  if (!lines.length) return null;
  return { name, lines, bounds: robustBounds(lines) };
}
