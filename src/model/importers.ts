import { type CrossProfile, VW_RAW, profileFromRow } from './crossProfile';
import { DEFAULT_FONT, SERIES_COLOURS, newLink, type Dataset, type EventLink, type EventRecord, type ImportTarget } from './datasets';
import type { Linework } from './dxf';
import { newId } from './ids';
import { makeRoute } from './route';
import { findHeaderRow, guessColumns, isNumber, type Table } from './tables';

export interface FieldSpec {
  key: string;
  label: string;
  names: string[];
  required?: boolean;
  /** Two columns averaged into one line; the second is stored as `${key}2`. */
  pair?: { names2: string[]; hint: string };
}

const KP_NAMES = ['KP', 'GRIDKP', 'CHAINAGE'];
const EN = (): FieldSpec[] => [
  { key: 'e', label: 'Easting', names: ['EAST', 'E', 'X'], required: true },
  { key: 'n', label: 'Northing', names: ['NORTH', 'N', 'Y'], required: true },
];

/** Columns each kind of table import asks for. */
export const FIELDS: Partial<Record<ImportTarget, FieldSpec[]>> = {
  route: EN(),
  asbuilt: EN(),
  plan: EN(),
  long: [
    { key: 'kp', label: 'KP', names: KP_NAMES, required: true },
    { key: 'top', label: 'Top of pipe (TOP)', names: ['TOP'] },
    { key: 'bop', label: 'Bottom of pipe (BOP)', names: ['BOP'] },
    { key: 'adj', label: 'Mean adjacent seabed', names: ['PORTADJ', 'PTADJ'], pair: { names2: ['STBADJ', 'STBDADJ', 'STARBOARDADJ', 'SBADJ'], hint: 'Pick two columns (port and starboard adjacent); they are averaged.' } },
    { key: 'far', label: 'Mean far seabed', names: ['PORTMSBL', 'PORTFAR', 'PTMSBL'], pair: { names2: ['STBDMSBL', 'STBMSBL', 'STBDFAR', 'STBFAR', 'SBMSBL'], hint: 'Pick two columns (port and starboard far seabed); they are averaged.' } },
  ],
  trans: [
    { key: 'kp', label: 'KP', names: KP_NAMES, required: true },
    { key: 'diameter', label: 'Pipe diameter', names: ['DIAM'], required: true },
    { key: 'toPipe', label: 'Distance to pipe', names: ['DISTANCETOPIPE'], required: true },
    { key: 'pipeDz', label: 'Delta depth to pipe', names: ['DELTADEPTH'], required: true },
    { key: 'count', label: 'Number of raw points', names: ['NUMBEROF'], required: true },
    { key: 'first', label: 'First raw point dx', names: ['RAWPOINT'], required: true },
  ],
  events: [
    { key: 'code', label: 'Event code', names: ['CODE', 'EVENTCODE', 'EVENTTYPE'], required: true },
    { key: 'kp', label: 'KP', names: KP_NAMES, required: true },
    { key: 'value', label: 'Description', names: ['VALUE', 'DESC', 'EVENTDESC', 'COMMENT', 'REMARK'] },
  ],
  cp: [
    { key: 'kp', label: 'KP', names: KP_NAMES, required: true },
    { key: 'mv', label: 'CP reading (mV)', names: ['MV', 'CP', 'POTENTIAL', 'READING'], required: true },
  ],
};

/** Freespan / burial listings: one row per span, start and end KP. */
/** Mean of the finite values; NaN when there are none (a gap in the line). */
export function meanOf(v: number[]): number {
  let sum = 0;
  let n = 0;
  for (const x of v)
    if (Number.isFinite(x)) {
      sum += x;
      n++;
    }
  return n ? sum / n : NaN;
}

