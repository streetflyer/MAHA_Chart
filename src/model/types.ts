// All geometry is in millimetres on the paper, origin top-left, y pointing down.

export type PanelType =
  | "plan"
  | "longProfile"
  | "transProfile"
  | "events"
  | "cp"
  | "chartInfo"
  | "legend"
  | "notes"
  | "geodetic"
  | "equipment"
  | "scale"
  | "keyplan"
  | "titleBlock"
  | "logo"
  | "text";

export type ScaleBarStyle =
  | "blocks"
  | "stepLine"
  | "stepBold"
  | "fillLine"
  | "doubleOutline"
  | "checker"
  | "ticks"
  | "blocksTicks"
  | "subBar"
  | "subChecker"
  | "stepBlocks";

export const SCALE_BAR_STYLES: {
  id: ScaleBarStyle;
  label: string;
  note: string;
}[] = [
  {
    id: "blocks",
    label: "Alternating blocks",
    note: "Black and white blocks (the original look)",
  },
  {
    id: "stepLine",
    label: "Stepped line",
    note: "One thin line stepping up and down at every division",
  },
  {
    id: "stepBold",
    label: "Alternating bold line",
    note: "Bold strokes, alternately high and low",
  },
  {
    id: "fillLine",
    label: "Thin bar, alternate fill",
    note: "A slim bar, every other division filled",
  },
  {
    id: "doubleOutline",
    label: "Double outline bar",
    note: "Outlined two-row bar, alternate divisions split",
  },
  {
    id: "checker",
    label: "Two-row chequer",
    note: "Two rows of blocks, black and white swapped",
  },
  {
    id: "ticks",
    label: "Line with ticks",
    note: "Single line with ticks, the first division subdivided",
  },
  {
    id: "blocksTicks",
    label: "Blocks with ticks",
    note: "Alternating blocks with ticks below",
  },
  {
    id: "subBar",
    label: "Subdivided bar",
    note: "Alternating bar, the first division split in four",
  },
  {
    id: "subChecker",
    label: "Subdivided two-row chequer",
    note: "Two-row chequer, the first division split in four",
  },
  {
    id: "stepBlocks",
    label: "Stepped blocks",
    note: "Bold blocks stepping up and down, the first division split",
  },
];

/** Older files used other names for some styles. */
export const scaleBarStyleOf = (s?: string): ScaleBarStyle =>
  (
    ({
      outline: "blocksTicks",
      stepped: "stepBlocks",
      line: "ticks",
      ruler: "ticks",
    }) as Record<string, ScaleBarStyle>
  )[s ?? ""] ??
  (SCALE_BAR_STYLES.some((x) => x.id === s) ? (s as ScaleBarStyle) : "blocks");

export type TitlePosition = "above" | "inside" | "none";

export interface EventRow {
  id: string;
  label: string;
  /** Event codes drawn in this row, comma separated, `*` wildcard. Unset: guessed from the label. */
  codes?: string;
  /** Draw only `text` across the row, not events. */
  textOnly?: boolean;
  text?: string;
  textAlign?: "start" | "middle" | "end";
  /** Print the video start and end of the product from the Video timing list. Unset: rows labelled VIDEO do. */
  video?: boolean;
  /** Product key for a video row (UMB1); unset picks the one named in the drawing number or folder. */
  videoProduct?: string;
  /** Typed over the automatic video text, for every chart. */
  videoText?: string;
  /** Typed over it for single charts (chart number from 0). */
  videoTexts?: Record<number, string>;
  /** Where a video row takes its times from: the events' time stamps (survey sessions along KP) or the Video timing list. Unset: the events when they carry times. */
  videoSource?: "events" | "timing" | "user";
  /** User defined timing lines: KP span (metres) and the text printed on it. */
  userTimes?: { id: string; k0: number; k1: number; text: string }[];
  /** A pause in the event log longer than this (minutes) starts a new session. */
  sessionGap?: number;
  /** KP span the user set for a survey session (metres), keyed by the session's start time. */
  sessionKp?: Record<string, { k0?: number; k1?: number }>;
  /** Zebra stripe: a coloured band behind the text along the row. */
  stripe?: boolean;
  stripeColor?: string;
  stripeOpacity?: number;
  /** Band thickness, mm (0 = a thin line in the middle); unset fills the row. */
  stripeWidth?: number;
  /** This row's own text look (title in the label column, and the text along the row); unset follows the panel. */
  titleFont?: Partial<RowFont>;
  font?: Partial<RowFont>;
}

