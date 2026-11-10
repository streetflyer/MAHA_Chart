import type { Dataset } from './datasets';
import type { LegendGroup, LegendItem, LegendStyle } from './types';

export const DEFAULT_LEGEND_STYLE: LegendStyle = { family: 'Arial', size: 1.45, color: '#555555', headSize: 1.9, headColor: '#555555', codeColor: '#f08080', codeSize: 1.4 };

/** A legend line built from a dataset; `key` stays the same across sessions for the same kind of data. */
export interface DataLegendItem extends LegendItem {
  key: string;
  /** The dataset whose colour this item shows (editing the colour edits the data). */
  datasetId?: string;
  /** Which colour of the dataset it shows. */
  colorOf?: 'color' | 'pipe' | `link:${number}` | `series:${number}`;
}

const SERIES_NAMES: Record<string, string> = { MEANADJ: 'Mean Adjacent Seabed', MEANADJSEABED: 'Mean Adjacent Seabed', MEANSEABED: 'Mean Seabed', MEANADJACENTSEABED: 'Mean Adjacent Seabed' };
const plainName = (file: string) => file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');

/** Legend items for everything imported, in the colours it is drawn with. */
export function dataLegend(datasets: Dataset[], kpColor: string): DataLegendItem[] {
  const out: DataLegendItem[] = [];
  const add = (it: Omit<DataLegendItem, 'id'>) => out.push({ ...it, id: `data:${it.key}` });
  const vis = datasets.filter((d) => d.visible);
  const route = vis.find((d) => d.kind === 'route');
  if (route) {
    add({ key: 'kp', group: 'plan', symbol: 'kpMarker', label: 'KP Marker - Grid', color: kpColor, symbolText: '1.000' });
    add({ key: 'route', group: 'plan', symbol: 'line', label: 'Proposed Pipeline Route (Designed Route)', color: route.color, datasetId: route.id, colorOf: 'color' });
  }
  for (const d of vis.filter((x) => x.target === 'asbuilt')) add({ key: `asbuilt:${d.name}`, group: 'plan', symbol: 'line', label: 'As-Built Pipeline', color: d.color, datasetId: d.id, colorOf: 'color' });
  for (const d of vis.filter((x) => x.target === 'plan')) add({ key: `plan:${d.name}`, group: 'plan', symbol: 'thinLine', label: plainName(d.name), color: d.color, datasetId: d.id, colorOf: 'color' });
  for (const d of vis) {
    if (d.kind === 'long') {
      const pipe = d.top !== undefined ? d.series[d.top] : d.bop !== undefined ? d.series[d.bop] : undefined;
      if (pipe) add({ key: 'long:pipe', group: 'long', symbol: 'pipeBand', label: 'Top and Bottom of Product', color: pipe.color, fill: d.fill, datasetId: d.id, colorOf: 'pipe' });
      d.series.forEach((s, i) => {
        if (i === d.top || i === d.bop) return;
        const k = s.name.toUpperCase().replace(/[^A-Z]/g, '');
        add({ key: `long:${k}`, group: 'long', symbol: 'thinLine', label: SERIES_NAMES[k] ?? s.name, color: s.color, datasetId: d.id, colorOf: `series:${i}` });
      });
    }
    if (d.kind === 'trans')
      add({ key: 'trans', group: 'trans', symbol: 'seabedProfile', label: 'Seabed Profile Aligned with Top of Product Marker Viewed in Ascending KP direction', color: d.color, fill: d.pipeFill, outline: d.pipeColor, datasetId: d.id, colorOf: 'color' });
    if (d.kind === 'cp') add({ key: 'cp', group: 'cp', symbol: 'cpStab', label: 'Cathodic Protection Reading', color: d.color, cpSymbol: d.symbol, symbolText: '-1050mV', datasetId: d.id, colorOf: 'color' });
    if (d.kind === 'events')
      d.links.forEach((l, i) => {
        if (!out.some((x) => x.key === `link:${l.start}`))
          add({ key: `link:${l.start}`, group: 'status', symbol: 'freespan', label: l.label, color: l.color, symbolText: 'Length (m)', datasetId: d.id, colorOf: `link:${i}` });
      });
  }
  return out;
}

/** "CODE<Tab>Description" lines for the codes in the imported events. */
export function dataEventCodes(datasets: Dataset[]): string {
  const desc = new Map<string, Map<string, number>>();
  for (const d of datasets)
    if (d.kind === 'events' && d.visible)
      for (const r of d.records) {
        const c = r.code.toUpperCase();
        if (!desc.has(c)) desc.set(c, new Map());
        const v = r.value.trim();
        // Descriptions like "Pipeline Feature - Flange" define a code; free text (pipe specs, dates, 0) doesn't.
        if (v && v.length <= 48 && !/^-?[\d.]+$/.test(v)) desc.get(c)!.set(v, (desc.get(c)!.get(v) ?? 0) + 1);
      }
  return [...desc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, m]) => {
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return `${c}\t${best}`;
    })
    .join('\n');
}

export const groupsWithData = (items: DataLegendItem[]) => new Set<LegendGroup>(items.map((i) => i.group));