export const SPAN_FIELDS: FieldSpec[] = [
  { key: 'start', label: 'Start KP', names: ['STARTGRIDKP', 'STARTKP', 'START', 'KPSTART', 'FROM'], required: true },
  { key: 'end', label: 'End KP', names: ['ENDGRIDKP', 'ENDKP', 'END', 'KPEND', 'TO'], required: true },
  { key: 'length', label: 'Length', names: ['LENGTH'] },
  { key: 'height', label: 'Height', names: ['HEIGHT', 'GAP', 'DEPTH'] },
];

export const fieldsFor = (target: ImportTarget, m: Pick<Mapping, 'span'>) => (target === 'events' && m.span ? SPAN_FIELDS : (FIELDS[target] ?? []));

/** Span sheets are named for what they hold; pick the codes to match. */
export const spanCodes = (sheetName: string): [string, string] => (/BURI/i.test(sheetName) ? ['FS.BS', 'FS.BE'] : ['FS.FS', 'FS.FE']);

export interface Mapping {
  /** Rows above the column names (titles in a workbook). */
  skip: number;
  header: boolean;
  cols: Record<string, number>;
  /** Long profile: extra (seabed) columns to draw as lines. */
  series: number[];
  kpUnit: 'km' | 'm';
  /** CP: gradient line or stab ticks. */
  cpStyle: 'line' | 'ticks';
  sheet: number;
  /** Route from DXF: layer holding the line. */
  layer?: string;
  /** Events typed in by hand (pipe spec, survey dates...). */
  extra: EventRecord[];
  /** Events: rows are spans (start KP, end KP, length, height) written as these two codes. */
  span?: { start: string; end: string };
  /** Events: code pairs drawn as linked events. */
  links: EventLink[];
}

/** Long profile lines made by averaging two columns, in drawing order. */
export const MEAN_LINES = [
  { key: 'adj', name: 'Mean Adjacent Seabed', color: '#16a34a' },
  { key: 'far', name: 'Mean Far Seabed', color: '#2563eb' },
];

const SKIP_SERIES = ['KP', 'GRIDKP', 'DCC', 'EAST', 'NORTH', 'X', 'Y', 'CHAINAGE', 'TIME', 'TOP', 'BOP'];

/** Header names of a table as mapped, upper case letters only. */
export const headerOf = (t: Table | null, m: Pick<Mapping, 'header' | 'skip'>) => (t && m.header ? (t.rows[m.skip] ?? []) : []);
export const dataRows = (t: Table | null, m: Pick<Mapping, 'header' | 'skip'>) => (t ? t.rows.slice(m.skip + (m.header ? 1 : 0)) : []);

