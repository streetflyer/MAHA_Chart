import { ColourBox } from './ColourBox';
import { CP_SYMBOLS, DEFAULT_FONT, DEFAULT_LONG_OPTS, type LongOpts, FONT_FAMILIES, newLink, type CpSymbol, type DataFont, type DataStyle, type Dataset, type EventLink, type ImportTarget, type LabelPos } from '../model/datasets';
import { useEffect, useState } from 'react';
import { DEFAULT_COLOURS } from '../model/importers';
import { formatScale } from '../model/scale';
import type { ScaleSettings } from '../model/types';
import { useEditor } from '../state/store';

/** Look of a new dataset before it is imported. */
export function defaultStyle(target: ImportTarget): DataStyle {
  const color = DEFAULT_COLOURS[target] ?? '#8a8a8a';
  switch (target) {
    case 'route':
    case 'asbuilt':
      return { color, width: 0.35 };
    case 'plan':
    case 'siteplan':
      return { color, width: 0.18 };
    case 'long':
      return { color: '#e00000', fill: '#6b6b6b' };
    case 'trans':
      return { color, pipeColor: '#e00000', pipeFill: '#bdbdbd' };
    case 'events':
      return { font: { ...DEFAULT_FONT }, labels: true };
    case 'cp':
      return { color: '#111111', symbol: 'circle', font: { ...DEFAULT_FONT } };
    default:
      return {};
  }
}

/** Settle the chosen look onto a freshly built dataset. */
export function applyStyle(d: Dataset, s: DataStyle): Dataset {
  switch (d.kind) {
    case 'route':
      return { ...d, color: s.color ?? d.color, width: s.width ?? d.width };
    case 'linework':
      return { ...d, color: s.color ?? d.color, width: s.width ?? d.width };
    case 'long':
      return {
        ...d,
        fill: s.fill ?? d.fill,
        opts: s.long ?? d.opts,
        series: d.series.map((x, i) => (i === d.top || i === d.bop ? { ...x, color: s.color ?? x.color } : x)),
      };
    case 'trans':
      return { ...d, color: s.color ?? d.color, pipeColor: s.pipeColor ?? d.pipeColor, pipeFill: s.pipeFill ?? d.pipeFill };
    case 'events':
      return { ...d, font: s.font ?? d.font, labels: s.labels ?? d.labels };
    case 'cp':
      return { ...d, color: s.color ?? d.color, symbol: s.symbol ?? d.symbol, font: s.font ?? d.font };
  }
}

/** The look of an existing dataset, in the shape the controls edit. */
export function styleOf(d: Dataset): DataStyle {
  switch (d.kind) {
    case 'route':
    case 'linework':
      return { color: d.color, width: d.width };
    case 'long': {
      const pipe = d.top !== undefined ? d.series[d.top] : undefined;
      return { color: pipe?.color ?? '#e00000', fill: d.fill, long: d.opts };
    }
    case 'trans':
      return { color: d.color, pipeColor: d.pipeColor, pipeFill: d.pipeFill };
    case 'events':
      return { font: d.font, labels: d.labels };
    case 'cp':
      return { color: d.color, symbol: d.symbol, font: d.font };
  }
}

const Colour = ({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) => (
  <label className="field colour-field">
    <span>{label}</span>
    <ColourBox value={value} onChange={(c) => onChange(c)} />
  </label>
);

const Num = ({ label, value, step, suffix, onChange }: { label: string; value: number; step: number; suffix: string; onChange(v: number): void }) => (
  <label className="field">
    <span>{label}</span>
    <span className="with-suffix">
      <input type="number" min={0} step={step} value={value} onChange={(e) => Number(e.target.value) > 0 && onChange(Number(e.target.value))} />
      <span className="suffix">{suffix}</span>
    </span>
  </label>
);

/** "1:200", "1 : 2,000" or just "200": the scale denominator, or NaN. */
export function parseScale(text: string): number {
  const m = text.replace(/[\s,]/g, '').match(/^(?:1:)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) : NaN;
}

/** A scale typed as 1:100, 1:200... committed on Enter or when the box loses focus. */
function ScaleInput({ label, value, onChange, hint }: { label: string; value: number; onChange(v: number): void; hint?: string }) {
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
      <input className="scale-input" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="1:200" />
    </label>
  );
}

