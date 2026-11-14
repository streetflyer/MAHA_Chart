// All geometry is in millimetres on the paper, origin top-left, y pointing down.

export type PanelType =
  | 'plan'
  | 'longProfile'
  | 'transProfile'
  | 'events'
  | 'cp'
  | 'chartInfo'
  | 'legend'
  | 'notes'
  | 'geodetic'
  | 'equipment'
  | 'scale'
  | 'keyplan'
  | 'titleBlock'
  | 'logo'
  | 'text';

export type TitlePosition = 'above' | 'inside' | 'none';

export interface EventRow {
  id: string;
  label: string;
  /** Event codes drawn in this row, comma separated, `*` wildcard. Unset: guessed from the label. */
  codes?: string;
  /** Draw only `text` across the row, not events. */
  textOnly?: boolean;
  text?: string;
  textAlign?: 'start' | 'middle' | 'end';
}

export interface Panel {
  id: string;
  type: PanelType;
  title: string;
  titlePosition: TitlePosition;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Section panels (legend, notes, ...) belong to a container such as Chart Information. */
  parentId?: string;
  /** KP-aligned panels share the plan view's horizontal extent and scale. */
  kpAligned?: boolean;
  /** Vertical KP lines in the profile and CP panels (default on). */
  kpLines?: boolean;
  /** KP values along the foot of the profile and CP panels (default on). */
  kpLabels?: boolean;
  locked?: boolean;
  /** Free text body shown inside the panel (notes, geodetic parameters, ...). May contain {TOKENS}. */
  body?: string;
  /** Engineering events / CP rows. */
  rows?: EventRow[];
  /** Width of the row label column for row-based panels. */
  labelWidth?: number;
  /** Second text column shown to the right of body (e.g. datum shift parameters). */
  body2?: string;
  /** Header bar fill, e.g. the CHART INFORMATION banner. */
  fill?: string;
  /** Colour for the panel's own text (body, title). */
  textColor?: string;
  /** Text style for body text. */
  font?: TextStyle;
  /** Legend entries (legend panels). */
  legend?: LegendItem[];
  legendStyle?: LegendStyle;
  legendData?: LegendData;
  /** Code + description lines shown as "EVENT CODE DEFINITIONS" in the legend. */
  eventCodes?: string;
  /** Revision history rows, newest first (title block). */
  revisions?: RevisionRow[];
  /** Key plan look (key plan panels). */
  keyplan?: KeyplanStyle;
  /** Plan view look: route, KP blocks and grid (plan panels). */
  plan?: PlanStyle;
}

export interface PlanStyle {
  routeColor: string;
  /** Line width in mm. */
  routeWidth: number;
  dxfColor: string;
  showKp: boolean;
  /** Metres between KP blocks; 0 = a tenth of the scale (1:5,000 gives 500 m). */
  kpInterval: number;
  /** Turn of the KP block from upright, in degrees (clockwise). */
  kpRotation: number;
  kpColor: string;
  kpFill: string;
  kpTextColor: string;
  /** Text height in mm. */
  kpTextSize: number;
  /** Diamond height in mm. */
  kpBlockSize: number;
  /** Stem from the route up to the diamond, in mm. */
  kpStem: number;
  showGrid: boolean;
  /** Metres between grid lines; 0 picks a round value. */
  gridSpacing: number;
  gridTextSize: number;
  gridTextColor: string;
  crossSize: number;
  crossColor: string;
  tickSize: number;
  tickColor: string;
  showNorth: boolean;
  /** North arrow position as a fraction of the plan view's width and height. */
  northX: number;
  northY: number;
  /** North arrow height in mm. */
  northSize: number;
  northColor: string;
  /** Matchlines marking where neighbouring charts begin and end (unset = off). */
  match?: Partial<MatchlineStyle>;
}

/** Matchlines of the plan view, like AutoChart's Create Matchlines. */
export interface MatchlineStyle {
  on: boolean;
  /** 'overlap': where the neighbouring charts start and end inside this one. 'profile': this chart's own start and end KP. */
  mode: 'overlap' | 'profile';
  prefix: string;
  suffix: string;
  /** A second line of text on the other side of each line. */
  extra: string;
  color: string;
  width: number;
  /** Dash pattern in mm ("" = continuous). */
  dash: string;
  /** Label text height, mm. */
  textSize: number;
  family: string;
}

export interface KeyplanStyle {
  /** Sea / background fill. */
  background: string;
  /** Colour of background DXF linework. */
  dxfColor: string;
  routeColor: string;
  boundaryColor: string;
  /** Highlight for the chart being viewed. */
  currentColor: string;
  /** Grid spacing in metres; 0 picks a round value. */
  gridSpacing: number;
  gridColor: string;
  showGrid: boolean;
  showNorthArrow: boolean;
  showBoundaries: boolean;
}

export interface TextStyle {
  /** Cap height in mm. */
  size: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'start' | 'middle' | 'end';
  /** Vertically centre the text inside the panel. */
  vcenter?: boolean;
}

