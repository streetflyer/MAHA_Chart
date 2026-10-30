import { SERIES_COLOURS, type Dataset, type ImportTarget } from './datasets';
import type { Linework } from './dxf';
import { newId } from './ids';
import { makeRoute } from './route';
import { guessColumns, hasHeader, isNumber, type Table } from './tables';

export interface FieldSpec {
  key: string;
  label: string;
  names: string[];
  required?: boolean;
}

/** Columns each kind of table import asks for. */
export const FIELDS: Partial<Record<ImportTarget, FieldSpec[]>> = {
  route: [
    { key: 'e', label: 'Easting', names: ['EAST', 'E', 'X'], required: true },
    { key: 'n', label: 'Northing', names: ['NORTH', 'N', 'Y'], required: true },
  ],
  plan: [
    { key: 'e', label: 'Easting', names: ['EAST', 'E', 'X'], required: true },
    { key: 'n', label: 'Northing', names: ['NORTH', 'N', 'Y'], required: true },
  ],
  long: [{ key: 'kp', label: 'KP', names: ['KP', 'CHAINAGE'], required: true }],
  trans: [{ key: 'kp', label: 'KP', names: ['KP', 'CHAINAGE'], required: true }],
  events: [
    { key: 'kp', label: 'KP', names: ['KP', 'CHAINAGE'], required: true },
    { key: 'code', label: 'Event code', names: ['CODE', 'EVENT', 'TYPE'], required: true },
    { key: 'value', label: 'Description', names: ['VALUE', 'DESC', 'COMMENT', 'REMARK'] },
  ],
  cp: [
    { key: 'kp', label: 'KP', names: ['KP', 'CHAINAGE'], required: true },
    { key: 'mv', label: 'CP reading (mV)', names: ['MV', 'CP', 'POTENTIAL', 'READING'], required: true },
  ],
};

export interface Mapping {
  header: boolean;
  cols: Record<string, number>;
  /** Long profile: the depth columns to draw. */
  series: number[];
  kpUnit: 'km' | 'm';
  /** Events: which row of the events panel. */
  rowId?: string;
  /** CP: gradient line or stab ticks. */
  cpStyle: 'line' | 'ticks';
  sheet: number;
  /** Route from DXF: layer holding the line. */
  layer?: string;
}

const SKIP_SERIES = ['KP', 'DCC', 'EAST', 'NORTH', 'X', 'Y', 'CHAINAGE', 'TIME'];

/** Best first guess at the column mapping for a table. */
export function defaultMapping(target: ImportTarget, t: Table | null): Mapping {
  const m: Mapping = { header: false, cols: {}, series: [], kpUnit: 'km', cpStyle: 'line', sheet: 0 };
  if (!t || !t.rows.length) return m;
  const rows = t.rows;
  m.header = hasHeader(rows);
  m.cols = guessColumns(rows, m.header, FIELDS[target] ?? []);
  const data = rows.slice(m.header ? 1 : 0);
  const numericCols = (rows[m.header ? 1 : 0] ?? []).map((_, i) => i).filter((i) => data.slice(0, 20).every((r) => r[i] === undefined || r[i] === '' || isNumber(r[i])) && data.slice(0, 20).some((r) => isNumber(r[i])));
  if (!m.header) {
    // Common headerless layouts.
    if (target === 'route' || target === 'plan') {
      const big = numericCols.filter((i) => Math.abs(Number(data[0]?.[i])) > 1000);
      if (big.length >= 2) m.cols = { e: big[0], n: big[1] };
      else m.cols = { e: numericCols[0] ?? 0, n: numericCols[1] ?? 1 };
    } else if (target === 'trans') m.cols = { kp: 2 };
    else if (target === 'events') m.cols = { code: 0, kp: 1, value: 2 };
    else if (target === 'cp' || target === 'long') m.cols = { kp: numericCols[0] ?? 0, mv: numericCols[1] ?? 1 };
  }
  if (target === 'long') {
    const names = m.header ? rows[0].map((c) => c.toUpperCase().replace(/[^A-Z]/g, '')) : [];
    const used = new Set<number>();
    m.series = numericCols.filter((i) => {
      if (i === m.cols.kp) return false;
      const n = names[i] ?? '';
      if (!n && m.header) return false;
      if (SKIP_SERIES.some((s) => n.startsWith(s))) return false;
      if (used.has(i)) return false;
      used.add(i);
      return true;
    });
    // A listing usually wants top/bottom of pipe and the seabed; keep the first few by default.
    const prefer = names.length ? m.series.filter((i) => /^(TOP|BOP|MEANSEABED|MEANADJ)$/.test(names[i])) : [];
    if (prefer.length) m.series = prefer;
  }
  const kpCol = m.cols.kp;
  if (kpCol !== undefined) {
    const vals = data.map((r) => Number(r[kpCol])).filter(Number.isFinite);
    const max = Math.max(...vals.map(Math.abs), 0);
    m.kpUnit = max > 500 || vals.every((v) => Number.isInteger(v)) && max > 50 ? 'm' : 'km';
  }
  return m;
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s));