/** Vertical exaggeration typed as a plain number (×25). */
function ExInput({ value, onChange }: { value: number; onChange(v: number): void }) {
  const show = (v: number) => String(Number(v.toFixed(v < 10 ? 2 : 1)));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(/^[x×]/i, ''));
    if (v > 0) onChange(v);
    else setText(show(value));
  };
  return (
    <label className="field" title="Horizontal scale ÷ vertical scale">
      <span>Vertical exaggeration ×</span>
      <input className="scale-input" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}

/** The template's profile scales, shared by every chart, edited from the data's look settings. */
function ProfileScales({ target }: { target: 'long' | 'trans' }) {
  const sc = useEditor((s) => s.template?.scale);
  if (!sc) return null;
  const set = (patch: Partial<ScaleSettings>) => useEditor.getState().setScale(patch);
  if (target === 'long') {
    const ex = sc.horizontal / Math.max(1, sc.verticalLong);
    return (
      <>
        <div className="style-row">
          <ScaleInput label="Vertical scale" value={sc.verticalLong} onChange={(verticalLong) => set({ verticalLong })} hint="Depth scale of the longitudinal profile, e.g. 1:200" />
          <ExInput value={ex} onChange={(x) => set({ verticalLong: Math.round((sc.horizontal / x) * 1000) / 1000 })} />
        </div>
        <p className="hint">
          As in AutoChart, exaggeration = horizontal scale ÷ vertical scale ({formatScale(sc.horizontal)} ÷ {formatScale(sc.verticalLong)}). Set either one. Shared by every chart.
        </p>
      </>
    );
  }
  const lat = sc.lateralTrans || sc.verticalTrans;
  const ex = lat / Math.max(1, sc.verticalTrans);
  return (
    <>
      <div className="style-row">
        <ScaleInput label="Vertical scale (depth)" value={sc.verticalTrans} onChange={(verticalTrans) => set({ verticalTrans })} hint="Scale of heights in each cross profile, e.g. 1:100" />
        <ScaleInput label="Lateral scale (scan width)" value={lat} onChange={(lateralTrans) => set({ lateralTrans })} hint="Scale of the scan width axis, e.g. 1:100" />
      </div>
      <p className="hint">
        <b>Vertical exaggeration ×{ex.toFixed(ex < 10 ? 1 : 0)}</b>
        {ex === 1 ? ' (1:1, true shape)' : ''}. The vertical scale sets the depth axis and the lateral scale sets the scan width. Use the same value for both to draw the seabed at its true shape; a smaller vertical number exaggerates the heights.
      </p>
    </>
  );
}

