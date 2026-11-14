import type { Linework } from "./dxf";
import type { Route } from "./route";
import type { CrossProfile } from "./crossProfile";

/** Where an imported file goes. */
export type ImportTarget =
  | "route"
  | "asbuilt"
  | "plan"
  | "long"
  | "trans"
  | "events"
  | "cp"
  | "logo"
  | "siteplan";

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
  {
    key: "plan",
    label: "Plan view",
    exts: ["dxf", "dwg"],
    panelType: "plan",
    hint: "Background drawing: assets, other lines, seabed features.",
  },
  {
    key: "long",
    label: "Longitudinal Profile",
    exts: ["csv", "txt", "xlsx", "long"],
    panelType: "longProfile",
    hint: "Listing with KP, top and bottom of pipe, and seabed columns.",
  },
  {
    key: "trans",
    label: "Transverse Profile",
    exts: ["csv", "txt", "xlsx"],
    panelType: "transProfile",
    hint: "VisualWorks Cross-Profile RAW export from NaviModel.",
  },
  {
    key: "events",
    label: "Engineering Events",
    exts: ["csv", "txt", "xlsx", "xls"],
    panelType: "events",
    hint: "Event code, KP and description columns.",
  },
  {
    key: "cp",
    label: "Cathodic Protection",
    exts: ["csv", "txt", "xlsx", "xls"],
    panelType: "cp",
    hint: "KP and CP reading (mV) columns.",
  },
  {
    key: "siteplan",
    label: "Key Plan",
    exts: ["dxf", "dwg"],
    panelType: "keyplan",
    hint: "Site plan drawing behind the key plan.",
  },
  {
    key: "asbuilt",
    label: "As Built survey line",
    exts: ["dxf", "dwg", "dig", "csv", "txt", "xyz"],
    panelType: "plan",
    hint: "Surveyed pipe position, drawn in the plan view.",
  },
  {
    key: "route",
    label: "Runline",
    exts: ["rlx", "rlxp", "dxf", "dwg"],
    panelType: "plan",
    hint: "Sets KP 0 and the KP blocks, and the number of charts.",
  },
  {
    key: "logo",
    label: "Logo image",
    exts: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
    panelType: "logo",
    hint: "Company, contractor or data acquired by.",
  },
];

export const targetInfo = (k: ImportTarget) =>
  TARGETS.find((t) => t.key === k)!;
export const extOf = (name: string) =>
  name.split(".").pop()?.toLowerCase() ?? "";
export const targetsFor = (name: string) =>
  TARGETS.filter((t) => t.exts.includes(extOf(name)));

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
  /** Line width on paper, mm; unset uses the profile's line width (or the pipe outline width). */
  width?: number;
}

export interface EventRecord {
  /** KP in metres. */
  kp: number;
  code: string;
  value: string;
  /** Freespan / burial listings: length and height (m) carried on the start record. */
  length?: number;
  height?: number;
}

/** Text look for data drawn on the sheet. */
export interface DataFont {
  family: string;
  /** Cap height, mm. */
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
}

export const DEFAULT_FONT: DataFont = {
  family: "Arial",
  size: 1.3,
  color: "#111111",
};
export const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Calibri",
  "Segoe UI",
  "Tahoma",
  "Verdana",
  "Times New Roman",
  "Courier New",
  "Consolas",
];

export type LabelPos = "top" | "bottom" | "none";

/**
 * Two codes drawn as one linked event (freespan start → end): end lines joined by
 * a bar, the length above it and the height below, by default.
 */
export interface EventLink {
  start: string;
  end: string;
  color: string;
  /** Legend wording, e.g. "Flowline Status - Freespan". */
  label: string;
  lengthPos: LabelPos;
  heightPos: LabelPos;
  /** Where the bar sits in the row, as a fraction of its height from the top (0.5 = the middle). */
  barPos?: number;
  /** Bar thickness, mm; unset follows the row height. */
  barHeight?: number;
  /** Gap between the bar and its length / height text, and the margin kept from the row's lines, mm. */
  textGap?: number;
  /** Length of the end lines as a fraction of the row height, centred on the bar. */
  lineExtent?: number;
}

/** Where the marks and codes of single events sit in their row. */
export interface EventLayout {
  /** Tick from the row's foot, or standing in the middle of the row. */
  markPos: "foot" | "middle";
  /** Tick length as a fraction of the row height. */
  markLen: number;
  /** Gap between a tick and its code, mm. */
  labelGap: number;
  /** Turn of the codes, degrees anticlockwise from horizontal (90 = reading upward). */
  labelRotation: number;
}

export const DEFAULT_EVENT_LAYOUT: EventLayout = {
  markPos: "foot",
  markLen: 0.25,
  labelGap: 0.4,
  labelRotation: 90,
};

