import { DEFAULT_EVENT_CODES, DISCLAIMER, defaultLegend, defaultRevisions } from './presets';
import type { ChartTemplate, EventRow, Panel, TextItem } from './types';

/*
 * The alignment sheet below is measured from 33DJ100160_Base_5Panel_5k.dxf (A1, 1:5,000).
 * DXF coordinates are y-up; here every value is converted to y-down millimetres.
 */

const LEFT_X = 14.7;
const LEFT_W = 630;
const INFO_X = 655.5;
const INFO_W = 170.5;

const row = (id: string, label: string): EventRow => ({ id, label });

const EVENT_ROWS: EventRow[] = [
  row('r_umb', 'UMBILICAL'),
  row('r_weight', 'WEIGHT'),
  row('r_ratio', 'WEIGHT RATIO / DESIGN PRESSURE'),
  row('r_mcl', 'MINIMUM COMPRESSIVE LOAD'),
  row('r_eng', 'ENGINEERING FEATURES'),
  row('r_anodes', 'ANODES'),
  row('r_fit', 'FITTINGS / SUPPORT'),
  row('r_fs', 'FREESPANS'),
  row('r_burial', 'BURIAL'),
  row('r_debris', 'DAMAGE / DEBRIS / SEABED FEATURE'),
  row('r_video', 'VIDEO'),
  row('r_kp', 'GRID KP (KM)'),
];

function section(id: string, type: Panel['type'], title: string, top: number, bottom: number, extra: Partial<Panel> = {}): Panel {
  return {
    id,
    type,
    title,
    titlePosition: 'inside',
    x: INFO_X,
    y: top,
    w: INFO_W,
    h: bottom - top,
    parentId: 'p_info',
    ...extra,
  };
}

function sideLabel(id: string, panelId: string, panelH: number, text: string, side: 'left' | 'right' = 'left'): TextItem {
  return {
    id,
    panelId,
    x: side === 'left' ? -4 : LEFT_W + 4,
    y: panelH / 2,
    text,
    size: 2,
    anchor: 'middle',
    rotation: -90,
  };
}

