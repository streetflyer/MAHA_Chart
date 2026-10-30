/** Reading tabular survey files: CSV/TXT listings and Excel .xlsx workbooks. */

export interface Table {
  /** Sheet name for workbooks, file name otherwise. */
  name: string;
  rows: string[][];
}

/** Split a CSV / TXT listing. Picks the delimiter that gives the most consistent columns. */
export function parseDelimited(text: string, name = ''): Table {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const sample = lines.slice(0, 50);
  const candidates: (string | RegExp)[] = [',', '\t', ';', /\s+/];
  let best: string | RegExp = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((l) => splitLine(l, d).length);
    const mode = counts.sort((a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length)[0] ?? 1;
    const score = mode > 1 ? counts.filter((c) => c === mode).length * 100 + mode : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return { name, rows: lines.map((l) => splitLine(l, best)) };
}

function splitLine(line: string, d: string | RegExp): string[] {
  if (d instanceof RegExp) return line.trim().split(d);
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === d) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export const isNumber = (s: string | undefined) => s !== undefined && s.trim() !== '' && Number.isFinite(Number(s));

/** True when the first row looks like column names rather than data. */
export function hasHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0].filter((c) => c !== '');
  const second = rows[1].filter((c) => c !== '');
  return first.filter(isNumber).length < second.filter(isNumber).length;
}

/**
 * Guess which column holds each wanted field from header names (KP, EASTING, ...)
 * or, without a header, from the order of numeric columns.
 */
export function guessColumns(rows: string[][], header: boolean, fields: { key: string; names: string[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (header && rows[0]) {
    const h = rows[0].map((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    for (const f of fields) {
      const i = h.findIndex((c) => f.names.some((n) => c === n || c.startsWith(n)));
      if (i >= 0 && !Object.values(out).includes(i)) out[f.key] = i;
    }
  }
  return out;
}

// --- .xlsx (a zip of XML parts) -------------------------------------------------

/** Read every sheet of an .xlsx workbook. Uses the browser's own deflate, so no library is needed. */
export async function readXlsx(data: ArrayBuffer): Promise<Table[]> {
  const files = await unzip(data);
  const text = (p: string) => (files.has(p) ? new TextDecoder().decode(files.get(p)) : '');
  const shared: string[] = [];
  for (const si of text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join(''));
  }
  const rels = new Map<string, string>();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const tables: Table[] = [];
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlText(attr(m[0], 'name') ?? 'Sheet');
    const rid = attr(m[0], 'r:id');
    const path = 'xl/' + (rid && rels.get(rid) ? rels.get(rid) : `worksheets/sheet${tables.length + 1}.xml`);
    tables.push({ name, rows: sheetRows(text(path), shared) });
  }
  return tables;
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r');
      const col = ref ? colIndex(ref) : row.length;
      const type = attr(c[1], 't');
      const body = c[2] ?? '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('');
      else if (v !== undefined) value = xmlText(v);
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`))?.[1];
}

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

async function unzip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(data);
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not an .xlsx file (no zip directory found). Older .xls files: save as .xlsx or .csv first.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < count; k++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(data, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(data, start, size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflate(raw));
  }
  return out;
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