/** Text look for event rows: family, cap height (mm), colour, bold, italic. */
export interface RowFont {
  family: string;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
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
  /** Where a text panel's text sits inside the panel: mm from its top-left corner; unset: all of it. */
  bodyBox?: { x: number; y: number; w: number; h: number };
  /** Section panels (legend, notes, ...) belong to a container such as Chart Information. */
  parentId?: string;
  /** Font for this panel's text; unset: the sheet's font. */
  fontFamily?: string;
  /** Scale panel: how the scale bars are drawn. */
  scaleBarStyle?: ScaleBarStyle;
  /** KP-aligned panels share the plan view's horizontal extent and scale. */
  kpAligned?: boolean;
  /** Vertical KP lines in the profile and CP panels (default on). */
  kpLines?: boolean;
  /** Colour of the KP lines in the profile and CP panels; unset: the sheet's ink. */
  kpGridColor?: string;
  /** KP values along the foot of the profile and CP panels (default on). */
  kpLabels?: boolean;
  /** Longitudinal and transverse profiles: a grid line with its KP label at the left edge, where the plan view's line starts (default on). */
  kpStartLine?: boolean;
  /** Vertical grid lines added by the user, drawn on every chart whose stretch they fall in. */
  kpGrid?: PanelKpLine[];
  locked?: boolean;
  /** Free text body shown inside the panel (notes, geodetic parameters, ...). May contain {TOKENS}. */
  body?: string;
  /** Engineering events / CP rows. */
  rows?: EventRow[];
  /** Width of the row label column for row-based panels. */
  labelWidth?: number;
  /** Events panel: text look of every row's title and of the text along the rows. */
  rowTitleFont?: Partial<RowFont>;
  rowFont?: Partial<RowFont>;
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
  /** Replaces the "N" under the north arrow. */
  northText?: string;
  /** Matchlines marking where neighbouring charts begin and end (unset = off). */
  match?: Partial<MatchlineStyle>;
  /** Text boxes with a leader arrow pointing at a coordinate (tie-in points, structures). */
  callouts?: Callout[];
}

/** One line of a text box: the arrow's easting or northing, or a typed value (heading, depth...). */
export interface CalloutRow {
  id: string;
  label: string;
  kind: "e" | "n" | "text";
  /** Typed value for "text" lines. */
  value: string;
  /** Printed after the value: m, °G... */
  suffix: string;
}

/** A plan view text box: a coloured title band, the coordinates it points at, and an arrow. */
export interface Callout {
  id: string;
  /** The chart (from 0) it was added on; unset: shown on every chart. */
  chart?: number;
  /** Title band text; new lines allowed. */
  title: string;
  /** Grid coordinates the arrow points at. */
  e: number;
  n: number;
  /** Typed by the user, e.g. "213.0°G"; empty leaves the line out. */
  heading: string;
  showEN: boolean;
  /** Box top-left corner from the arrow point, paper mm. */
  dx: number;
  dy: number;
  /** Box size, paper mm; no height = just tall enough for every line. */
  w: number;
  h?: number;
  /** The lines under the title; unset: easting, northing and heading. */
  rows?: CalloutRow[];
  font?: string;
  /** Cap height of the texts, mm. */
  size: number;
  titleColor: string;
  titleFill: string;
  textColor: string;
  fill: string;
  border: string;
  arrow: string;
}

