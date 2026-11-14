import { ColourBox } from "./ColourBox";
import {
  CP_SYMBOLS,
  DEFAULT_CP_LOOK,
  DEFAULT_EVENT_LAYOUT,
  DEFAULT_FONT,
  DEFAULT_LONG_OPTS,
  type CpLook,
  type EventLayout,
  type LongOpts,
  FONT_FAMILIES,
  newLink,
  type CpSymbol,
  type DataFont,
  type DataStyle,
  type Dataset,
  type EventLink,
  type ImportTarget,
  type LabelPos,
} from "../model/datasets";
import { useEffect, useState } from "react";
import { DEFAULT_COLOURS } from "../model/importers";
import { formatScale } from "../model/scale";
import type { ScaleSettings } from "../model/types";
import { useEditor } from "../state/store";

/** Look of a new dataset before it is imported. */
export function defaultStyle(target: ImportTarget): DataStyle {
  const color = DEFAULT_COLOURS[target] ?? "#8a8a8a";
  switch (target) {
    case "route":
    case "asbuilt":
      return { color, width: 0.35 };
    case "plan":
    case "siteplan":
      return { color, width: 0.18 };
    case "long":
      return { color: "#e00000", fill: "#6b6b6b" };
    case "trans":
      return { color, pipeColor: "#e00000", pipeFill: "#bdbdbd" };
    case "events":
      return {
        font: { ...DEFAULT_FONT },
        labels: true,
        layout: { ...DEFAULT_EVENT_LAYOUT },
      };
    case "cp":
      return {
        color: "#111111",
        symbol: "circle",
        font: { ...DEFAULT_FONT },
        cp: { ...DEFAULT_CP_LOOK },
      };
    default:
      return {};
  }
}

/** Settle the chosen look onto a freshly built dataset. */
export function applyStyle(d: Dataset, s: DataStyle): Dataset {
  switch (d.kind) {
    case "route":
      return { ...d, color: s.color ?? d.color, width: s.width ?? d.width };
    case "linework":
      return { ...d, color: s.color ?? d.color, width: s.width ?? d.width };
    case "long":
      return {
        ...d,
        fill: s.fill ?? d.fill,
        opts: s.long ?? d.opts,
        series: d.series.map((x, i) =>
          i === d.top || i === d.bop ? { ...x, color: s.color ?? x.color } : x,
        ),
      };
    case "trans":
      return {
        ...d,
        color: s.color ?? d.color,
        pipeColor: s.pipeColor ?? d.pipeColor,
        pipeFill: s.pipeFill ?? d.pipeFill,
      };
    case "events":
      return {
        ...d,
        font: s.font ?? d.font,
        labels: s.labels ?? d.labels,
        layout: s.layout ?? d.layout,
      };
    case "cp":
      return {
        ...d,
        color: s.color ?? d.color,
        symbol: s.symbol ?? d.symbol,
        font: s.font ?? d.font,
        look: s.cp ?? d.look,
      };
  }
}

/** The look of an existing dataset, in the shape the controls edit. */
export function styleOf(d: Dataset): DataStyle {
  switch (d.kind) {
    case "route":
    case "linework":
      return { color: d.color, width: d.width };
    case "long": {
      const pipe = d.top !== undefined ? d.series[d.top] : undefined;
      return { color: pipe?.color ?? "#e00000", fill: d.fill, long: d.opts };
    }
    case "trans":
      return { color: d.color, pipeColor: d.pipeColor, pipeFill: d.pipeFill };
    case "events":
      return {
        font: d.font,
        labels: d.labels,
        layout: d.layout ?? DEFAULT_EVENT_LAYOUT,
      };
    case "cp":
      return {
        color: d.color,
        symbol: d.symbol,
        font: d.font,
        cp: d.look ?? DEFAULT_CP_LOOK,
      };
  }
}