export type LegendGroup = 'plan' | 'long' | 'trans' | 'cp' | 'status';

export type LegendSymbol =
  | 'kpMarker'
  | 'line'
  | 'thinLine'
  | 'dashed'
  | 'dashedThick'
  | 'doubleLine'
  | 'matchline'
  | 'assetBlob'
  | 'seabedProfile'
  | 'cpStab'
  | 'burial'
  | 'freespan'
  | 'box'
  | 'circle'
  | 'pipeBand';

export interface LegendItem {
  id: string;
  group: LegendGroup;
  symbol: LegendSymbol;
  label: string;
  color: string;
  /** Short text drawn with the symbol, e.g. "-1090mV" or a chart number. */
  symbolText?: string;
  /** Filled in automatically from plan view layers once data is loaded (plan step 3). */
  linked?: boolean;
  /** Added by the user (kept beside the items built from imported data). */
  custom?: boolean;
  /** Extra look for data-built symbols: band / pipe fill, outline, CP symbol. */
  fill?: string;
  outline?: string;
  cpSymbol?: string;
}

/** Text look of a legend panel. */
export interface LegendStyle {
  family: string;
  /** Item text cap height, mm. */
  size: number;
  color: string;
  headSize: number;
  headColor: string;
  codeColor: string;
  codeSize: number;
  bold?: boolean;
  italic?: boolean;
  /** Font of the event code definitions; unset follows the legend text. */
  codeFamily?: string;
  codeBold?: boolean;
  codeItalic?: boolean;
  /** Event code definitions use the legend text height (default on). */
  sameCodeSize?: boolean;
  /** Definitions of every event code, or only of the codes on the chart being shown. */
  codeScope?: 'all' | 'chart';
  /** Heading wording, by group; unset keeps the standard heading. */
  headings?: Partial<Record<LegendGroup | 'codes', string>>;
}

/** A legend panel's items built from the imported data: on/off, and the user's wording per item. */
export interface LegendData {
  on: boolean;
  /** Keyed by the item's data key: new wording, or hidden. */
  overrides: Record<string, { label?: string; hidden?: boolean }>;
}

export interface RevisionRow {
  id: string;
  rev: string;
  date: string;
  desc: string;
  drawn: string;
  checked: string;
  approved: string;
}

export type RevisionColumn = Exclude<keyof RevisionRow, 'id'>;

export interface ImageItem {
  id: string;
  /** Images sit relative to a panel (a logo box) or to the sheet. */
  panelId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** data: URL, downscaled on import so templates stay small. */
  src: string;
  name?: string;
}

export interface TextItem {
  id: string;
  /** Text is positioned relative to this panel's top-left corner; absent means relative to the sheet. */
  panelId?: string;
  x: number;
  y: number;
  text: string;
  size: number;
  anchor: 'start' | 'middle' | 'end';
  bold?: boolean;
  rotation?: number;
  color?: string;
}

export interface ScaleSettings {
  /** Horizontal (plan and KP) scale denominator, e.g. 5000 for 1:5,000. */
  horizontal: number;
  /** Route length covered by one sheet, in metres. Always plan view width x scale; panels never resize for it. */
  kpPerSheet: number;
  /** Total survey line length in metres. Comes from the route file once loaded; typed in until then. */
  routeLength: number;
  verticalLong: number;
  verticalTrans: number;
  lateralTrans: number;
  /** Overlap between consecutive sheets, in metres. */
  overlap: number;
  /**
   * Charts placed by hand (dragged, rotated, added or deleted in the key plan).
   * Absent while charts are spaced evenly from the start KP.
   */
  sheets?: SheetFrame[];
  /** Charts fitted automatically to the loaded route (bends get shorter charts). Recomputed, never edited. */
  autoSheets?: SheetFrame[];
}

export interface SheetFrame {
  /** KP at the left edge of the plan view, in metres. May be before KP 0. */
  start: number;
  /** Turn added to the frame's direction along the line, in degrees (anticlockwise). */
  rotation?: number;
  /** KP where this chart hands over to the next, in metres, when it covers less than a full sheet (a bend). */
  end?: number;
  /** Map nudged inside the plan view by the user, in metres along and across the frame. */
  panU?: number;
  panV?: number;
}

export interface PaperSettings {
  size: PaperSizeName;
  orientation: 'landscape' | 'portrait';
  width: number;
  height: number;
  /** Inset of the outer drawing frame from the paper edge. */
  frameInset: number;
}

export type PaperSizeName = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'Custom';

export type ChartKind = 'alignment' | 'northUp';

export interface ChartTemplate {
  id: string;
  name: string;
  kind: ChartKind;
  builtIn?: boolean;
  paper: PaperSettings;
  scale: ScaleSettings;
  panels: Panel[];
  texts: TextItem[];
  images?: ImageItem[];
  /** Font family used for all sheet text. */
  fontFamily?: string;
  /** Title block and other fill-in values, referenced from text as {KEY}. */
  fields: Record<string, string>;
  updatedAt?: string;
}

export type Selection = { kind: 'panel' | 'text' | 'image'; id: string };