/** Best first guess at the column mapping for a table. */
export function defaultMapping(target: ImportTarget, t: Table | null): Mapping {
  const m: Mapping = { skip: 0, header: false, cols: {}, series: [], kpUnit: 'km', cpStyle: 'ticks', sheet: 0, extra: [], links: [] };
  if (!t || !t.rows.length) {
    if (target === 'trans') m.cols = { ...VW_RAW };
    return m;
  }
  const h = findHeaderRow(t.rows);
  m.header = h >= 0;
  m.skip = Math.max(0, h);
  const rows = t.rows.slice(m.skip);
  // A listing of spans (start and end KP per row) is a freespan / burial sheet.
  if (target === 'events' && m.header) {
    const names = rows[0].map((c) => c.toUpperCase().replace(/[^A-Z]/g, ''));
    if (names.some((n) => n.startsWith('START')) && names.some((n) => n.startsWith('END'))) {
      const [a, b] = spanCodes(t.name);
      m.span = { start: a, end: b };
      m.links = [newLink(a, b)];
    }
  }
  m.cols = guessColumns(rows, m.header, fieldsFor(target, m));
  const data = dataRows(t, m);
  const width = Math.max(...data.slice(0, 20).map((r) => r.length), 0);
  const numericCols = Array.from({ length: width }, (_, i) => i).filter(
    (i) => data.slice(0, 20).every((r) => r[i] === undefined || r[i] === '' || isNumber(r[i])) && data.slice(0, 20).some((r) => isNumber(r[i])),
  );
  if (!m.header) {
    // Common headerless layouts.
    if (target === 'route' || target === 'plan' || target === 'asbuilt') {
      const big = numericCols.filter((i) => Math.abs(Number(data[0]?.[i])) > 1000);
      m.cols = big.length >= 2 ? { e: big[0], n: big[1] } : { e: numericCols[0] ?? 0, n: numericCols[1] ?? 1 };
    } else if (target === 'trans') m.cols = { ...VW_RAW };
    else if (target === 'events') m.cols = { code: 0, kp: 1, value: 2 };
    else if (target === 'cp') m.cols = { kp: numericCols[0] ?? 0, mv: numericCols[1] ?? 1 };
    else if (target === 'long') m.cols = { kp: numericCols[0] ?? 0 };
  }
  if (target === 'trans') m.cols = { ...VW_RAW, ...m.cols };
  if (target === 'long') {
    const names = headerOf(t, m).map((c) => c.toUpperCase().replace(/[^A-Z]/g, ''));
    const used = new Set(Object.values(m.cols));
    const cand = numericCols.filter((i) => !used.has(i) && !SKIP_SERIES.some((s) => (names[i] ?? '').startsWith(s)));
    // A listing wants the seabed lines; the reference charts show mean adjacent and mean seabed.
    // When the port/starboard columns are there, the averaged lines replace the listing's own means.
    const hasPairs = MEAN_LINES.some((l) => m.cols[l.key] !== undefined && m.cols[l.key + '2'] !== undefined);
    const prefer = hasPairs ? [] : cand.filter((i) => /^MEAN(ADJ|SEABED)/.test(names[i] ?? ''));
    m.series = prefer.slice(0, 2);
    // Half a pair is no use: drop it rather than average one column with nothing.
    for (const l of MEAN_LINES) if ((m.cols[l.key] === undefined) !== (m.cols[l.key + '2'] === undefined)) delete m.cols[l.key], delete m.cols[l.key + '2'];
  }
  const kpCol = m.cols.kp;
  if (kpCol !== undefined) {
    const vals = data.slice(0, 2000).map((r) => Number(r[kpCol])).filter(Number.isFinite);
    const max = Math.max(...vals.map(Math.abs), 0);
    m.kpUnit = max > 500 || (vals.every((v) => Number.isInteger(v)) && max > 50) ? 'm' : 'km';
  }
  return m;
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s));

export const DEFAULT_COLOURS: Partial<Record<ImportTarget, string>> = {
  route: '#e00000',
  asbuilt: '#16a34a',
  plan: '#1f6feb',
  siteplan: '#8a8a8a',
  events: '#111111',
  cp: '#111111',
  trans: '#222222',
  long: '#e00000',
};

