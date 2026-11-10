import type { Linework } from './dxf';
import type { Route } from './route';
import type { CrossProfile } from './crossProfile';

/** Where an imported file goes. */
export type ImportTarget = 'route' | 'asbuilt' | 'plan' | 'long' | 'trans' | 'events' | 'cp' | 'logo' | 'siteplan';

export interface TargetInfo {
  key: ImportTarget;
  label: string;
  /** Lower-case extensions without the dot. */
  exts: string[];
  /** Panel type the data is drawn in. */
  panelType?: string;
  hint: string;
}

/** In the order the import window lists them. */
export const TARGETS: TargetInfo[] = [
  { key: 'plan', label: 'Plan view', exts: ['dxf', 'dwg'], panelType: 'plan', hint: 'Background drawing: assets, other lines, seabed features.' },
  { key: 'long', label: 'Longitudinal Profile', exts: ['csv', 'txt', 'xlsx', 'long'], panelType: 'longProfile', hint: 'Listing with KP, top and bottom of pipe, and seabed columns.' },
  { key: 'trans', label: 'Transverse Profile', exts: ['csv', 'txt', 'xlsx'], panelType: 'transProfile', hint: 'VisualWorks Cross-Profile RAW export from NaviModel.' },
  { key: 'events', label: 'Engineering Events', exts: ['csv', 'txt', 'xlsx', 'xls'], panelType: 'events', hint: 'Event code, KP and description columns.' },
  { key: 'cp', label: 'Cathodic Protection', exts: ['csv', 'txt', 'xlsx', 'xls'], panelType: 'cp', hint: 'KP and CP reading (mV) columns.' },
  { key: 'siteplan', label: 'Key Plan', exts: ['dxf', 'dwg'], panelType: 'keyplan', hint: 'Site plan drawing behind the key plan.' },
  { key: 'asbuilt', label: 'As Built survey line', exts: ['dxf', 'dwg', 'dig', 'csv', 'txt', 'xyz'], panelType: 'plan', hint: 'Surveyed pipe position, drawn in the plan view.' },
  { key: 'route', label: 'Runline', exts: ['rlx', 'rlxp', 'dxf'], panelType: 'plan', hint: 'Sets KP 0 and the KP blocks, and the number of charts.' },
  { key: 'logo', label: 'Logo image', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], panelType: 'logo', hint: 'Company, contractor or data acquired by.' },
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
  /** `before`: any part of the runline before KP 0, drawn but not charted. */
  | (Base & { kind: 'route'; route: Route; before?: Float64Array })
  | (Base & { kind: 'linework'; lw: Linework; width: number; textMode: TextMode; textScale: number; textHeight: number; both?: boolean })
  /** Pipe drawn between the top and bottom series; the rest are seabed lines. */
  | (Base & { kind: 'long'; kp: Float64Array; series: LongSeries[]; top?: number; bop?: number })
  /** Profiles sorted by KP; one is drawn every `every` metres (0: chosen from the scale). */
  | (Base & { kind: 'trans'; kp: Float64Array; profiles: CrossProfile[]; every: number; pipeColor: string })
  | (Base & { kind: 'events'; records: EventRecord[]; labels: boolean })
  | (Base & { kind: 'cp'; kp: Float64Array; mv: Float64Array; style: 'line' | 'ticks' });

export const SERIES_COLOURS = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#64748b'];

type LineworkSet = Extract<Dataset, { kind: 'linework' }>;

/** Drawings shown in a plan panel: plan data, plus site plans also asked for there (and the reverse for the key plan). */
export function lineworkFor(datasets: Dataset[], where: 'plan' | 'siteplan'): LineworkSet[] {
  return datasets.filter((d): d is LineworkSet => d.kind === 'linework' && d.visible && (d.target === where || (where === 'plan' && d.target === 'asbuilt') || !!d.both));
}