/** Matchlines of the plan view, like AutoChart's Create Matchlines. */
export interface MatchLabel {
  /** Replaces the generated "Matchline to ..." wording. */
  text?: string;
  /** Moved from its place by this much on the sheet, mm. */
  dx?: number;
  dy?: number;
  size?: number;
  color?: string;
  hidden?: boolean;
  /** Text turned 180°. */
  flip?: boolean;
}

/** A matchline the user picked or drew in the key plan, between chart i and chart i + 1. */
export interface MatchPair {
  /** KP in metres where the line crosses the route. */
  kp: number;
  /** A line drawn by the user: its two ends in grid metres. Unset: square to the route. */
  a?: [number, number];
  b?: [number, number];
}

export interface MatchlineStyle {
  on: boolean;
  /** Other panels (long profile, events, CP) that also show the matchlines, keyed by panel id. */
  panels?: Record<string, boolean>;
  /** Picked or drawn matchlines, keyed by the 0-based index i of the boundary between chart i and i + 1. */
  pairs?: Record<string, MatchPair>;
  /** Text turned 180° (reads from the other side). */
  flip?: boolean;
  /** Edits of single labels, keyed `chartNumber-neighbourNumber`. */
  labels?: Record<string, MatchLabel>;
  /** 'overlap': where the neighbouring charts start and end inside this one. 'profile': this chart's own start and end KP. */
  mode: "overlap" | "profile";
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

/** The label across the current chart's box in the key plan. */
export interface ThisChartStyle {
  /** Shown unless false. */
  on?: boolean;
  text?: string;
  family?: string;
  /** Cap height, mm; unset follows the size of the box. */
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** Degrees clockwise on paper; unset runs along the box's long side. */
  rot?: number;
}

/** Hatching of the current chart's box in the key plan. */
export interface BoxHatch {
  on: boolean;
  pattern: "diagonal" | "cross" | "horizontal" | "vertical" | "dots" | "solid";
  color: string;
  /** Distance between hatch lines, mm. */
  spacing: number;
  /** 0 to 1. */
  opacity: number;
}

/** Look of the easting or northing labels on the key plan grid. */
export interface CoordLabelStyle {
  family?: string;
  color?: string;
  /** Cap height in mm; 0 or unset fits the box. */
  size?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface KeyplanStyle {
  eastingLabels?: CoordLabelStyle;
  northingLabels?: CoordLabelStyle;
  thisChart?: ThisChartStyle;
  hatch?: BoxHatch;
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
  /** Draw the matchlines (where neighbouring charts meet) across the route. */
  showMatchlines?: boolean;
  /** Zoomed and moved view: centre (grid E, N) and width in metres; unset fits the line and charts. */
  view?: { cE: number; cN: number; w: number };
}

export interface TextStyle {
  /** Cap height in mm. */
  size: number;
  bold?: boolean;
  italic?: boolean;
  align?: "start" | "middle" | "end";
  /** Vertically centre the text inside the panel. */
  vcenter?: boolean;
}

export type LegendGroup = "plan" | "long" | "trans" | "cp" | "status";

export type LegendSymbol =
  | "kpMarker"
  | "line"
  | "thinLine"
  | "dashed"
  | "dashedThick"
  | "doubleLine"
  | "matchline"
  | "assetBlob"
  | "seabedProfile"
  | "cpStab"
  | "burial"
  | "freespan"
  | "box"
  | "circle"
  | "pipeBand"
  | "drawing";

/** A drawing object turned into a legend symbol: lines centred on 0 with the longer side 1 (x right, y down). */
export interface LegendShape {
  lines: number[][];
  /** The colour each line has in the drawing. */
  colors: string[];
  /** The width each line is drawn with in the plan view, mm. */
  widths?: number[];
}

export interface LegendItem {
  id: string;
  /** The chart (from 0) it was added on; unset: shown on every chart. */
  chart?: number;
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
  /** Linked event symbols: bold bar place, colour and pattern. */
  boldPos?: "top" | "middle" | "bottom";
  boldColor?: string;
  boldDash?: boolean;
  /** A symbol taken from a drawing object (symbol "drawing"): its lines, size (mm) and turn (degrees). */
  shape?: LegendShape;
  size?: number;
  rot?: number;
  /** Draw it in the colours it has in the drawing instead of the item's colour. */
  keepColours?: boolean;
  /** Line width of a drawing symbol, mm; unset: as in the plan view. */
  lineWidth?: number;
  /** Symbol size as a factor of the standard one (symbols other than drawing objects). */
  scale?: number;
  /** Dash pattern of a line symbol in mm ("" = solid); unset: the symbol's own. */
  dash?: string;
}

/** What the user can change about a legend symbol (kept per item; for data lines under their key). */
export type SymbolLook = Pick<
  LegendItem,
  | "symbol"
  | "color"
  | "fill"
  | "outline"
  | "size"
  | "rot"
  | "scale"
  | "lineWidth"
  | "dash"
  | "boldPos"
  | "boldColor"
  | "boldDash"
  | "keepColours"
>;

/**
 * How an event code's definition is written from the imported events: columns of the file
 * (`c:<n>`), the code (`code`), its group and subgroup (`group`, `sub`, split at the dot),
 * the value column (`value`), or the user's own text (`t:<text>`), joined by the connector.
 */
export interface CodeDefSpec {
  parts: string[];
  prefix: string;
  suffix: string;
  connector: string;
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
  codeScope?: "all" | "chart";
  /** The user's own wording of a code's definition, by code. */
  codeEdits?: Record<string, string>;
  /** Definitions written from the imported file's columns instead of the value column. */
  codeDef?: CodeDefSpec;
  /** Codes left out of the definitions. */
  codeHidden?: string[];
  /** Heading wording, by group; unset keeps the standard heading. */
  headings?: Partial<Record<LegendGroup | "codes", string>>;
}

/** A legend panel's items built from the imported data: on/off, and the user's wording per item. */
export interface LegendData {
  on: boolean;
  /** Keyed by the item's data key: new wording, or hidden. */
  overrides: Record<
    string,
    { label?: string; hidden?: boolean } & Partial<SymbolLook>
  >;
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

export type RevisionColumn = Exclude<keyof RevisionRow, "id">;

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
  anchor: "start" | "middle" | "end";
  bold?: boolean;
  rotation?: number;
  color?: string;
  fontFamily?: string;
}

export interface ScaleSettings {
  /** Horizontal (plan and KP) scale denominator, e.g. 5000 for 1:5,000. */
  horizontal: number;
  /** KP panels draw a KP at its distance along the line at the horizontal scale (default); false: at the x it has in the plan view. */
  trueKpScale?: boolean;
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
  /** One straight part of a curved stretch (older "Fit to curved line"): the KP panels and title cover only start to end. */
  part?: boolean;
  /**
   * "Fit to curved line": KPs (m) where the chart turns to a new straight segment. The
   * plan view and the panels below are cut into side-by-side segments, each turned to
   * follow its stretch of line, at the chart's scale.
   */
  segments?: number[];
}

export interface PaperSettings {
  size: PaperSizeName;
  orientation: "landscape" | "portrait";
  width: number;
  height: number;
  /** Inset of the outer drawing frame from the paper edge. */
  frameInset: number;
}

export type PaperSizeName = "A0" | "A1" | "A2" | "A3" | "A4" | "Custom";

export type ChartKind = "alignment" | "northUp";

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
  /**
   * Text that applies to one chart only ("Only this chart" when editing), by chart index
   * from 0: field values, and panel texts by panel id (the right column as "<id>#2").
   */
  chartText?: Record<string, ChartText>;
  updatedAt?: string;
}

/** A vertical grid line the user added: at the left or right end of the data, or at a KP (m). */
export interface PanelKpLine {
  at: "left" | "right" | "kp";
  kp?: number;
}

export interface ChartText {
  fields?: Record<string, string>;
  bodies?: Record<string, string>;
}

export type Selection = { kind: "panel" | "text" | "image"; id: string };
