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
  locked?: boolean;
  /** Free text body shown inside the panel (notes, geodetic parameters, ...). May contain {TOKENS}. */
  body?: string;
  /** Engineering events / CP rows. */
  rows?: EventRow[];
  /** Width of the row label column for row-based panels. */
  labelWidth?: number;
  /** Header bar fill, e.g. the CHART INFORMATION banner. */
  fill?: string;
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

export type ScaleLock = 'kp' | 'scale';

export interface ScaleSettings {
  /** Horizontal (plan and KP) scale denominator, e.g. 5000 for 1:5,000. */
  horizontal: number;
  /** Route length covered by one sheet, in metres. */
  kpPerSheet: number;
  /** Which value stays fixed when the plan view width changes. */
  lock: ScaleLock;
  verticalLong: number;
  verticalTrans: number;
  lateralTrans: number;
  /** Overlap between consecutive sheets, in metres. */
  overlap: number;
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
  /** Title block and other fill-in values, referenced from text as {KEY}. */
  fields: Record<string, string>;
  updatedAt?: string;
}

export type Selection = { kind: 'panel' | 'text'; id: string };