/** Turn a mapped table (or DXF linework) into a dataset ready to draw. */
export function buildDataset(target: ImportTarget, name: string, t: Table | null, m: Mapping, lw?: Linework): Dataset | string {
  const id = newId();
  const base = { id, name, target, visible: true, color: DEFAULT_COLOURS[target] ?? '#8a8a8a' };
  const kpScale = m.kpUnit === 'km' ? 1000 : 1;
  const data = dataRows(t, m);
  const col = (k: string) => m.cols[k];
  const need = fieldsFor(target, m).filter((f) => f.required && col(f.key) === undefined);
  if (t && need.length) return `Pick a column for ${need.map((f) => f.label).join(' and ')}.`;

  if (target === 'route') {
    if (lw) {
      const pool = lw.lines.filter((_, i) => !m.layer || lw.layers[i] === m.layer);
      if (!pool.length) return 'That layer has no lines.';
      const longest = pool.reduce((a, b) => (polyLength(b) > polyLength(a) ? b : a));
      return { ...base, kind: 'route', route: makeRoute(name, Array.from(longest)), width: 0.35 };
    }
    const en = eastNorth(data, col('e'), col('n'));
    if (en.length < 4) return 'Found fewer than two points with easting and northing.';
    return { ...base, kind: 'route', route: makeRoute(name, en), width: 0.35 };
  }
  if (target === 'plan' || target === 'siteplan' || target === 'asbuilt') {
    let work = lw;
    if (!work) {
      const en = eastNorth(data, col('e'), col('n'));
      if (en.length < 4) return 'Found fewer than two points with easting and northing.';
      const line = new Float64Array(en);
      work = { name, lines: [line], layers: ['0'], texts: [], bounds: boundsOf(line) };
    }
    const width = target === 'asbuilt' ? 0.35 : 0.18;
    return { ...base, kind: 'linework', lw: work, width, textMode: 'auto', textScale: 100, textHeight: 1.5 };
  }
  if (target === 'long') {
    const header = headerOf(t, m);
    // Each drawn line reads one column, or the mean of two.
    const sources: { name: string; cols: number[]; color: string; role: 'top' | 'bop' | 'line' }[] = [];
    if (col('top') !== undefined) sources.push({ name: header[col('top')!] || 'TOP', cols: [col('top')!], color: '#e00000', role: 'top' });
    if (col('bop') !== undefined) sources.push({ name: header[col('bop')!] || 'BOP', cols: [col('bop')!], color: '#e00000', role: 'bop' });
    for (const l of MEAN_LINES) {
      const pair = [col(l.key), col(l.key + '2')].filter((c): c is number => c !== undefined);
      if (pair.length) sources.push({ name: l.name, cols: pair, color: l.color, role: 'line' });
    }
    let extra = 0;
    for (const c of m.series) sources.push({ name: header[c] || `Column ${c + 1}`, cols: [c], color: SERIES_COLOURS[(2 + extra++) % SERIES_COLOURS.length], role: 'line' });
    if (!sources.length) return 'Pick the top and bottom of pipe columns, or tick a column to draw.';
    const kp: number[] = [];
    const vals: number[][] = sources.map(() => []);
    for (const r of data) {
      const k = num(r[col('kp')]);
      if (!Number.isFinite(k)) continue;
      kp.push(k * kpScale);
      sources.forEach((src, j) => vals[j].push(meanOf(src.cols.map((c) => num(r[c])))));
    }
    if (kp.length < 2) return 'Found fewer than two rows with a KP.';
    const series = sources.map((src, j) => ({ name: src.name, values: new Float64Array(vals[j]), color: src.color }));
    const top = sources.findIndex((x) => x.role === 'top');
    const bop = sources.findIndex((x) => x.role === 'bop');
    return { ...base, kind: 'long', kp: new Float64Array(kp), series, top: top >= 0 ? top : undefined, bop: bop >= 0 ? bop : undefined, fill: '#6b6b6b' };
  }
  if (target === 'trans') {
    const c = { ...VW_RAW, ...m.cols };
    const profiles: CrossProfile[] = [];
    for (const r of data) {
      const p = profileFromRow(r, c, kpScale);
      if (p) profiles.push(p);
    }
    return transDataset(base, profiles);
  }
  if (target === 'events') {
    const records: EventRecord[] = [];
    if (m.span) {
      for (const r of data) {
        const a = num(r[col('start')]);
        const b = num(r[col('end')]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const length = col('length') !== undefined ? num(r[col('length')]) : NaN;
        const height = col('height') !== undefined ? num(r[col('height')]) : NaN;
        records.push({ kp: a * kpScale, code: m.span.start, value: '', length: Number.isFinite(length) ? length : undefined, height: Number.isFinite(height) ? height : undefined });
        records.push({ kp: b * kpScale, code: m.span.end, value: '' });
      }
    }
    for (const r of m.span ? [] : data) {
      const k = num(r[col('kp')]);
      const code = (r[col('code')] ?? '').trim();
      if (!Number.isFinite(k) || !code) continue;
      records.push({ kp: k * kpScale, code, value: col('value') !== undefined ? (r[col('value')] ?? '').trim() : '' });
    }
    records.push(...m.extra.filter((e) => e.code.trim() && Number.isFinite(e.kp)));
    if (!records.length) return 'No rows with both a KP and a code.';
    return { ...base, kind: 'events', records, labels: true, font: { ...DEFAULT_FONT }, links: m.links };
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
    const order = kp.map((_, i) => i).sort((a, b) => kp[a] - kp[b]);
    return { ...base, kind: 'cp', kp: new Float64Array(order.map((i) => kp[i])), mv: new Float64Array(order.map((i) => mv[i])), style: m.cpStyle, font: { ...DEFAULT_FONT }, symbol: 'circle' };
  }
  return 'This file type is not handled here.';
}

export function transDataset(base: { id: string; name: string; target: ImportTarget; visible: boolean; color: string }, profiles: CrossProfile[]): Dataset | string {
  if (!profiles.length) return 'No cross profiles found: check the KP and raw point columns.';
  profiles.sort((a, b) => a.kp - b.kp);
  return { ...base, kind: 'trans', kp: new Float64Array(profiles.map((p) => p.kp)), profiles, every: 0, pipeColor: '#e00000', pipeFill: '#bdbdbd' };
}

function eastNorth(data: string[][], ce: number, cn: number): number[] {
  const en: number[] = [];
  for (const r of data) {
    const e = num(r[ce]);
    const n = num(r[cn]);
    if (Number.isFinite(e) && Number.isFinite(n)) en.push(e, n);
  }
  return en;
}

function polyLength(l: Float64Array): number {
  let s = 0;
  for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
  return s;
}

export function boundsOf(l: ArrayLike<number>) {
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

// --- Saved column mappings ("mapping templates") ----------------------------------

export interface MappingPreset {
  name: string;
  target: ImportTarget;
  skip: number;
  header: boolean;
  kpUnit: Mapping['kpUnit'];
  cpStyle: Mapping['cpStyle'];
  /** Field to column: by header name when the file has one, else by number. */
  cols: Record<string, string | number>;
  series: (string | number)[];
  extra: EventRecord[];
  sheetName?: string;
  span?: Mapping['span'];
  links?: EventLink[];
}

const PRESET_KEY = 'maha.mappingPresets';

export function loadPresets(): MappingPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') as MappingPreset[];
  } catch {
    return [];
  }
}