/** Turn a mapped table (or DXF linework) into a dataset ready to draw. */
export function buildDataset(target: ImportTarget, name: string, t: Table | null, m: Mapping, lw?: Linework): Dataset | string {
  const id = newId();
  const base = { id, name, target, visible: true, color: target === 'route' ? '#e00000' : target === 'plan' ? '#1f6feb' : '#8a8a8a' };
  const kpScale = m.kpUnit === 'km' ? 1000 : 1;
  const data = t ? t.rows.slice(m.header ? 1 : 0) : [];
  const col = (k: string) => m.cols[k];
  const need = (FIELDS[target] ?? []).filter((f) => f.required && col(f.key) === undefined);
  if (t && need.length) return `Pick a column for ${need.map((f) => f.label).join(' and ')}.`;

  if (target === 'route') {
    if (lw) {
      const pool = lw.lines.filter((_, i) => !m.layer || lw.layers[i] === m.layer);
      if (!pool.length) return 'That layer has no lines.';
      const longest = pool.reduce((a, b) => (polyLength(b) > polyLength(a) ? b : a));
      return { ...base, kind: 'route', route: makeRoute(name, Array.from(longest)) };
    }
    const en: number[] = [];
    for (const r of data) {
      const e = num(r[col('e')]);
      const n = num(r[col('n')]);
      if (Number.isFinite(e) && Number.isFinite(n)) en.push(e, n);
    }
    if (en.length < 4) return 'Found fewer than two points with easting and northing.';
    return { ...base, kind: 'route', route: makeRoute(name, en) };
  }
  if (target === 'plan' || target === 'siteplan') {
    let work = lw;
    if (!work) {
      const en: number[] = [];
      for (const r of data) {
        const e = num(r[col('e')]);
        const n = num(r[col('n')]);
        if (Number.isFinite(e) && Number.isFinite(n)) en.push(e, n);
      }
      if (en.length < 4) return 'Found fewer than two points with easting and northing.';
      const line = new Float64Array(en);
      work = { name, lines: [line], layers: ['0'], texts: [], bounds: boundsOf(line) };
    }
    return { ...base, kind: 'linework', lw: work, width: target === 'plan' && !lw ? 0.35 : 0.18, textMode: 'auto', textScale: 100, textHeight: 1.5 };
  }
  if (target === 'long') {
    if (!m.series.length) return 'Tick at least one depth column to draw.';
    const kp: number[] = [];
    const cols: number[][] = m.series.map(() => []);
    for (const r of data) {
      const k = num(r[col('kp')]);
      if (!Number.isFinite(k)) continue;
      kp.push(k * kpScale);
      m.series.forEach((c, j) => cols[j].push(num(r[c])));
    }
    if (kp.length < 2) return 'Found fewer than two rows with a KP.';
    const header = m.header && t ? t.rows[0] : [];
    return {
      ...base,
      kind: 'long',
      kp: new Float64Array(kp),
      series: m.series.map((c, j) => ({ name: header[c] || `Column ${c + 1}`, values: new Float64Array(cols[j]), color: SERIES_COLOURS[j % SERIES_COLOURS.length] })),
    };
  }
  if (target === 'trans') {
    const kp = data.map((r) => num(r[col('kp')]) * kpScale).filter(Number.isFinite);
    if (!kp.length) return 'No KP values found.';
    return { ...base, kind: 'trans', kp: new Float64Array(kp) };
  }
  if (target === 'events') {
    const records = [];
    for (const r of data) {
      const k = num(r[col('kp')]);
      const code = (r[col('code')] ?? '').trim();
      if (!Number.isFinite(k) || !code) continue;
      records.push({ kp: k * kpScale, code, value: col('value') !== undefined ? (r[col('value')] ?? '').trim() : '' });
    }
    if (!records.length) return 'No rows with both a KP and a code.';
    return { ...base, color: '#111111', kind: 'events', records, rowId: m.rowId };
  }
  if (target === 'cp') {
    const kp: number[] = [];
    const mv: number[] = [];
    for (const r of data) {
      const k = num(r[col('kp')]);
      const v = num(r[col('mv')]);
      if (Number.isFinite(k) && Number.isFinite(v)) {
        kp.push(k * kpScale);
        mv.push(v);
      }
    }
    if (!kp.length) return 'No rows with both a KP and a reading.';
    return { ...base, color: '#2563eb', kind: 'cp', kp: new Float64Array(kp), mv: new Float64Array(mv), style: m.cpStyle };
  }
  return 'This file type is not handled here.';
}

function polyLength(l: Float64Array): number {
  let s = 0;
  for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
  return s;
}

function boundsOf(l: Float64Array) {
  const b = { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
  for (let i = 0; i < l.length; i += 2) {
    b.minE = Math.min(b.minE, l[i]);
    b.maxE = Math.max(b.maxE, l[i]);
    b.minN = Math.min(b.minN, l[i + 1]);
    b.maxN = Math.max(b.maxN, l[i + 1]);
  }
  return b;
}

/** Layers of a DXF, longest line first, so the route layer is the obvious pick. */
export function dxfLayers(lw: Linework): { layer: string; longest: number }[] {
  const by = new Map<string, number>();
  lw.lines.forEach((l, i) => by.set(lw.layers[i], Math.max(by.get(lw.layers[i]) ?? 0, polyLength(l))));
  return [...by.entries()].map(([layer, longest]) => ({ layer, longest })).sort((a, b) => b.longest - a.longest);
}
