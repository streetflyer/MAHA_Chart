import type { Linework } from './dxf';
import type { Route } from './route';

/** Where an imported file goes. */
export type ImportTarget = 'route' | 'plan' | 'long' | 'trans' | 'events' | 'cp' | 'logo' | 'siteplan';

export interface TargetInfo {
  key: ImportTarget;
  label: string;
  /** Lower-case extensions without the dot. */
  exts: string[];
  /** Panel type the data is drawn in. */
  panelType?: string;
  hint: string;
}

export const TARGETS: TargetInfo[] = [
  { key: 'route', label: 'Route (proposed / KP line)', exts: ['dig', 'csv', 'txt', 'dxf', 'rlx', 'rlxp', 'xyz'], panelType: 'plan', hint: 'Sets KP 0 and the number of charts.' },
  { key: 'plan', label: 'Plan view data', exts: ['dig', 'csv', 'txt', 'dxf', 'xyz'], panelType: 'plan', hint: 'As-built lines, assets or a background drawing.' },
  { key: 'long', label: 'Longitudinal profile', exts: ['txt', 'csv', 'long'], panelType: 'longProfile', hint: '5/7/9-point listing: KP plus depth columns.' },
  { key: 'trans', label: 'Transverse profile', exts: ['csv', 'txt'], panelType: 'transProfile', hint: 'VisualWorks cross-profile RAW.' },
  { key: 'events', label: 'Engineering events', exts: ['csv', 'txt', 'xlsx', 'xls'], panelType: 'events', hint: 'KP, code and description columns.' },
  { key: 'cp', label: 'Cathodic protection', exts: ['csv', 'txt', 'xlsx', 'xls'], panelType: 'cp', hint: 'KP and mV columns.' },
  { key: 'logo', label: 'Logo image', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], panelType: 'logo', hint: 'Company, contractor or data acquired by.' },
  { key: 'siteplan', label: 'Site plan / key plan background', exts: ['dxf'], panelType: 'keyplan', hint: 'Background drawing for the key plan.' },
];

export const targetInfo = (k: ImportTarget) => TARGETS.find((t) => t.key === k)!;
export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const targetsFor = (name: string) => TARGETS.filter((t) => t.exts.includes(extOf(name)));

interface Base {
  id: string;
  name: string;
  target: ImportTarget;
  visible: boolean;
  color: string;
}

export interface LongSeries {
  name: string;
  values: Float64Array;
  color: string;
}

export interface EventRecord {
  /** KP in metres. */
  kp: number;
  code: string;
  value: string;
}

/** How DXF text is sized on paper: with the map, with the map but kept readable, or one fixed height. */
export type TextMode = 'auto' | 'drawn' | 'fixed';

export type Dataset =
  | (Base & { kind: 'route'; route: Route })
  | (Base & { kind: 'linework'; lw: Linework; width: number; textMode: TextMode; textScale: number; textHeight: number; both?: boolean })
  | (Base & { kind: 'long'; kp: Float64Array; series: LongSeries[] })
  | (Base & { kind: 'trans'; kp: Float64Array })
  | (Base & { kind: 'events'; records: EventRecord[]; rowId?: string })
  | (Base & { kind: 'cp'; kp: Float64Array; mv: Float64Array; style: 'line' | 'ticks' });

export const SERIES_COLOURS = ['#e00000', '#e00000', '#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#64748b'];

type LineworkSet = Extract<Dataset, { kind: 'linework' }>;

/** Drawings shown in a plan panel: plan data, plus site plans also asked for there (and the reverse for the key plan). */
export function lineworkFor(datasets: Dataset[], where: 'plan' | 'siteplan'): LineworkSet[] {
  return datasets.filter((d): d is LineworkSet => d.kind === 'linework' && d.visible && (d.target === where || !!d.both));
}