export function savePresets(list: MappingPreset[]) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch {
    // Private windows: presets just don't persist.
  }
}

export function toPreset(name: string, target: ImportTarget, t: Table | null, m: Mapping): MappingPreset {
  const h = headerOf(t, m);
  const ref = (c: number) => (h[c] ? h[c] : c);
  return {
    name,
    target,
    skip: m.skip,
    header: m.header,
    kpUnit: m.kpUnit,
    cpStyle: m.cpStyle,
    cols: Object.fromEntries(Object.entries(m.cols).map(([k, c]) => [k, ref(c)])),
    series: m.series.map(ref),
    extra: m.extra,
    sheetName: t?.name,
    span: m.span,
    links: m.links,
  };
}

/** Apply a saved mapping to a new file, finding columns by name where it can. */
export function fromPreset(p: MappingPreset, tables: Table[] | undefined, current: Mapping): Mapping {
  const sheet = Math.max(0, tables?.findIndex((t) => t.name === p.sheetName) ?? -1);
  const useSheet = tables && p.sheetName && tables.some((t) => t.name === p.sheetName) ? sheet : current.sheet;
  const t = tables?.[useSheet] ?? null;
  const m: Mapping = { ...current, sheet: useSheet, skip: p.skip, header: p.header, kpUnit: p.kpUnit, cpStyle: p.cpStyle, extra: p.extra ?? [], span: p.span, links: p.links ?? [] };
  const h = headerOf(t, m).map((x) => x.trim().toUpperCase());
  const find = (ref: string | number) => (typeof ref === 'number' ? ref : h.indexOf(ref.trim().toUpperCase()));
  m.cols = {};
  for (const [k, ref] of Object.entries(p.cols)) {
    const i = find(ref);
    if (i >= 0) m.cols[k] = i;
  }
  m.series = p.series.map(find).filter((i) => i >= 0);
  return m;
}