/** AutoChart's Create Profile settings for the longitudinal profile. */
function LongSetup({ opts, onChange, seriesNames }: { opts?: LongOpts; onChange(o: LongOpts): void; seriesNames: string[] }) {
  const o = { ...DEFAULT_LONG_OPTS, ...opts };
  const set = (patch: Partial<LongOpts>) => onChange({ ...o, ...patch });
  const num = (label: string, key: 'gridLine' | 'gridLabel' | 'majorTick' | 'minorTick', hint: string) => (
    <label className="field" title={hint}>
      <span>{label}</span>
      <span className="with-suffix">
        <input type="number" min={0} step={0.5} value={o[key] || ''} placeholder="auto" onChange={(e) => set({ [key]: Math.max(0, Number(e.target.value) || 0) })} />
        <span className="suffix">m</span>
      </span>
    </label>
  );
  return (
    <div className="long-setup">
      <div className="style-row">
        <label className="field">
          <span>Values in the file are</span>
          <select value={o.zSense} onChange={(e) => set({ zSense: e.target.value as LongOpts['zSense'] })}>
            <option value="auto">Found from the data</option>
            <option value="depth">Depths (positive down)</option>
            <option value="level">Levels (positive up, depths negative)</option>
          </select>
        </label>
        <label className="field">
          <span>Profile placement</span>
          <select value={o.placement} disabled={o.forceTop !== null} onChange={(e) => set({ placement: e.target.value as LongOpts['placement'] })}>
            <option value="upper">Upper</option>
            <option value="middle">Middle</option>
            <option value="lower">Lower</option>
          </select>
        </label>
        <label className="field">
          <span>
            <input type="checkbox" checked={o.forceTop !== null} onChange={(e) => set({ forceTop: e.target.checked ? 0 : null })} /> Force grid start value
          </span>
          <input type="number" step={1} disabled={o.forceTop === null} value={o.forceTop ?? ''} onChange={(e) => set({ forceTop: Number(e.target.value) || 0 })} title="Value at the top of the depth axis" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={o.normalise} onChange={(e) => set({ normalise: e.target.checked })} />
        Normalise profile on top of pipe (TOP is the zero line; seabed drawn as its offset from the pipe)
      </label>
      <div className="style-row">
        {num('Grid line every', 'gridLine', 'Depth interval of the dotted grid lines')}
        {num('Label every', 'gridLabel', 'Depth interval of the axis labels')}
        {num('Major tick every', 'majorTick', 'Depth interval of the major ticks')}
        {num('Minor tick every', 'minorTick', 'Depth interval of the minor ticks (half the major length)')}
      </div>
      <div className="style-row">
        <Num label="Major tick length" value={o.tickLen} step={0.5} suffix="mm" onChange={(tickLen) => set({ tickLen })} />
        <label className="field">
          <span>Label suffix</span>
          <input value={o.suffix} onChange={(e) => set({ suffix: e.target.value })} style={{ width: 60 }} />
        </label>
        <label className="field">
          <span>Depth axis on</span>
          <select value={o.axisSide} onChange={(e) => set({ axisSide: e.target.value as LongOpts['axisSide'] })}>
            <option value="both">Both sides</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <Num label="Seabed line width" value={o.lineWidth} step={0.05} suffix="mm" onChange={(lineWidth) => set({ lineWidth })} />
        <Num label="Pipe outline width" value={o.pipeWidth} step={0.05} suffix="mm" onChange={(pipeWidth) => set({ pipeWidth })} />
      </div>
      <div className="style-row">
        <label className="check">
          <input type="checkbox" checked={o.hatchPipe} onChange={(e) => set({ hatchPipe: e.target.checked })} />
          Hatch pipe (between TOP and BOP)
        </label>
        <label className="check">
          <input type="checkbox" checked={o.hatchSea} onChange={(e) => set({ hatchSea: e.target.checked })} />
          Hatch background (sea)
        </label>
        {o.hatchSea && <ColourBox value={o.seaColor} title="Sea colour" onChange={(seaColor) => set({ seaColor })} />}
      </div>
      <div className="style-row">
        <label className="field">
          <span>Hatch below profile</span>
          <select value={o.hatchBelow} onChange={(e) => set({ hatchBelow: e.target.value })}>
            <option value="">None</option>
            {[...new Set([...seriesNames, ...(o.hatchBelow ? [o.hatchBelow] : [])])].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {o.hatchBelow && <Colour label="Seabed hatch colour" value={o.belowColor} onChange={(belowColor) => set({ belowColor })} />}
      </div>
    </div>
  );
}

/** Colour, width, fill, symbol and font controls for one kind of data. */
export function StyleControls({ target, style, onChange, seriesNames = [] }: { target: ImportTarget; style: DataStyle; onChange(patch: DataStyle): void; seriesNames?: string[] }) {
  const s = { ...defaultStyle(target), ...style };
  const lineish = target === 'route' || target === 'asbuilt' || target === 'plan' || target === 'siteplan';
  return (
    <div className="style-controls">
      {lineish && (
        <div className="style-row">
          <Colour label="Line colour" value={s.color!} onChange={(color) => onChange({ color })} />
          <Num label="Line width" value={s.width!} step={0.05} suffix="mm" onChange={(width) => onChange({ width })} />
        </div>
      )}
      {target === 'long' && (
        <div className="style-row">
          <Colour label="Pipe outline (TOP / BOP)" value={s.color!} onChange={(color) => onChange({ color })} />
          <Colour label="Pipe fill" value={s.fill!} onChange={(fill) => onChange({ fill })} />
        </div>
      )}
      {target === 'long' && <LongSetup opts={s.long} seriesNames={seriesNames} onChange={(long) => onChange({ long })} />}
      {(target === 'long' || target === 'trans') && <ProfileScales target={target} />}
      {target === 'trans' && (
        <div className="style-row">
          <Colour label="Raw points" value={s.color!} onChange={(color) => onChange({ color })} />
          <Colour label="Pipe outline" value={s.pipeColor!} onChange={(pipeColor) => onChange({ pipeColor })} />
          <Colour label="Pipe fill" value={s.pipeFill!} onChange={(pipeFill) => onChange({ pipeFill })} />
        </div>
      )}
      {target === 'cp' && (
        <div className="style-row">
          <Colour label="Tick and symbol" value={s.color!} onChange={(color) => onChange({ color })} />
          <label className="field">
            <span>Symbol</span>
            <select value={s.symbol} onChange={(e) => onChange({ symbol: e.target.value as CpSymbol })}>
              {Object.entries(CP_SYMBOLS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(target === 'events' || target === 'cp') && <FontControls font={s.font ?? DEFAULT_FONT} onChange={(font) => onChange({ font })} />}
      {target === 'events' && (
        <label className="check">
          <input type="checkbox" checked={s.labels ?? true} onChange={(e) => onChange({ labels: e.target.checked })} />
          Label single events with their code
        </label>
      )}
    </div>
  );
}

export function FontControls({ font, onChange }: { font: DataFont; onChange(f: DataFont): void }) {
  const set = (patch: Partial<DataFont>) => onChange({ ...font, ...patch });
  return (
    <div className="style-row font-row">
      <label className="field">
        <span>Font</span>
        <select value={font.family} onChange={(e) => set({ family: e.target.value })} style={{ fontFamily: font.family }}>
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <Num label="Text height" value={font.size} step={0.1} suffix="mm" onChange={(size) => set({ size })} />
      <Colour label="Text colour" value={font.color} onChange={(color) => set({ color })} />
      <label className="check">
        <input type="checkbox" checked={!!font.bold} onChange={(e) => set({ bold: e.target.checked })} />
        <b>Bold</b>
      </label>
      <label className="check">
        <input type="checkbox" checked={!!font.italic} onChange={(e) => set({ italic: e.target.checked })} />
        <i>Italic</i>
      </label>
    </div>
  );
}

const POS: Record<LabelPos, string> = { top: 'Above the bar', bottom: 'Below the bar', none: 'Hidden' };

/** Start/end code pairs drawn as linked events (freespans, burial). */
export function LinksEditor({ links, onChange, codes }: { links: EventLink[]; onChange(l: EventLink[]): void; codes?: string[] }) {
  const set = (i: number, patch: Partial<EventLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // A code typed earlier (or a span sheet's own code) stays selectable even if the file lacks it.
  const options = (cur: string) => [...new Set([...(codes ?? []), ...(cur ? [cur] : [])])].sort();
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
        A start code joined to its end code, e.g. FS.FS → FS.FE for a freespan: drawn as a bar with the length and height.
        {codes?.length ? ` ${codes.length} codes read from the event code columns.` : ' Pick the event code column to list its codes.'}
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
          <Colour label="Colour" value={l.color} onChange={(color) => set(i, { color })} />
          <label className="field">
            <span>Length</span>
            <select value={l.lengthPos} onChange={(e) => set(i, { lengthPos: e.target.value as LabelPos })}>
              {Object.entries(POS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Height</span>
            <select value={l.heightPos} onChange={(e) => set(i, { heightPos: e.target.value as LabelPos })}>
              {Object.entries(POS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field wide">
            <span>Legend text</span>
            <input value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
          </label>
          <button type="button" className="link" title="Remove" onClick={() => onChange(links.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...links, newLink('', '')])}>
        + Add pair
      </button>
    </div>
  );
}
