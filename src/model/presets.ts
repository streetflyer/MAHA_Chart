import { newId } from './ids';
import type { LegendGroup, LegendItem, LegendSymbol, RevisionRow } from './types';

export const LEGEND_GROUPS: Record<LegendGroup, string> = {
  plan: 'PLAN VIEW',
  long: 'LONGITUDINAL PROFILE',
  trans: 'TRANSVERSE PROFILES',
  cp: 'CATHODIC PROTECTION PROFILE',
  status: 'FLOWLINE STATUS',
};

export const LEGEND_SYMBOLS: Record<LegendSymbol, string> = {
  kpMarker: 'KP marker flag',
  line: 'Solid line',
  thinLine: 'Thin line',
  dashed: 'Dashed line',
  dashedThick: 'Thick dashed line',
  doubleLine: 'Double line (top / bottom)',
  matchline: 'Matchline with chart number',
  assetBlob: 'Existing asset symbol',
  seabedProfile: 'Seabed profile with marker',
  cpStab: 'CP stab (circle + mV)',
  burial: 'Burial length bracket',
  freespan: 'Freespan length bracket',
  box: 'Filled box',
  circle: 'Circle',
};

type Preset = Omit<LegendItem, 'id'>;

/** The legend of the 33DJ100160 alignment sheet, as presets the user can add back at any time. */
export const LEGEND_PRESETS: Preset[] = [
  { group: 'plan', symbol: 'kpMarker', label: 'KP Marker - Grid', color: '#e00000', symbolText: '1.000', linked: true },
  { group: 'plan', symbol: 'line', label: 'Proposed Route (Designed Route) (Note 1)', color: '#e00000', linked: true },
  { group: 'plan', symbol: 'thinLine', label: 'As-Built Route (Note 4)', color: '#1f3fd6', linked: true },
  { group: 'plan', symbol: 'dashedThick', label: 'Proposed Field Assets (Note 2)', color: '#111111', linked: true },
  { group: 'plan', symbol: 'thinLine', label: 'As-Installed Field Infrastructure (Note 2)', color: '#111111', linked: true },
  { group: 'plan', symbol: 'matchline', label: 'Adjoining Chart Matchline with Chart Number', color: '#8a8a8a', symbolText: '{CHART_NO}', linked: true },
  { group: 'plan', symbol: 'assetBlob', label: 'Other Existing Field Assets (Note 2)', color: '#8a8a8a', linked: true },
  { group: 'long', symbol: 'doubleLine', label: 'Top and Bottom of Product', color: '#e00000' },
  { group: 'long', symbol: 'dashed', label: 'Real Depth of Bottom Product', color: '#e00000' },
  { group: 'long', symbol: 'line', label: 'Mean Adjacent Seabed', color: '#19b31f' },
  { group: 'long', symbol: 'line', label: 'Mean Seabed', color: '#1f3fd6' },
  { group: 'trans', symbol: 'seabedProfile', label: 'Seabed Profile Aligned with Top of Product Marker. Viewed in Ascending KP direction', color: '#111111' },
  { group: 'cp', symbol: 'cpStab', label: 'Cathodic Protection Stab', color: '#1f3fd6', symbolText: '-1090mV' },
  { group: 'status', symbol: 'burial', label: 'Flowline Status - Burial', color: '#1f3fd6', symbolText: 'Length (m)' },
  { group: 'status', symbol: 'freespan', label: 'Flowline Status - Freespan', color: '#d61fd6', symbolText: 'Length (m)' },
];

export const defaultLegend = (): LegendItem[] => LEGEND_PRESETS.map((p) => ({ ...p, id: newId('lg') }));

export const DEFAULT_EVENT_CODES = [
  'CP3\tCathodic Prot. - Single Test Point',
  'D21\tDebris - Other Soft',
  'E22\tEngin. Feature - Bend Restrictor Start',
  'E23\tEngin. Feature - Bend Restrictor End',
  'E30\tEngin. Feature - Umbilical Length Marker',
  'E49\tEngin. Feature - Other',
  'E97\tEngin. Feature - Touchdown Point',
  'E100\tEngin. Feature - Umbilical Termination Head',
  'FS1\tFreespan - Start',
  'FS2\tFreespan - End',
].join('\n');

export const DISCLAIMER =
  'This document may only be used for the purpose for which it was commissioned and in accordance with the terms of engagement for that commission. Unauthorized use of this document in any form whatsoever is undertaken entirely at user’s risk.';

/** Choices for the revision description column; anything else is user defined. */
export const REVIEW_OPTIONS = ['Issued for Internal Review', 'Issued for Review', 'Issued for Use', 'Re-Issued for Use'];

export const REVISION_ROWS = 10;

export function blankRevision(): RevisionRow {
  return { id: newId('rev'), rev: '', date: '', desc: '', drawn: '', checked: '', approved: '' };
}

/** Rows newest first; the table draws the newest at the top of the filled rows, as on the sample sheet. */
export function defaultRevisions(): RevisionRow[] {
  const filled: Array<Omit<RevisionRow, 'id'>> = [
    { rev: '1', date: '08/08/2025', desc: 'Re-Issued for Use', drawn: 'IHA/AHU', checked: 'ISE', approved: 'LSH' },
    { rev: '0', date: '04/07/2025', desc: 'Issued for Use', drawn: 'IHA/AHU', checked: 'ISE', approved: 'LSH' },
    { rev: 'A2', date: '03/06/2025', desc: 'Issued for Review', drawn: 'IHA/AHU', checked: 'ISE', approved: 'LSH' },
    { rev: 'A1', date: '17/04/2025', desc: 'Issued for Review', drawn: 'AHU', checked: 'ISE', approved: 'LSH' },
    { rev: 'P1', date: '14/04/2025', desc: 'Issued for Internal Review', drawn: 'AHU', checked: 'ISE', approved: 'LSH' },
  ];
  const rows = filled.map((r) => ({ ...r, id: newId('rev') }));
  while (rows.length < REVISION_ROWS) rows.push(blankRevision());
  return rows;
}