export const newLink = (start = "FS.FS", end = "FS.FE"): EventLink => ({
  start,
  end,
  color: /B/.test(start.split(".")[1] ?? "") ? "#7f9cff" : "#7fbfff",
  label: /B/.test(start.split(".")[1] ?? "")
    ? "Flowline Status - Burial"
    : "Flowline Status - Freespan",
  lengthPos: "top",
  heightPos: "bottom",
  barPos: 0.5,
  textGap: 0.6,
  lineExtent: 0.8,
});

export type CpSymbol =
  | "tick"
  | "circle"
  | "circleFill"
  | "square"
  | "squareFill"
  | "triangle"
  | "triangleFill"
  | "diamond"
  | "diamondFill";
export const CP_SYMBOLS: Record<CpSymbol, string> = {
  tick: "Tick only",
  circle: "Circle",
  circleFill: "Circle, filled",
  square: "Square",
  squareFill: "Square, filled",
  triangle: "Triangle",
  triangleFill: "Triangle, filled",
  diamond: "Diamond",
  diamondFill: "Diamond, filled",
};

/** Where and how CP readings are drawn in their panel. */
export interface CpLook {
  /** Height of the readings in the panel as a fraction from the top (0.5 = the middle). */
  posY: number;
  /** Symbol size (diameter or side), mm. */
  symbolSize: number;
  /** A stem from the symbol down to the panel's foot. */
  stem: boolean;
  showText: boolean;
  /** Gap between the symbol and its reading, mm. */
  textGap: number;
  /** Turn of the readings, degrees anticlockwise from horizontal (90 = reading upward). */
  textRotation: number;
  /** Written after each value. */
  suffix: string;
  /** Where the reading sits around the symbol, as on a clock face: 12 above, 3 right, 6 below, 9 left. */
  textClock: number;
  /** 'fixed': every symbol at one height in the panel. 'value': each at the height of its reading on a vertical mV axis. */
  yMode: "fixed" | "value";
  /** mV axis range for 'value' (null: from the data). Values are as imported (negative stays negative). */
  yMin: number | null;
  yMax: number | null;
  /** Spacing of the axis labels and grid lines, mV (0 = chosen from the range). */
  yStep: number;
  /** Write the mV values along the left edge of the panel. */
  yLabels: boolean;
  /** Horizontal grid lines across the panel at the axis steps. */
  yGrid: boolean;
  /** Axis labels without the minus sign (-1046 reads 1046), as on AutoChart sheets. */
  yAbs: boolean;
}

export const DEFAULT_CP_LOOK: CpLook = {
  posY: 0.5,
  symbolSize: 1.2,
  stem: false,
  showText: true,
  textGap: 0.6,
  textRotation: 0,
  suffix: " mV",
  textClock: 3,
  yMode: "fixed",
  yMin: null,
  yMax: null,
  yStep: 0,
  yLabels: true,
  yGrid: false,
  yAbs: true,
};

/** One CP reading as drawn; the fields after `mv` override the dataset's look for this reading only. */
export interface CpPoint {
  /** KP in metres. */
  kp: number;
  mv: number;
  /** Height in the panel, fraction from the top (fixed mode). */
  y?: number;
  /** Text instead of the value. */
  text?: string;
  color?: string;
  /** Symbol size, mm. */
  size?: number;
  textClock?: number;
}

/** A free text in the CP panel. */
export interface CpNote {
  kp: number;
  /** Fraction from the top of the panel. */
  y: number;
  text: string;
  /** Cap height, mm. */
  size?: number;
  color?: string;
  rot?: number;
}

/**
 * Longitudinal profile setup, after AutoChart's Create Profile dialog: which way
 * the values point, where the profile sits in the panel, the depth grid and hatching.
 */
export interface LongOpts {
  /** 'depth': positive values are depths (+ down), 'level': elevations (+ up, depths negative), 'auto': by the sign of the data. */
  zSense: "auto" | "depth" | "level";
  /** Draw every line as its offset from the top of pipe (TOP becomes the zero line). */
  normalise: boolean;
  placement: "upper" | "middle" | "lower";
  /** Value at the top of the depth axis; null lets the placement decide. */
  forceTop: number | null;
  /** Depth grid (metres; 0 = chosen from the scale). */
  gridLine: number;
  gridLabel: number;
  majorTick: number;
  minorTick: number;
  /** Major tick length on paper, mm; minor ticks are half of it. */
  tickLen: number;
  suffix: string;
  axisSide: "left" | "right" | "both";
  /** Line width of the seabed lines on paper, mm. */
  lineWidth: number;
  /** Line width of the TOP / BOP outline, mm. */
  pipeWidth: number;
  hatchPipe: boolean;
  hatchSea: boolean;
  seaColor: string;
  /** Name of the line to hatch under (the seabed); '' for none. */
  hatchBelow: string;
  belowColor: string;
  /** Leave out the label at the ends of the depth axis. */
  omitEndLabels: boolean;
  /** Divide the profile where it would leave the panel, each part with its own depth window. */
  cut: boolean;
  /** Depth step the windows move by when cut, metres. */
  cutStep: number;
}

