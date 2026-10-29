import { newId } from '../model/ids';
import type { Panel, PanelType, TitlePosition } from '../model/types';

interface PanelDefault {
  title: string;
  label: string;
  w: number;
  h: number;
  titlePosition: TitlePosition;
  extra?: () => Partial<Panel>;
}

export const PANEL_DEFAULTS: Record<PanelType, PanelDefault> = {
  plan: { label: 'Plan view', title: 'PLAN VIEW', w: 400, h: 120, titlePosition: 'above' },
  longProfile: { label: 'Longitudinal profile', title: 'LONGITUDINAL PROFILE', w: 400, h: 80, titlePosition: 'above', extra: () => ({ kpAligned: true }) },
  transProfile: { label: 'Transverse profile', title: 'TRANSVERSE PROFILE', w: 400, h: 80, titlePosition: 'above', extra: () => ({ kpAligned: true }) },
  events: {
    label: 'Engineering events',
    title: 'ENGINEERING EVENTS',
    w: 400,
    h: 72,
    titlePosition: 'above',
    extra: () => ({
      kpAligned: true,
      labelWidth: 33,
      rows: ['ANODES', 'FIELD JOINTS', 'FREESPANS', 'BURIAL', 'DEBRIS', 'GRID KP (KM)'].map((label) => ({ id: newId('r'), label })),
    }),
  },
  cp: { label: 'Cathodic protection', title: 'CATHODIC PROTECTION', w: 400, h: 60, titlePosition: 'above', extra: () => ({ kpAligned: true }) },
  chartInfo: { label: 'Chart information (container)', title: 'CHART INFORMATION', w: 170, h: 300, titlePosition: 'none' },
  legend: { label: 'Legend', title: 'LEGEND', w: 170, h: 60, titlePosition: 'inside', extra: () => ({ body: 'Legend item' }) },
  notes: { label: 'Notes', title: 'NOTES', w: 170, h: 40, titlePosition: 'inside', extra: () => ({ body: '1. ' }) },
  geodetic: { label: 'Geodetic parameters', title: 'GEODETIC PARAMETERS', w: 170, h: 40, titlePosition: 'inside', extra: () => ({ body: 'Geodetic Datum : WGS84\nProjection : {PROJECTION}' }) },
  equipment: { label: 'Equipment used', title: 'EQUIPMENT USED', w: 170, h: 40, titlePosition: 'inside', extra: () => ({ body: '' }) },
  scale: { label: 'Scale bars', title: 'SCALE', w: 170, h: 27, titlePosition: 'inside' },
  keyplan: { label: 'Key plan', title: 'KEY PLAN', w: 170, h: 100, titlePosition: 'inside' },
  titleBlock: { label: 'Title block', title: 'TITLE BLOCK', w: 170, h: 67, titlePosition: 'none' },
  logo: { label: 'Logo / image', title: 'LOGO', w: 60, h: 27, titlePosition: 'inside' },
  text: { label: 'Text box', title: 'TEXT', w: 100, h: 25, titlePosition: 'inside', extra: () => ({ body: 'Text' }) },
};

/** Panel types offered in "Add panel", in menu order. */
export const ADDABLE_TYPES: PanelType[] = [
  'plan',
  'longProfile',
  'transProfile',
  'events',
  'cp',
  'chartInfo',
  'legend',
  'notes',
  'geodetic',
  'equipment',
  'scale',
  'keyplan',
  'titleBlock',
  'logo',
  'text',
];