const Colour = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
}) => (
  <label className="field colour-field">
    <span>{label}</span>
    <ColourBox value={value} onChange={(c) => onChange(c)} />
  </label>
);

/** A number box that keeps what is typed until Enter or blur, so editing digits never fights the value. */
export function DraftNumber({
  value,
  step,
  min,
  onCommit,
  placeholder,
  disabled,
  className,
  title,
}: {
  className?: string;
  title?: string;
  value: number | "";
  step: number;
  min?: number;
  onCommit(v: number): void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ?? (value === "" ? "" : String(Math.round(value * 1000) / 1000));
  const commit = (txt: string) => {
    const v = parseFloat(txt.replace(",", "."));
    if (Number.isFinite(v) && (min === undefined || v >= min)) onCommit(v);
  };
  return (
    <input
      type="number"
      className={className}
      title={title}
      step={step}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) commit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null) commit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

const Num = ({
  label,
  value,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  suffix: string;
  onChange(v: number): void;
}) => (
  <label className="field">
    <span>{label}</span>
    <span className="with-suffix">
      <DraftNumber
        min={0}
        step={step}
        value={value}
        onCommit={(v) => v > 0 && onChange(v)}
      />
      <span className="suffix">{suffix}</span>
    </span>
  </label>
);

/** "1:200", "1 : 2,000" or just "200": the scale denominator, or NaN. */
export function parseScale(text: string): number {
  const m = text.replace(/[\s,]/g, "").match(/^(?:1:)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) : NaN;
}

/** A scale typed as 1:100, 1:200... committed on Enter or when the box loses focus. */
function ScaleInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  hint?: string;
}) {
  const [text, setText] = useState(formatScale(value));
  useEffect(() => setText(formatScale(value)), [value]);
  const commit = () => {
    const v = parseScale(text);
    if (v > 0) onChange(v);
    else setText(formatScale(value));
  };
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      <input
        className="scale-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder="1:200"
      />
    </label>
  );
}