export const DEFAULT_LONG_OPTS: LongOpts = {
  zSense: "auto",
  normalise: false,
  placement: "middle",
  forceTop: null,
  gridLine: 0,
  gridLabel: 0,
  majorTick: 0,
  minorTick: 0,
  tickLen: 1.5,
  suffix: "m",
  axisSide: "both",
  lineWidth: 0.2,
  pipeWidth: 0.3,
  hatchPipe: true,
  hatchSea: false,
  seaColor: "#e6f2fb",
  hatchBelow: "",
  belowColor: "#e8dcc0",
  omitEndLabels: false,
  cut: false,
  cutStep: 1,
};

/** Per-layer choices of a drawing in the plan view: colour and on/off. */
export interface LayerOverride {
  /** Own colour instead of the drawing's. */
  color?: string;
  /** true: hidden; false: shown even if the drawing has the layer off; unset: as the drawing. */
  hidden?: boolean;
}

/** How a drawing (DXF / DWG) is shown: its own colours, layers on and off, and its text look. */
export interface LineworkLook {
  /** Keep the colours of the drawing; off draws everything in the data colour. */
  drawingColours: boolean;
  layers: Record<string, LayerOverride>;
  /** Text font; '' keeps the sheet font. */
  textFamily: string;
  textBold: boolean;
  textItalic: boolean;
  /** One colour for all text; '' keeps each text's own colour. */
  textColor: string;
  /** Turn added to every text, degrees anticlockwise. */
  textRotation: number;
  /** Turn text that would read upside down on paper the right way up. */
  textUpright: boolean;
}

export const DEFAULT_LINEWORK_LOOK: LineworkLook = {
  drawingColours: true,
  layers: {},
  textFamily: "",
  textBold: false,
  textItalic: false,
  textColor: "",
  textRotation: 0,
  textUpright: true,
};

/** How DXF text is sized on paper: with the map, with the map but kept readable, or one fixed height. */
export type TextMode = "auto" | "drawn" | "fixed";

export type Dataset =
  /** `before`: any part of the runline before KP 0, drawn but not charted. */
  | (Base & {
      kind: "route";
      route: Route;
      before?: Float64Array;
      width: number;
    })
  | (Base & {
      kind: "linework";
      lw: Linework;
      width: number;
      textMode: TextMode;
      textScale: number;
      textHeight: number;
      both?: boolean;
    } & LineworkLook)
  /** Pipe drawn between the top and bottom series; the rest are seabed lines. */
  | (Base & {
      kind: "long";
      kp: Float64Array;
      series: LongSeries[];
      top?: number;
      bop?: number;
      fill: string;
      opts?: LongOpts;
    })
  /** Profiles sorted by KP; one is drawn every `every` metres (0: chosen from the scale). */
  | (Base & {
      kind: "trans";
      kp: Float64Array;
      profiles: CrossProfile[];
      every: number;
      pipeColor: string;
      pipeFill: string;
      /** Draw the pipe as a true circle at the lateral scale, whatever the vertical scale. */ pipeRound?: boolean;
    })
  | (Base & {
      kind: "events";
      records: EventRecord[];
      labels: boolean;
      font: DataFont;
      links: EventLink[];
      layout?: EventLayout;
    })
  | (Base & {
      kind: "cp";
      kp: Float64Array;
      mv: Float64Array;
      style: "line" | "ticks";
      font: DataFont;
      symbol: CpSymbol;
      look?: CpLook;
      /** Readings once edited by hand; kp and mv follow them. */ pts?: CpPoint[];
      notes?: CpNote[];
    });

/** Look settings the import window can set before a dataset exists. */
export type DataStyle = Partial<{
  color: string;
  width: number;
  fill: string;
  pipeColor: string;
  pipeFill: string;
  font: DataFont;
  links: EventLink[];
  symbol: CpSymbol;
  labels: boolean;
  long: LongOpts;
  layout: EventLayout;
  cp: CpLook;
}>;

export const SERIES_COLOURS = [
  "#16a34a",
  "#2563eb",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#64748b",
];

type LineworkSet = Extract<Dataset, { kind: "linework" }>;

/** Drawings shown in a plan panel: plan data, plus site plans also asked for there (and the reverse for the key plan). */
export function lineworkFor(
  datasets: Dataset[],
  where: "plan" | "siteplan",
): LineworkSet[] {
  return datasets.filter(
    (d): d is LineworkSet =>
      d.kind === "linework" &&
      d.visible &&
      (d.target === where ||
        (where === "plan" && d.target === "asbuilt") ||
        !!d.both),
  );
}