export function alignmentSheetA1(): ChartTemplate {
  const panels: Panel[] = [
    { id: 'p_plan', type: 'plan', title: 'PLAN VIEW', titlePosition: 'above', x: LEFT_X, y: 15.5, w: LEFT_W, h: 132 },
    { id: 'p_long', type: 'longProfile', title: 'LONGITUDINAL PROFILE', titlePosition: 'above', x: LEFT_X, y: 159.5, w: LEFT_W, h: 80, kpAligned: true },
    { id: 'p_trans', type: 'transProfile', title: 'TRANSVERSE PROFILE', titlePosition: 'above', x: LEFT_X, y: 251.5, w: LEFT_W, h: 80, kpAligned: true },
    {
      id: 'p_events',
      type: 'events',
      title: 'ENGINEERING EVENTS',
      titlePosition: 'above',
      x: LEFT_X,
      y: 343.5,
      w: LEFT_W,
      h: 144,
      kpAligned: true,
      rows: EVENT_ROWS.map((r) => ({ ...r })),
      labelWidth: 33.3,
    },
    { id: 'p_cp', type: 'cp', title: 'CATHODIC PROTECTION', titlePosition: 'above', x: LEFT_X, y: 499.5, w: LEFT_W, h: 80, kpAligned: true },
    { id: 'p_info', type: 'chartInfo', title: 'CHART INFORMATION', titlePosition: 'none', x: INFO_X, y: 15.2, w: INFO_W, h: 564.5 },
    section('s_header', 'text', 'CHART INFORMATION', 15.2, 27.5, {
      titlePosition: 'none',
      fill: '#0f3d4c',
      textColor: '#ffd84d',
      body: 'CHART INFORMATION',
      font: { size: 4.2, align: 'middle', vcenter: true },
    }),
    section('s_legend', 'legend', 'LEGEND', 27.5, 148.5, { titlePosition: 'none', legend: defaultLegend(), eventCodes: DEFAULT_EVENT_CODES }),
    section('s_notes', 'notes', 'NOTES', 148.5, 185.9, {
      body: '1. Design route taken from Alignment Sheet, CONTRACTOR provided file.\n2. Field assets taken from as-installed database.\n3. All KPs are referenced to the as-built route.',
    }),
    section('s_geodetic', 'geodetic', 'GEODETIC PARAMETERS', 185.9, 222.8, {
      body: 'Geodetic Datum\t: WGS84\nEllipsoid\t: WGS84\nProjection\t: {PROJECTION}\nSemi-major Axis\t: 6 378 137.0m\nInverse Flattening\t: 1/ 298.257 223 563\nCentral Meridian\t: 117°00\' E\nX Origin\t: 500 000 m at CM\nY Origin\t: 0 m at 00°00\' N',
      body2: 'dX\t: 0.0 m\ndY\t: 0.0 m\ndZ\t: 0.0 m\nRx\t: 0.0 sec\nRy\t: 0.0 sec\nRz\t: 0.0 sec\nScale Factor at CM\t: 0.0999600 ppm',
    }),
    section('s_equipment', 'equipment', 'EQUIPMENT USED', 222.8, 265.7, {
      body: 'Primary DGPS Positioning System\t: {PRIMARY_DGPS}\nSecondary DGPS Positioning System\t: {SECONDARY_DGPS}\nMultibeam Echosounder\t: {MBES}',
    }),
    section('s_scale', 'scale', 'SCALE', 265.7, 292.7),
    section('s_disclaimer', 'text', 'DISCLAIMER', 292.7, 301.7, {
      titlePosition: 'none',
      fill: '#ffffff',
      textColor: '#e00000',
      body: DISCLAIMER,
      font: { size: 1.25, bold: true, align: 'middle', vcenter: true },
    }),
    section('s_keyplan', 'keyplan', 'KEY PLAN', 301.7, 406.7),
    section('s_project', 'text', 'PROJECT', 406.7, 430.2, { body: '{PROJECT}', font: { size: 3, bold: true, align: 'middle', vcenter: true } }),
    section('s_title', 'text', 'TITLE', 430.2, 455.3, { body: '{TITLE}', font: { size: 2.8, align: 'middle', vcenter: true } }),
    section('s_company', 'logo', 'COMPANY', 455.3, 482.5),
    section('s_contractor', 'logo', 'CONTRACTOR/SUBCONTRACTOR', 482.5, 512.3, { w: 777.7 - INFO_X }),
    section('s_acquired', 'logo', 'DATA ACQUIRED AND PROCESSED BY :', 482.5, 512.3, { x: 777.7, w: INFO_X + INFO_W - 777.7 }),
    section('s_titleblock', 'titleBlock', 'TITLE BLOCK', 512.3, 579.7, { titlePosition: 'none', revisions: defaultRevisions() }),
  ];

  const texts: TextItem[] = [
    sideLabel('t_long_v', 'p_long', 80, 'Vertical Scale {V_SCALE_LONG} (Depth in metres below MSL)'),
    sideLabel('t_trans_v', 'p_trans', 80, 'Vertical Scale {V_SCALE_TRANS} / Lateral Scale {L_SCALE_TRANS}'),
    sideLabel('t_cp_v', 'p_cp', 80, 'Cathodic Protection (mV)'),
  ];

  return {
    id: 'builtin_alignment_a1',
    name: 'Alignment sheet 5-panel (A1, 1:5,000)',
    kind: 'alignment',
    builtIn: true,
    paper: { size: 'A1', orientation: 'landscape', width: 841, height: 594, frameInset: 3.5 },
    scale: {
      horizontal: 5000,
      kpPerSheet: (LEFT_W * 5000) / 1000,
      routeLength: 15000,
      verticalLong: 200,
      verticalTrans: 100,
      lateralTrans: 100,
      overlap: 0,
    },
    panels,
    texts,
    images: [],
    fontFamily: 'Arial',
    fields: {
      PROJECT: 'PROVISION AND INSTALLATION OF SUBSEA UMBILICAL, RISER, AND FLOWLINES (SURF) AND PRE-COMMISSIONING ACTIVITIES FOR MAHA',
      TITLE: 'AS-BUILT SURVEY\nUMBILICAL 1 UMB1 UTA-B to UMB1 UTA-A',
      CHART_NO: '33DJ100160-T1201-UMB1-CH-01',
      START_KP: '0.000',
      SURVEY_DATE: '14/03/2025, 18/03/2025, And 19/03/2025',
      SURVEY_VESSEL: 'TIMAS 1201',
      PROJECTION: 'UTM Zone 50 South',
      PRIMARY_DGPS: 'Veripos LD900 c/w APEX Correction',
      SECONDARY_DGPS: 'Veripos LD900 c/w APEX Correction',
      MBES: '',
    },
  };
}

/** The same sheet with the cathodic protection panel removed, as discussed for this job. */
export function alignmentSheetA1NoCp(): ChartTemplate {
  const t = alignmentSheetA1();
  const cp = t.panels.find((p) => p.id === 'p_cp')!;
  const events = t.panels.find((p) => p.id === 'p_events')!;
  // Give the freed space to the engineering events panel.
  events.h = cp.y + cp.h - events.y;
  return {
    ...t,
    id: 'builtin_alignment_a1_nocp',
    name: 'Alignment sheet 4-panel, no CP (A1, 1:5,000)',
    panels: t.panels.filter((p) => p.id !== 'p_cp'),
    texts: t.texts.filter((x) => x.panelId !== 'p_cp'),
  };
}

export function northUpA1(): ChartTemplate {
  const t = alignmentSheetA1();
  const keep = new Set(['p_info', ...t.panels.filter((p) => p.parentId === 'p_info').map((p) => p.id)]);
  const plan: Panel = { id: 'p_plan', type: 'plan', title: 'PLAN VIEW', titlePosition: 'none', x: LEFT_X, y: 15.2, w: LEFT_W, h: 564.5 };
  return {
    ...t,
    id: 'builtin_northup_a1',
    name: 'North-Up chart (A1)',
    kind: 'northUp',
    panels: [plan, ...t.panels.filter((p) => keep.has(p.id))],
    texts: [],
  };
}

export const BUILTIN_TEMPLATES: Array<() => ChartTemplate> = [alignmentSheetA1, alignmentSheetA1NoCp, northUpA1];
