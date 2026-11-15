import type { EventLink, EventRecord } from "./datasets";
import type { EventRow } from "./types";

/**
 * Engineering events go into the panel's rows by event code. Each row lists the
 * codes it takes, comma separated, with `*` as a wildcard and `#` for digits (`AN.*`, `FS#` = FS1, FS2..., `D.*, OT.OU`).
 */
export function codeMatcher(patterns: string): (code: string) => boolean {
  const res = patterns
    .split(/[,;\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .map(
      (p) =>
        new RegExp(
          "^" +
            p
              .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
              .replace(/\*/g, ".*")
              .replace(/#/g, "\\d+") +
            "$",
        ),
    );
  return (code) => res.some((re) => re.test(code.toUpperCase()));
}

/** Codes a row takes when nobody has set them, guessed from its label (Visual Edit coding). */
export function defaultRowCodes(label: string): string {
  const l = label.toUpperCase();
  if (/GRID KP|^KP\b/.test(l)) return "";
  if (/ANODE TYPE/.test(l)) return "PP.ST, PP.ET";
  if (/COATING/.test(l)) return "PP.SW, PP.EW";
  if (/DRY WEIGHT|^WEIGHT$/.test(l)) return "PP.SZ, PP.EZ";
  if (/PIPE SIZE|UMBILICAL/.test(l)) return "PP.SN, PP.EN";
  if (/ANODE/.test(l)) return "AN.*";
  if (/FIELD ?JOINT/.test(l)) return "FJ.*";
  if (/PIPELINE FEATURE|ENGINEERING FEATURE/.test(l)) return "PF.*, FJ.*";
  if (/FITTING|SUPPORT/.test(l)) return "SF.*, R.*";
  if (/FREESPAN|FREE SPAN/.test(l)) return "FS.*, FS#";
  if (/BURIAL|EXPOSURE/.test(l)) return "B.*, B#";
  if (/DEBRIS|ANOMAL|DAMAGE/.test(l)) return "D.*, OT.OU";
  if (/VIDEO/.test(l)) return "OT.VS, OT.VE";
  return "";
}

export const rowCodes = (r: EventRow) => r.codes ?? defaultRowCodes(r.label);

/** True for the row that carries the KP labels instead of events. */
export const isKpRow = (r: EventRow) => /GRID KP|^KP\b/i.test(r.label);

/** A row printing the video timing of its product (VIDEO rows do once the video list has lines, unless told otherwise). */
export const isVideoRow = (r: EventRow) =>
  r.video ?? (/video/i.test(r.label) && !r.textOnly);

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
export function splitRanges(
  all: EventRecord[],
  links: EventLink[] = [],
): { points: EventMark[]; ranges: EventRange[]; linked: LinkedEvent[] } {
  const linkCodes = new Set(
    links.flatMap((l) => [l.start.toUpperCase(), l.end.toUpperCase()]),
  );
  const linked = links.flatMap((l) => linkPairs(all, l));
  const records = all.filter((r) => !linkCodes.has(r.code.toUpperCase()));
  const codes = new Set(records.map((r) => r.code.toUpperCase()));
  const endOf = new Map<string, string>();
  for (const c of codes) {
    const [g, sub] = c.split(".");
    if (!sub) continue;
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] !== "S") continue;
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
    const e = endOf.get(c) ?? (/^PP\.S/.test(c) ? "" : undefined);
    if (e === undefined) {
      points.push(r);
      continue;
    }
    const close = e
      ? sorted.find(
          (x) => !used.has(x) && x.code.toUpperCase() === e && x.kp >= r.kp,
        )
      : undefined;
    if (close) used.add(close);
    ranges.push({ ...r, end: close ? close.kp : Infinity });
  }
  return { points, ranges, linked };
}

/** Each start code joined to the next end code after it. */
export function linkPairs(
  records: EventRecord[],
  link: EventLink,
): LinkedEvent[] {
  const s = link.start.toUpperCase();
  const e = link.end.toUpperCase();
  const starts = records
    .filter((r) => r.code.toUpperCase() === s)
    .sort((a, b) => a.kp - b.kp);
  const ends = records
    .filter((r) => r.code.toUpperCase() === e)
    .sort((a, b) => a.kp - b.kp);
  const out: LinkedEvent[] = [];
  let j = 0;
  for (const r of starts) {
    while (j < ends.length && ends[j].kp < r.kp) j++;
    if (j >= ends.length) break;
    const end = ends[j++].kp;
    out.push({
      kp: r.kp,
      end,
      startCode: r.code,
      endCode: link.end,
      length: r.length ?? end - r.kp,
      height: r.height,
      link,
    });
  }
  return out;
}

export type LinkKind =
  | "freespan"
  | "freespanInt"
  | "burial"
  | "burialInt"
  | "custom";
export const LINK_KINDS: Record<LinkKind, string> = {
  freespan: "Freespan",
  freespanInt: "Freespan intermittent",
  burial: "Burial",
  burialInt: "Burial intermittent",
  custom: "User defined",
};
export type BoldPos = "top" | "middle" | "bottom";

/** What each event type looks like: where its bold bar sits and whether it is broken. */
export const LINK_PRESETS: Record<
  LinkKind,
  { boldPos: BoldPos; dashed: boolean; label: string }
> = {
  freespan: {
    boldPos: "top",
    dashed: false,
    label: "Flowline Status - Freespan",
  },
  freespanInt: {
    boldPos: "top",
    dashed: true,
    label: "Flowline Status - Intermittent Freespan",
  },
  burial: {
    boldPos: "bottom",
    dashed: false,
    label: "Flowline Status - Burial",
  },
  burialInt: {
    boldPos: "bottom",
    dashed: true,
    label: "Flowline Status - Intermittent Burial",
  },
  custom: { boldPos: "top", dashed: false, label: "" },
};

/** The event type of a link: the one picked, or guessed from its legend text and start code. */
export function linkKind(l: {
  type?: LinkKind;
  label: string;
  start: string;
}): LinkKind {
  if (l.type) return l.type;
  const int = /intermit/i.test(l.label);
  if (isBurialLink(l)) return int ? "burialInt" : "burial";
  return int ? "freespanInt" : "freespan";
}

/** How a link's symbol is drawn: bold bar place, colour, thickness and pattern. */
export function linkLook(l: {
  type?: LinkKind;
  label: string;
  start: string;
  color: string;
  boldPos?: BoldPos;
  boldColor?: string;
  boldDash?: boolean;
}) {
  const pre = LINK_PRESETS[linkKind(l)];
  return {
    boldPos: l.boldPos ?? pre.boldPos,
    boldColor: l.boldColor ?? l.color,
    dashed: l.boldDash ?? pre.dashed,
  };
}

/** Burial links get the bold stripe at the foot, freespans at the top. */
export const isBurialLink = (l: { label: string; start: string }) =>
  /burial/i.test(l.label) || /B/i.test(l.start.split(".")[1] ?? "");

export interface SurveySession {
  t0: number;
  t1: number;
  /** KP span covered, metres. */
  k0: number;
  k1: number;
}

/**
 * The survey's sessions from the events' time stamps: events in time order, a new session
 * wherever the log stops for longer than `gapMinutes`. Each session covers the KP span
 * of its events.
 */
export function surveySessions(
  records: { kp: number; t?: number }[],
  gapMinutes = 60,
): SurveySession[] {
  const timed = records
    .filter(
      (r) => r.t !== undefined && Number.isFinite(r.t) && Number.isFinite(r.kp),
    )
    .sort((a, b) => a.t! - b.t!);
  const out: SurveySession[] = [];
  let cur: SurveySession | null = null;
  for (const r of timed) {
    if (cur && r.t! - cur.t1 <= gapMinutes * 60000) {
      cur.t1 = r.t!;
      cur.k0 = Math.min(cur.k0, r.kp);
      cur.k1 = Math.max(cur.k1, r.kp);
    } else {
      cur = { t0: r.t!, t1: r.t!, k0: r.kp, k1: r.kp };
      out.push(cur);
    }
  }
  return out.sort((a, b) => a.k0 - b.k0);
}

export type SessionEdits = Record<string, { k0?: number; k1?: number }>;

/**
 * Sessions joined end to end along KP, so the video row never shows a gap: each
 * session runs to where the next one starts. The user's own start / end KPs
 * (keyed by the session's start time) win over the ones read from the events.
 */
export function connectSessions(
  sessions: SurveySession[],
  edits: SessionEdits = {},
): SurveySession[] {
  const list = sessions
    .map((s) => {
      const e = edits[String(s.t0)];
      return { ...s, k0: e?.k0 ?? s.k0, k1: e?.k1 ?? s.k1 };
    })
    .sort((a, b) => a.k0 - b.k0);
  for (let j = 0; j + 1 < list.length; j++) {
    const a = list[j];
    const b = list[j + 1];
    const edA = edits[String(a.t0)]?.k1;
    const edB = edits[String(b.t0)]?.k0;
    const at = edA ?? edB ?? b.k0;
    a.k1 = at;
    b.k0 = at;
  }
  return list;
}

const p2 = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) =>
  `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
const clock = (d: Date) => {
  const h = d.getHours();
  return `${p2(h % 12 || 12)}:${p2(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
};

/** "12/06/2025 01:19 AM to 01:32 AM", with the second date only when the day changes. */
export function sessionText(s: SurveySession): string {
  const a = new Date(s.t0);
  const b = new Date(s.t1);
  return day(a) === day(b)
    ? `${day(a)} ${clock(a)} to ${clock(b)}`
    : `${day(a)} ${clock(a)} to ${day(b)} ${clock(b)}`;
}