/** Vertical exaggeration typed as a plain number (×25). */
function ExInput({
  value,
  onChange,
}: {
  value: number;
  onChange(v: number): void;
}) {
  const show = (v: number) => String(Number(v.toFixed(v < 10 ? 2 : 1)));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(/^[x×]/i, ""));
    if (v > 0) onChange(v);
    else setText(show(value));
  };
  return (
    <label className="field" title="Horizontal scale ÷ vertical scale">
      <span>Vertical exaggeration ×</span>
      <input
        className="scale-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

/** The template's profile scales, shared by every chart, edited from the data's look settings. */
function ProfileScales({ target }: { target: "long" | "trans" }) {
  const sc = useEditor((s) => s.template?.scale);
  if (!sc) return null;
  const set = (patch: Partial<ScaleSettings>) =>
    useEditor.getState().setScale(patch);
  if (target === "long") {
    const ex = sc.horizontal / Math.max(1, sc.verticalLong);
    return (
      <>
        <div className="style-row">
          <ScaleInput
            label="Vertical scale"
            value={sc.verticalLong}
            onChange={(verticalLong) => set({ verticalLong })}
            hint="Depth scale of the longitudinal profile, e.g. 1:200"
          />
          <ExInput
            value={ex}
            onChange={(x) =>
              set({
                verticalLong: Math.round((sc.horizontal / x) * 1000) / 1000,
              })
            }
          />
        </div>
        <p className="hint">
          As in AutoChart, exaggeration = horizontal scale ÷ vertical scale (
          {formatScale(sc.horizontal)} ÷ {formatScale(sc.verticalLong)}). Set
          either one. Shared by every chart.
        </p>
      </>
    );
  }
  const lat = sc.lateralTrans || sc.verticalTrans;
  const ex = lat / Math.max(1, sc.verticalTrans);
  return (
    <>
      <div className="style-row">
        <ScaleInput
          label="Vertical scale (depth)"
          value={sc.verticalTrans}
          onChange={(verticalTrans) => set({ verticalTrans })}
          hint="Scale of heights in each cross profile, e.g. 1:100"
        />
        <ScaleInput
          label="Lateral scale (scan width)"
          value={lat}
          onChange={(lateralTrans) => set({ lateralTrans })}
          hint="Scale of the scan width axis, e.g. 1:100"
        />
      </div>
      <p className="hint">
        <b>Vertical exaggeration ×{ex.toFixed(ex < 10 ? 1 : 0)}</b>
        {ex === 1 ? " (1:1, true shape)" : ""}. The vertical scale sets the
        depth axis and the lateral scale sets the scan width. Use the same value
        for both to draw the seabed at its true shape; a smaller vertical number
        exaggerates the heights.
      </p>
    </>
  );
}

/** AutoChart's Create Profile settings for the longitudinal profile. */
function LongSetup({
  opts,
  onChange,
  seriesNames,
}: {
  opts?: LongOpts;
  onChange(o: LongOpts): void;
  seriesNames: string[];
}) {
  const o = { ...DEFAULT_LONG_OPTS, ...opts };
  const set = (patch: Partial<LongOpts>) => onChange({ ...o, ...patch });
  const num = (
    label: string,
    key: "gridLine" | "gridLabel" | "majorTick" | "minorTick",
    hint: string,
  ) => (
    <label className="field" title={hint}>
      <span>{label}</span>
      <span className="with-suffix">
        <input
          type="number"
          min={0}
          step={0.5}
          value={o[key] || ""}
          placeholder="auto"
          onChange={(e) =>
            set({ [key]: Math.max(0, Number(e.target.value) || 0) })
          }
        />
        <span className="suffix">m</span>
      </span>
    </label>
  );
  return (
    <div className="long-setup">
      <div className="style-row">
        <label className="field">
          <span>Values in the file are</span>
          <select
            value={o.zSense}
            onChange={(e) =>
              set({ zSense: e.target.value as LongOpts["zSense"] })
            }
          >
            <option value="auto">Found from the data</option>
            <option value="depth">Depths (positive down)</option>
            <option value="level">Levels (positive up, depths negative)</option>
          </select>
        </label>
        <label className="field">
          <span>Profile placement</span>
          <select
            value={o.placement}
            disabled={o.forceTop !== null}
            onChange={(e) =>
              set({ placement: e.target.value as LongOpts["placement"] })
            }
          >
            <option value="upper">Upper</option>
            <option value="middle">Middle</option>
            <option value="lower">Lower</option>
          </select>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={o.forceTop !== null}
              onChange={(e) => set({ forceTop: e.target.checked ? 0 : null })}
            />{" "}
            Force grid start value
          </span>
          <input
            type="number"
            step={1}
            disabled={o.forceTop === null}
            value={o.forceTop ?? ""}
            onChange={(e) => set({ forceTop: Number(e.target.value) || 0 })}
            title="Value at the top of the depth axis"
          />
        </label>
      </div>
      <label
        className="check"
        title="Divide the profile wherever it would leave the panel; each part gets its own depth window, moved by whole depth steps (AutoChart cuts and repositions the same way)"
      >
        <input
          type="checkbox"
          checked={o.cut}
          onChange={(e) => set({ cut: e.target.checked })}
        />
        Cut and divide the profile when it leaves the panel
      </label>
      {o.cut && (
        <label className="field">
          <span>Depth step between parts</span>
          <span className="with-suffix">
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={o.cutStep}
              onChange={(e) =>
                Number(e.target.value) > 0 &&
                set({ cutStep: Number(e.target.value) })
              }
            />
            <span className="suffix">m</span>
          </span>
        </label>
      )}
      <label
        className="check"
        title="Leave out the depth label at the top and bottom of the axis"
      >
        <input
          type="checkbox"
          checked={o.omitEndLabels}
          onChange={(e) => set({ omitEndLabels: e.target.checked })}
        />
        Omit the axis end labels
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.normalise}
          onChange={(e) => set({ normalise: e.target.checked })}
        />
        Normalise profile on top of pipe (TOP is the zero line; seabed drawn as
        its offset from the pipe)
      </label>
      <div className="style-row">
        {num(
          "Grid line every",
          "gridLine",
          "Depth interval of the dotted grid lines",
        )}
        {num("Label every", "gridLabel", "Depth interval of the axis labels")}
        {num(
          "Major tick every",
          "majorTick",
          "Depth interval of the major ticks",
        )}
        {num(
          "Minor tick every",
          "minorTick",
          "Depth interval of the minor ticks (half the major length)",
        )}
      </div>
      <div className="style-row">
        <Num
          label="Major tick length"
          value={o.tickLen}
          step={0.5}
          suffix="mm"
          onChange={(tickLen) => set({ tickLen })}
        />
        <label className="field">
          <span>Label suffix</span>
          <input
            value={o.suffix}
            onChange={(e) => set({ suffix: e.target.value })}
            style={{ width: 60 }}
          />
        </label>
        <label className="field">
          <span>Depth axis on</span>
          <select
            value={o.axisSide}
            onChange={(e) =>
              set({ axisSide: e.target.value as LongOpts["axisSide"] })
            }
          >
            <option value="both">Both sides</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <Num
          label="Seabed line width"
          value={o.lineWidth}
          step={1}
          suffix="mm"
          onChange={(lineWidth) => set({ lineWidth })}
        />
        <Num
          label="Pipe outline width"
          value={o.pipeWidth}
          step={1}
          suffix="mm"
          onChange={(pipeWidth) => set({ pipeWidth })}
        />
      </div>
      <div className="style-row">
        <label className="check">
          <input
            type="checkbox"
            checked={o.hatchPipe}
            onChange={(e) => set({ hatchPipe: e.target.checked })}
          />
          Hatch pipe (between TOP and BOP)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={o.hatchSea}
            onChange={(e) => set({ hatchSea: e.target.checked })}
          />
          Hatch background (sea)
        </label>
        {o.hatchSea && (
          <ColourBox
            value={o.seaColor}
            title="Sea colour"
            onChange={(seaColor) => set({ seaColor })}
          />
        )}
      </div>
      <div className="style-row">
        <label className="field">
          <span>Hatch below profile</span>
          <select
            value={o.hatchBelow}
            onChange={(e) => set({ hatchBelow: e.target.value })}
          >
            <option value="">None</option>
            {[
              ...new Set([
                ...seriesNames,
                ...(o.hatchBelow ? [o.hatchBelow] : []),
              ]),
            ].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {o.hatchBelow && (
          <Colour
            label="Seabed hatch colour"
            value={o.belowColor}
            onChange={(belowColor) => set({ belowColor })}
          />
        )}
      </div>
    </div>
  );
}

/** Colour, width, fill, symbol and font controls for one kind of data. */
export function StyleControls({
  target,
  style,
  onChange,
  seriesNames = [],
}: {
  target: ImportTarget;
  style: DataStyle;
  onChange(patch: DataStyle): void;
  seriesNames?: string[];
}) {
  const s = { ...defaultStyle(target), ...style };
  const lineish =
    target === "route" ||
    target === "asbuilt" ||
    target === "plan" ||
    target === "siteplan";
  return (
    <div className="style-controls">
      {lineish && (
        <div className="style-row">
          <Colour
            label="Line colour"
            value={s.color!}
            onChange={(color) => onChange({ color })}
          />
          <Num
            label="Line width"
            value={s.width!}
            step={1}
            suffix="mm"
            onChange={(width) => onChange({ width })}
          />
        </div>
      )}
      {target === "long" && (
        <div className="style-row">
          <Colour
            label="Pipe outline (TOP / BOP)"
            value={s.color!}
            onChange={(color) => onChange({ color })}
          />
          <Colour
            label="Pipe fill"
            value={s.fill!}
            onChange={(fill) => onChange({ fill })}
          />
        </div>
      )}
      {target === "long" && (
        <LongSetup
          opts={s.long}
          seriesNames={seriesNames}
          onChange={(long) => onChange({ long })}
        />
      )}
      {(target === "long" || target === "trans") && (
        <ProfileScales target={target} />
      )}
      {target === "trans" && (
        <div className="style-row">
          <Colour
            label="Raw points"
            value={s.color!}
            onChange={(color) => onChange({ color })}
          />
          <Colour
            label="Pipe outline"
            value={s.pipeColor!}
            onChange={(pipeColor) => onChange({ pipeColor })}
          />
          <Colour
            label="Pipe fill"
            value={s.pipeFill!}
            onChange={(pipeFill) => onChange({ pipeFill })}
          />
        </div>
      )}
      {target === "cp" && (
        <div className="style-row">
          <Colour
            label="Tick and symbol"
            value={s.color!}
            onChange={(color) => onChange({ color })}
          />
          <label className="field">
            <span>Symbol</span>
            <select
              value={s.symbol}
              onChange={(e) => onChange({ symbol: e.target.value as CpSymbol })}
            >
              {Object.entries(CP_SYMBOLS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(target === "events" || target === "cp") && (
        <FontControls
          font={s.font ?? DEFAULT_FONT}
          onChange={(font) => onChange({ font })}
        />
      )}
      {target === "events" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={s.labels ?? true}
              onChange={(e) => onChange({ labels: e.target.checked })}
            />
            Label single events with their code
          </label>
          <EventLayoutControls
            layout={s.layout ?? DEFAULT_EVENT_LAYOUT}
            onChange={(layout) => onChange({ layout })}
          />
        </>
      )}
      {target === "cp" && (
        <CpLookControls
          look={s.cp ?? DEFAULT_CP_LOOK}
          onChange={(cp) => onChange({ cp })}
        />
      )}
    </div>
  );
}

/** A number box that keeps any value typed (0 and negatives included) and commits on change. */
function Any({
  label,
  value,
  step,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  suffix: string;
  min?: number;
  max?: number;
  onChange(v: number): void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="with-suffix">
        <DraftNumber
          step={step}
          min={min}
          value={Number.isFinite(value) ? value : 0}
          onCommit={(v) => (max === undefined || v <= max) && onChange(v)}
        />
        <span className="suffix">{suffix}</span>
      </span>
    </label>
  );
}

/** Where single events' ticks and codes sit in their row. */
function EventLayoutControls({
  layout,
  onChange,
}: {
  layout: EventLayout;
  onChange(l: EventLayout): void;
}) {
  const set = (patch: Partial<EventLayout>) =>
    onChange({ ...layout, ...patch });
  return (
    <div className="style-row">
      <label className="field">
        <span>Tick position</span>
        <select
          value={layout.markPos}
          onChange={(e) =>
            set({ markPos: e.target.value as EventLayout["markPos"] })
          }
        >
          <option value="foot">Standing on the row's bottom line</option>
          <option value="middle">Centred in the row</option>
        </select>
      </label>
      <Any
        label="Tick length"
        value={Math.round(layout.markLen * 100)}
        step={5}
        min={5}
        max={100}
        suffix="% of row"
        onChange={(v) => set({ markLen: v / 100 })}
      />
      <Any
        label="Code gap"
        value={layout.labelGap}
        step={0.1}
        min={0}
        suffix="mm"
        onChange={(labelGap) => set({ labelGap })}
      />
      <Any
        label="Code turn"
        value={layout.labelRotation}
        step={15}
        suffix="° anticlockwise"
        onChange={(labelRotation) => set({ labelRotation })}
      />
    </div>
  );
}

/** Where and how CP readings are drawn: height in the panel, symbol size, stem and text. */
function CpLookControls({
  look,
  onChange,
}: {
  look: CpLook;
  onChange(l: CpLook): void;
}) {
  const set = (patch: Partial<CpLook>) => onChange({ ...look, ...patch });
  const opt = (label: string, v: number | null, key: "yMin" | "yMax") => (
    <label className="field">
      <span>{label}</span>
      <span className="with-suffix">
        <input
          type="number"
          placeholder="auto"
          value={v ?? ""}
          onChange={(e) =>
            set({
              [key]: e.target.value === "" ? null : Number(e.target.value),
            } as Partial<CpLook>)
          }
        />
        <span className="suffix">mV</span>
      </span>
    </label>
  );
  return (
    <div className="style-row">
      <label className="field">
        <span>Place the readings</span>
        <select
          value={look.yMode}
          onChange={(e) => set({ yMode: e.target.value as CpLook["yMode"] })}
        >
          <option value="fixed">At one height in the panel</option>
          <option value="value">At the height of their value (mV axis with grid)</option>
        </select>
      </label>
      {look.yMode === "fixed" && (
        <Any
          label="Height in panel"
          value={Math.round(look.posY * 100)}
          step={5}
          min={0}
          max={100}
          suffix="% from top (50 = middle)"
          onChange={(v) => set({ posY: v / 100 })}
        />
      )}
      {look.yMode === "value" && (
        <>
          {opt("Axis top (highest mV)", look.yMax, "yMax")}
          {opt("Axis bottom (lowest mV)", look.yMin, "yMin")}
          <Any
            label="Axis step (0 = auto)"
            value={look.yStep}
            step={5}
            min={0}
            suffix="mV"
            onChange={(yStep) => set({ yStep })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={look.yLabels}
              onChange={(e) => set({ yLabels: e.target.checked })}
            />
            Show the mV values on the left edge
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={look.yAbs}
              onChange={(e) => set({ yAbs: e.target.checked })}
            />
            Without the minus sign (-1046 reads 1046)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={look.yGrid}
              onChange={(e) => set({ yGrid: e.target.checked })}
            />
            Grid lines across the panel
          </label>
        </>
      )}
      <Any
        label="Symbol size"
        value={look.symbolSize}
        step={0.1}
        min={0.2}
        suffix="mm"
        onChange={(symbolSize) => set({ symbolSize })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={look.stem}
          onChange={(e) => set({ stem: e.target.checked })}
        />
        Stem down to the panel's foot
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={look.showText}
          onChange={(e) => set({ showText: e.target.checked })}
        />
        Show the readings
      </label>
      <label className="field">
        <span>Reading sits at</span>
        <select
          value={look.textClock}
          onChange={(e) => set({ textClock: Number(e.target.value) })}
        >
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
            <option key={h} value={h}>
              {h} o'clock
              {h === 12
                ? " (above)"
                : h === 3
                  ? " (right)"
                  : h === 6
                    ? " (below)"
                    : h === 9
                      ? " (left)"
                      : ""}
            </option>
          ))}
        </select>
      </label>
      <Any
        label="Reading gap"
        value={look.textGap}
        step={0.1}
        min={0}
        suffix="mm"
        onChange={(textGap) => set({ textGap })}
      />
      <Any
        label="Reading turn"
        value={look.textRotation}
        step={15}
        suffix="° anticlockwise"
        onChange={(textRotation) => set({ textRotation })}
      />
      <label className="field">
        <span>After each value</span>
        <input
          value={look.suffix}
          onChange={(e) => set({ suffix: e.target.value })}
        />
      </label>
    </div>
  );
}

export function FontControls({
  font,
  onChange,
}: {
  font: DataFont;
  onChange(f: DataFont): void;
}) {
  const set = (patch: Partial<DataFont>) => onChange({ ...font, ...patch });
  return (
    <div className="style-row font-row">
      <label className="field">
        <span>Font</span>
        <select
          value={font.family}
          onChange={(e) => set({ family: e.target.value })}
          style={{ fontFamily: font.family }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <Num
        label="Text height"
        value={font.size}
        step={0.1}
        suffix="mm"
        onChange={(size) => set({ size })}
      />
      <Colour
        label="Text colour"
        value={font.color}
        onChange={(color) => set({ color })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={!!font.bold}
          onChange={(e) => set({ bold: e.target.checked })}
        />
        <b>Bold</b>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!font.italic}
          onChange={(e) => set({ italic: e.target.checked })}
        />
        <i>Italic</i>
      </label>
    </div>
  );
}

const POS: Record<LabelPos, string> = {
  top: "Above the bar",
  bottom: "Below the bar",
  none: "Hidden",
};

/** Start/end code pairs drawn as linked events (freespans, burial). */
export function LinksEditor({
  links,
  onChange,
  codes,
}: {
  links: EventLink[];
  onChange(l: EventLink[]): void;
  codes?: string[];
}) {
  const set = (i: number, patch: Partial<EventLink>) =>
    onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // A code typed earlier (or a span sheet's own code) stays selectable even if the file lacks it.
  const options = (cur: string) =>
    [...new Set([...(codes ?? []), ...(cur ? [cur] : [])])].sort();
  const codeSelect = (value: string, onPick: (v: string) => void) => (
    <select value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">— pick a code —</option>
      {options(value).map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
  return (
    <div className="links-editor">
      <h4>Linked events</h4>
      <p className="hint">
        A start code joined to its end code, e.g. FS.FS → FS.FE for a freespan:
        drawn as a bar with the length and height.
        {codes?.length
          ? ` ${codes.length} codes read from the event code columns.`
          : " Pick the event code column to list its codes."}
      </p>
      {links.map((l, i) => (
        <div key={i} className="link-row">
          <label className="field">
            <span>Start code</span>
            {codeSelect(l.start, (start) => set(i, { start }))}
          </label>
          <label className="field">
            <span>End code</span>
            {codeSelect(l.end, (end) => set(i, { end }))}
          </label>
          <Colour
            label="Colour"
            value={l.color}
            onChange={(color) => set(i, { color })}
          />
          <label className="field">
            <span>Length</span>
            <select
              value={l.lengthPos}
              onChange={(e) =>
                set(i, { lengthPos: e.target.value as LabelPos })
              }
            >
              {Object.entries(POS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Height</span>
            <select
              value={l.heightPos}
              onChange={(e) =>
                set(i, { heightPos: e.target.value as LabelPos })
              }
            >
              {Object.entries(POS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Any
            label="Bar position"
            value={Math.round((l.barPos ?? 0.5) * 100)}
            step={5}
            min={0}
            max={100}
            suffix="% from row top"
            onChange={(v) => set(i, { barPos: v / 100 })}
          />
          <Any
            label="Bar thickness"
            value={l.barHeight ?? 0}
            step={0.1}
            min={0}
            suffix="mm (0 = auto)"
            onChange={(v) => set(i, { barHeight: v > 0 ? v : undefined })}
          />
          <Any
            label="Text gap"
            value={l.textGap ?? 0.6}
            step={0.1}
            min={0}
            suffix="mm from bar and row lines"
            onChange={(v) => set(i, { textGap: v })}
          />
          <Any
            label="End line length"
            value={Math.round((l.lineExtent ?? 0.8) * 100)}
            step={5}
            min={10}
            max={100}
            suffix="% of row"
            onChange={(v) => set(i, { lineExtent: v / 100 })}
          />
          <label className="field wide">
            <span>Legend text</span>
            <input
              value={l.label}
              onChange={(e) => set(i, { label: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="link"
            title="Remove"
            onClick={() => onChange(links.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...links, newLink("", "")])}
      >
        + Add pair
      </button>
    </div>
  );
}
