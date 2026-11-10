import type { EventLink, EventRecord } from './datasets';
import type { EventRow } from './types';

/**
 * Engineering events go into the panel's rows by event code. Each row lists the
 * codes it takes, comma separated, with `*` as a wildcard (`AN.*`, `D.*, OT.OU`).
 */
export function codeMatcher(patterns: string): (code: string) => boolean {
  const res = patterns
    .split(/[,;\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
  return (code) => res.some((re) => re.test(code.toUpperCase()));
}

/** Codes a row takes when nobody has set them, guessed from its label (Visual Edit coding). */
export function defaultRowCodes(label: string): string {
  const l = label.toUpperCase();
  if (/GRID KP|^KP\b/.test(l)) return '';
  if (/ANODE TYPE/.test(l)) return 'PP.ST, PP.ET';
  if (/COATING/.test(l)) return 'PP.SW, PP.EW';
  if (/DRY WEIGHT|^WEIGHT$/.test(l)) return 'PP.SZ, PP.EZ';
  if (/PIPE SIZE|UMBILICAL/.test(l)) return 'PP.SN, PP.EN';
  if (/ANODE/.test(l)) return 'AN.*';
  if (/FIELD ?JOINT/.test(l)) return 'FJ.*';
  if (/PIPELINE FEATURE|ENGINEERING FEATURE/.test(l)) return 'PF.*, FJ.*';
  if (/FITTING|SUPPORT/.test(l)) return 'SF.*, R.*';
  if (/FREESPAN|FREE SPAN/.test(l)) return 'FS.*';
  if (/BURIAL|EXPOSURE/.test(l)) return 'B.*';
  if (/DEBRIS|ANOMAL|DAMAGE/.test(l)) return 'D.*, OT.OU';
  if (/VIDEO/.test(l)) return 'OT.VS, OT.VE';
  return '';
}

export const rowCodes = (r: EventRow) => r.codes ?? defaultRowCodes(r.label);

/** True for the row that carries the KP labels instead of events. */
export const isKpRow = (r: EventRow) => /GRID KP|^KP\b/i.test(r.label);

export interface EventMark {
  kp: number;
  code: string;
  value: string;
}

export interface EventRange extends EventMark {
  /** KP in metres where it ends; Infinity when it runs to the end of the line. */
  end: number;
}

/** A start/end pair the user linked (freespan, burial), with its length and height. */
export interface LinkedEvent {
  kp: number;
  end: number;
  startCode: string;
  endCode: string;
  /** Metres: from the listing when it had a length column, else the KP difference. */
  length: number;
  height?: number;
  link: EventLink;
}

/**
 * Start/end codes pair up when one has an S where the other has an E
 * (PP.SN/PP.EN, OT.VS/OT.VE). A start with no matching end runs to the end of the line.
 */
export function splitRanges(all: EventRecord[], links: EventLink[] = []): { points: EventMark[]; ranges: EventRange[]; linked: LinkedEvent[] } {
  const linkCodes = new Set(links.flatMap((l) => [l.start.toUpperCase(), l.end.toUpperCase()]));
  const linked = links.flatMap((l) => linkPairs(all, l));
  const records = all.filter((r) => !linkCodes.has(r.code.toUpperCase()));
  const codes = new Set(records.map((r) => r.code.toUpperCase()));
  const endOf = new Map<string, string>();
  for (const c of codes) {
    const [g, sub] = c.split('.');
    if (!sub) continue;
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] !== 'S') continue;
      const e = `${g}.${sub.slice(0, i)}E${sub.slice(i + 1)}`;
      if (codes.has(e)) endOf.set(c, e);
    }
  }
  const isEnd = new Set(endOf.values());
  const sorted = [...records].sort((a, b) => a.kp - b.kp);
  const points: EventMark[] = [];
  const ranges: EventRange[] = [];
  const used = new Set<EventRecord>();
  for (const r of sorted) {
    const c = r.code.toUpperCase();
    if (isEnd.has(c)) continue;
    const e = endOf.get(c) ?? (/^PP\.S/.test(c) ? '' : undefined);
    if (e === undefined) {
      points.push(r);
      continue;
    }
    const close = e ? sorted.find((x) => !used.has(x) && x.code.toUpperCase() === e && x.kp >= r.kp) : undefined;
    if (close) used.add(close);
    ranges.push({ ...r, end: close ? close.kp : Infinity });
  }
  return { points, ranges, linked };
}

/** Each start code joined to the next end code after it. */
export function linkPairs(records: EventRecord[], link: EventLink): LinkedEvent[] {
  const s = link.start.toUpperCase();
  const e = link.end.toUpperCase();
  const starts = records.filter((r) => r.code.toUpperCase() === s).sort((a, b) => a.kp - b.kp);
  const ends = records.filter((r) => r.code.toUpperCase() === e).sort((a, b) => a.kp - b.kp);
  const out: LinkedEvent[] = [];
  let j = 0;
  for (const r of starts) {
    while (j < ends.length && ends[j].kp < r.kp) j++;
    if (j >= ends.length) break;
    const end = ends[j++].kp;
    out.push({ kp: r.kp, end, startCode: r.code, endCode: link.end, length: r.length ?? end - r.kp, height: r.height, link });
  }
  return out;
}
