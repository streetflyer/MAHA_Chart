import { CP_SYMBOLS, DEFAULT_FONT, FONT_FAMILIES, newLink, type CpSymbol, type DataFont, type DataStyle, type Dataset, type EventLink, type ImportTarget, type LabelPos } from '../model/datasets';
import { DEFAULT_COLOURS } from '../model/importers';

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
      return { color: pipe?.color ?? '#e00000', fill: d.fill };
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
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
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

/** Colour, width, fill, symbol and font controls for one kind of data. */
export function StyleControls({ target, style, onChange }: { target: ImportTarget; style: DataStyle; onChange(patch: DataStyle): void }) {
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
  const listId = 'event-codes-list';
  return (
    <div className="links-editor">
      <h4>Linked events</h4>
      <p className="hint">A start code joined to its end code, e.g. FS.FS → FS.FE for a freespan: drawn as a bar with the length and height.</p>
      {codes && (
        <datalist id={listId}>
          {codes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
      {links.map((l, i) => (
        <div key={i} className="link-row">
          <label className="field">
            <span>Start code</span>
            <input list={listId} value={l.start} onChange={(e) => set(i, { start: e.target.value.toUpperCase() })} />
          </label>
          <label className="field">
            <span>End code</span>
            <input list={listId} value={l.end} onChange={(e) => set(i, { end: e.target.value.toUpperCase() })} />
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
      <button type="button" onClick={() => onChange([...links, newLink()])}>
        + Add linked events
      </button>
    </div>
  );
}
