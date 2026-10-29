import { useEffect, useState } from 'react';
import { newId } from '../model/ids';
import { PAPER_SIZES } from '../model/paper';
import { formatScale, sheetCount } from '../model/scale';
import type { ChartTemplate, Panel, PaperSizeName, TextItem } from '../model/types';
import { LEGEND_GROUPS, LEGEND_PRESETS, LEGEND_SYMBOLS } from '../model/presets';
import type { ImageItem, KeyplanStyle, PlanStyle, LegendGroup, LegendItem, LegendSymbol, TextStyle } from '../model/types';
import { PANEL_DEFAULTS } from '../state/panelDefaults';
import { useEditor } from '../state/store';
import { useSurvey } from '../state/surveyData';
import { keyplanStyle } from './Keyplan';
import { planStyle } from './PlanView';

/** Text/number box that commits on Enter or blur, so typing doesn't create one undo step per key. */
function Field({
  label,
  value,
  onCommit,
  type = 'text',
  step,
  suffix,
  multiline,
}: {
  label: string;
  value: string | number;
  onCommit(v: string): void;
  type?: 'text' | 'number';
  step?: number;
  suffix?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={draft} rows={5} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      ) : (
        <span className="input-wrap">
          <input
            type={type}
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(String(value));
            }}
          />
          {suffix && <em>{suffix}</em>}
        </span>
      )}
    </label>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (s: string) => parseFloat(s.replace(',', '.'));

export function PropertiesPanel() {
  const template = useEditor((s) => s.template)!;
  const selection = useEditor((s) => s.selection);
  if (selection.length > 1) {
    return (
      <aside className="props">
        <h3>{selection.length} items selected</h3>
        <p className="muted">Drag to move them together. Delete, copy or duplicate from the right-click menu.</p>
      </aside>
    );
  }
  const sel = selection[0];
  if (sel?.kind === 'panel') {
    const p = template.panels.find((x) => x.id === sel.id);
    if (p) return <PanelProps p={p} />;
  }
  if (sel?.kind === 'text') {
    const t = template.texts.find((x) => x.id === sel.id);
    if (t) return <TextProps t={t} />;
  }
  if (sel?.kind === 'image') {
    const im = (template.images ?? []).find((x) => x.id === sel.id);
    if (im) return <ImageProps im={im} />;
  }
  return <TemplateProps t={template} />;
}

function TemplateProps({ t }: { t: ChartTemplate }) {
  const s = useEditor.getState();
  const [newKey, setNewKey] = useState('');
  return (
    <aside className="props">
      <h3>Template</h3>
      <Field label="Name" value={t.name} onCommit={(v) => s.renameTemplate(v)} />
      <label className="field">
        <span>Chart type</span>
        <select value={t.kind} onChange={(e) => s.commit((tt) => ({ ...tt, kind: e.target.value as ChartTemplate['kind'] }))}>
          <option value="alignment">Alignment sheet</option>
          <option value="northUp">North-Up</option>
        </select>
      </label>

      <label className="field">
        <span>Font for all sheet text</span>
        <select value={t.fontFamily ?? 'Arial'} onChange={(e) => s.commit((tt) => ({ ...tt, fontFamily: e.target.value }))}>
          {FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>

      <h4>Paper</h4>
      <div className="row2">
        <label className="field">
          <span>Size</span>
          <select value={t.paper.size} onChange={(e) => s.setPaper(e.target.value as PaperSizeName, t.paper.orientation, [t.paper.width, t.paper.height])}>
            {Object.keys(PAPER_SIZES).map((k) => (
              <option key={k}>{k}</option>
            ))}
            <option value="Custom">Custom</option>
          </select>
        </label>
        <label className="field">
          <span>Orientation</span>
          <select value={t.paper.orientation} onChange={(e) => s.setPaper(t.paper.size, e.target.value as 'landscape' | 'portrait', [t.paper.width, t.paper.height])}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
      </div>
      {t.paper.size === 'Custom' && (
        <div className="row2">
          <Field label="Width" type="number" suffix="mm" value={r2(t.paper.width)} onCommit={(v) => num(v) > 0 && s.setPaper('Custom', t.paper.orientation, [num(v), t.paper.height])} />
          <Field label="Height" type="number" suffix="mm" value={r2(t.paper.height)} onCommit={(v) => num(v) > 0 && s.setPaper('Custom', t.paper.orientation, [t.paper.width, num(v)])} />
        </div>
      )}
      <Field
        label="Frame inset"
        type="number"
        suffix="mm"
        value={r2(t.paper.frameInset)}
        onCommit={(v) => num(v) >= 0 && s.commit((tt) => ({ ...tt, paper: { ...tt.paper, frameInset: num(v) } }))}
      />

      <ScaleFields t={t} />

      <h4>Fields</h4>
      <p className="muted">Use these in any text as {'{KEY}'}. KP_START, KP_END and the scales fill in automatically.</p>
      {Object.entries(t.fields).map(([k, v]) => (
        <div className="field-row" key={k}>
          <Field label={k} value={v} multiline={v.includes('\n') || v.length > 60} onCommit={(nv) => s.setField(k, nv)} />
          <button
            className="icon"
            title={`Remove ${k}`}
            onClick={() =>
              s.commit((tt) => {
                const fields = { ...tt.fields };
                delete fields[k];
                return { ...tt, fields };
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <div className="add-field">
        <input placeholder="NEW_FIELD" value={newKey} onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
        <button
          disabled={!newKey || newKey in t.fields}
          onClick={() => {
            s.setField(newKey, '');
            setNewKey('');
          }}
        >
          Add field
        </button>
      </div>
    </aside>
  );
}

export function ScaleFields({ t }: { t: ChartTemplate }) {
  const s = useEditor.getState();
  return (
    <>
      <h4>Scale</h4>
      <div className="row2">
        <Field label="Horizontal 1:" type="number" value={t.scale.horizontal} onCommit={(v) => s.setHorizontalScale(num(v))} />
        <Field label="KP per sheet" type="number" step={0.001} suffix="km" value={(t.scale.kpPerSheet / 1000).toFixed(3)} onCommit={(v) => s.setKpPerSheet(num(v) * 1000)} />
      </div>
      <p className="muted">The plan view keeps its size on paper; the scale sets how much route fits in it.</p>
      <div className="row2">
        <Field label="Route length" type="number" step={0.001} suffix="km" value={(t.scale.routeLength / 1000).toFixed(3)} onCommit={(v) => num(v) > 0 && s.setScale({ routeLength: num(v) * 1000 })} />
        <label className="field">
          <span>Charts needed</span>
          <span className="readout">{sheetCount(t)}</span>
        </label>
      </div>
      <div className="row2">
        <Field label="Long. vertical 1:" type="number" value={t.scale.verticalLong} onCommit={(v) => num(v) > 0 && s.setScale({ verticalLong: num(v) })} />
        <Field label="Trans. vertical 1:" type="number" value={t.scale.verticalTrans} onCommit={(v) => num(v) > 0 && s.setScale({ verticalTrans: num(v) })} />
      </div>
      <div className="row2">
        <Field label="Trans. lateral 1:" type="number" value={t.scale.lateralTrans} onCommit={(v) => num(v) > 0 && s.setScale({ lateralTrans: num(v) })} />
        <Field label="Sheet overlap" type="number" suffix="m" value={t.scale.overlap} onCommit={(v) => num(v) >= 0 && s.setScale({ overlap: num(v) })} />
      </div>
      <Field label="Start KP" type="number" step={0.001} suffix="km" value={t.fields.START_KP ?? '0.000'} onCommit={(v) => s.setField('START_KP', (num(v) || 0).toFixed(3))} />
    </>
  );
}

function PanelProps({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const template = useEditor((st) => st.template)!;
  const set = (patch: Partial<Panel>) => s.updatePanel(p.id, patch);
  const parent = p.parentId ? template.panels.find((x) => x.id === p.parentId) : undefined;
  return (
    <aside className="props">
      <h3>{PANEL_DEFAULTS[p.type].label}</h3>
      {parent && <p className="muted">Section of {parent.title}</p>}
      <Field label="Title" value={p.title} onCommit={(v) => set({ title: v })} />
      <label className="field">
        <span>Title position</span>
        <select value={p.titlePosition} onChange={(e) => set({ titlePosition: e.target.value as Panel['titlePosition'] })}>
          <option value="above">Above the panel</option>
          <option value="inside">Inside, top-left</option>
          <option value="none">Hidden</option>
        </select>
      </label>
      <div className="row2">
        <Field label="X" type="number" suffix="mm" value={r2(p.x)} onCommit={(v) => set({ x: num(v) })} />
        <Field label="Y" type="number" suffix="mm" value={r2(p.y)} onCommit={(v) => set({ y: num(v) })} />
      </div>
      <div className="row2">
        <Field label="Width" type="number" suffix="mm" value={r2(p.w)} onCommit={(v) => num(v) >= 5 && set({ w: num(v) })} />
        <Field label="Height" type="number" suffix="mm" value={r2(p.h)} onCommit={(v) => num(v) >= 5 && set({ h: num(v) })} />
      </div>
      {p.type === 'plan' && <ScaleFields t={template} />}
      {p.type !== 'plan' && ['longProfile', 'transProfile', 'events', 'cp'].includes(p.type) && (
        <label className="check">
          <input type="checkbox" checked={!!p.kpAligned} onChange={(e) => set({ kpAligned: e.target.checked })} /> Align with plan view KP range
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={!!p.locked} onChange={(e) => set({ locked: e.target.checked })} /> Locked
      </label>
      <label className="field">
        <span>Fill colour</span>
        <span className="input-wrap">
          <input type="color" value={p.fill ?? '#ffffff'} onChange={(e) => set({ fill: e.target.value })} />
          {p.fill && (
            <button className="link" onClick={() => set({ fill: undefined })}>
              Clear
            </button>
          )}
        </span>
      </label>
      {p.body !== undefined && (
        <Field label={p.body2 !== undefined ? 'Left column' : 'Text'} multiline value={p.body} onCommit={(v) => set({ body: v })} />
      )}
      {p.body2 !== undefined && <Field label="Right column" multiline value={p.body2} onCommit={(v) => set({ body2: v })} />}
      {p.body !== undefined && p.body2 === undefined && p.type !== 'text' && (
        <button onClick={() => set({ body2: '' })}>Add a second text column</button>
      )}
      {p.body !== undefined && <p className="muted">Use a Tab between a label and its value to line values up, e.g. "Ellipsoid⇥: WGS84".</p>}
      {p.body !== undefined && <FontEditor p={p} />}
      {p.type === 'legend' && <LegendEditor p={p} />}
      {p.type === 'keyplan' && <KeyplanEditor p={p} />}
      {p.type === 'plan' && <PlanStyleEditor p={p} />}
      {p.type === 'titleBlock' && (
        <p className="muted">Double-click any cell on the sheet to edit it. The description column offers the review statuses or your own text.</p>
      )}
      {p.rows && <RowsEditor p={p} />}
    </aside>
  );
}

function RowsEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const rows = p.rows ?? [];
  const setRows = (next: Panel['rows']) => s.updatePanel(p.id, { rows: next });
  return (
    <>
      <h4>Rows</h4>
      <Field label="Label column width" type="number" suffix="mm" value={r2(p.labelWidth ?? 30)} onCommit={(v) => num(v) > 0 && s.updatePanel(p.id, { labelWidth: num(v) })} />
      <ol className="rows">
        {rows.map((r, i) => (
          <li key={r.id}>
            <input
              defaultValue={r.label}
              onBlur={(e) => e.target.value !== r.label && setRows(rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button className="icon" title="Move up" disabled={i === 0} onClick={() => setRows(swap(rows, i, i - 1))}>
              ↑
            </button>
            <button className="icon" title="Move down" disabled={i === rows.length - 1} onClick={() => setRows(swap(rows, i, i + 1))}>
              ↓
            </button>
            <button className="icon" title="Delete row" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>
              ×
            </button>
          </li>
        ))}
      </ol>
      <button onClick={() => setRows([...rows, { id: newId('r'), label: 'NEW ROW' }])}>Add row</button>
    </>
  );
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const out = [...a];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function TextProps({ t }: { t: TextItem }) {
  const s = useEditor.getState();
  const set = (patch: Partial<TextItem>) => s.updateText(t.id, patch);
  const template = useEditor((st) => st.template)!;
  const parent = t.panelId ? template.panels.find((p) => p.id === t.panelId) : undefined;
  return (
    <aside className="props">
      <h3>Text</h3>
      {parent && <p className="muted">Attached to {parent.title}; moves with it.</p>}
      <Field label="Text" value={t.text} onCommit={(v) => set({ text: v })} />
      <p className="muted">
        Tokens such as {'{H_SCALE}'} (now {formatScale(template.scale.horizontal)}), {'{KP_START}'}, {'{KP_END}'} or any field update by themselves.
      </p>
      <div className="row2">
        <Field label="Height" type="number" step={0.1} suffix="mm" value={r2(t.size)} onCommit={(v) => num(v) > 0 && set({ size: num(v) })} />
        <Field label="Rotation" type="number" suffix="°" value={t.rotation ?? 0} onCommit={(v) => set({ rotation: num(v) || 0 })} />
      </div>
      <div className="row2">
        <Field label="X" type="number" suffix="mm" value={r2(t.x)} onCommit={(v) => set({ x: num(v) })} />
        <Field label="Y" type="number" suffix="mm" value={r2(t.y)} onCommit={(v) => set({ y: num(v) })} />
      </div>
      <label className="field">
        <span>Alignment</span>
        <select value={t.anchor} onChange={(e) => set({ anchor: e.target.value as TextItem['anchor'] })}>
          <option value="start">Left</option>
          <option value="middle">Centre</option>
          <option value="end">Right</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={!!t.bold} onChange={(e) => set({ bold: e.target.checked })} /> Bold
      </label>
    </aside>
  );
}

const FONTS = ['Arial', 'Arial Narrow', 'Helvetica', 'Calibri', 'Segoe UI', 'Tahoma', 'Verdana', 'Times New Roman', 'Courier New'];

function FontEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const f: TextStyle = p.font ?? { size: 1.8 };
  const set = (patch: Partial<TextStyle>) => s.updatePanel(p.id, { font: { ...f, ...patch } });
  return (
    <>
      <h4>Text style</h4>
      <div className="row2">
        <Field label="Text height" type="number" step={0.1} suffix="mm" value={r2(f.size)} onCommit={(v) => num(v) > 0 && set({ size: num(v) })} />
        <label className="field">
          <span>Alignment</span>
          <select value={f.align ?? 'start'} onChange={(e) => set({ align: e.target.value as TextStyle['align'] })}>
            <option value="start">Left</option>
            <option value="middle">Centre</option>
            <option value="end">Right</option>
          </select>
        </label>
      </div>
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={!!f.bold} onChange={(e) => set({ bold: e.target.checked })} /> Bold
        </label>
        <label className="check">
          <input type="checkbox" checked={!!f.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italic
        </label>
        <label className="check">
          <input type="checkbox" checked={!!f.vcenter} onChange={(e) => set({ vcenter: e.target.checked })} /> Centre vertically
        </label>
      </div>
      <label className="field">
        <span>Text colour</span>
        <span className="input-wrap">
          <input type="color" value={p.textColor ?? '#111111'} onChange={(e) => s.updatePanel(p.id, { textColor: e.target.value })} />
          {p.textColor && (
            <button className="link" onClick={() => s.updatePanel(p.id, { textColor: undefined })}>
              Default
            </button>
          )}
        </span>
      </label>
      <button
        title="Copy this text height and style to every text section"
        onClick={() =>
          s.commit((t) => ({
            ...t,
            panels: t.panels.map((x) => (x.body !== undefined && x.id !== p.id ? { ...x, font: { ...(x.font ?? { size: 1.8 }), size: f.size, bold: f.bold, italic: f.italic } } : x)),
          }))
        }
      >
        Apply height and style to all text sections
      </button>
    </>
  );
}

function LegendEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const items = p.legend ?? [];
  const setItems = (legend: LegendItem[]) => s.updatePanel(p.id, { legend });
  const update = (id: string, patch: Partial<LegendItem>) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const [preset, setPreset] = useState('0');
  return (
    <>
      <h4>Legend items</h4>
      <p className="muted">Items marked "plan view" will also be filled in automatically from the plan view layers once data is loaded.</p>
      <ul className="legend-list">
        {items.map((it, i) => (
          <li key={it.id}>
            <div className="legend-row">
              <input type="color" value={it.color} title="Colour" onChange={(e) => update(it.id, { color: e.target.value })} />
              <input
                defaultValue={it.label}
                key={it.label}
                onBlur={(e) => e.target.value !== it.label && update(it.id, { label: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <button className="icon" title="Move up" disabled={i === 0} onClick={() => setItems(swap(items, i, i - 1))}>
                ↑
              </button>
              <button className="icon" title="Remove" onClick={() => setItems(items.filter((x) => x.id !== it.id))}>
                ×
              </button>
            </div>
            <div className="legend-row sub">
              <select value={it.group} onChange={(e) => update(it.id, { group: e.target.value as LegendGroup })}>
                {Object.entries(LEGEND_GROUPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.toLowerCase()}
                  </option>
                ))}
              </select>
              <select value={it.symbol} onChange={(e) => update(it.id, { symbol: e.target.value as LegendSymbol })}>
                {Object.entries(LEGEND_SYMBOLS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
      <div className="add-field">
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {LEGEND_PRESETS.map((pr, i) => (
            <option key={i} value={i}>
              {LEGEND_GROUPS[pr.group].toLowerCase()}: {pr.label}
            </option>
          ))}
        </select>
        <button onClick={() => setItems([...items, { ...LEGEND_PRESETS[Number(preset)], id: newId('lg') }])}>Add preset</button>
      </div>
      <button onClick={() => setItems([...items, { id: newId('lg'), group: 'plan', symbol: 'line', label: 'New legend item', color: '#111111' }])}>
        Add your own item
      </button>
      <Field label="Event code definitions (code, Tab, description)" multiline value={p.eventCodes ?? ''} onCommit={(v) => s.updatePanel(p.id, { eventCodes: v })} />
    </>
  );
}

function ImageProps({ im }: { im: ImageItem }) {
  const s = useEditor.getState();
  const set = (patch: Partial<ImageItem>) => s.updateImage(im.id, patch);
  const ratio = im.h / im.w;
  return (
    <aside className="props">
      <h3>Image</h3>
      {im.name && <p className="muted">{im.name}</p>}
      <p className="muted">Drag to move. Drag a corner to resize in proportion (Shift to stretch), or a side handle to stretch one way.</p>
      <div className="row2">
        <Field label="Width" type="number" suffix="mm" value={r2(im.w)} onCommit={(v) => num(v) > 1 && set({ w: num(v), h: num(v) * ratio })} />
        <Field label="Height" type="number" suffix="mm" value={r2(im.h)} onCommit={(v) => num(v) > 1 && set({ h: num(v), w: num(v) / ratio })} />
      </div>
      <div className="row2">
        <Field label="X" type="number" suffix="mm" value={r2(im.x)} onCommit={(v) => set({ x: num(v) })} />
        <Field label="Y" type="number" suffix="mm" value={r2(im.y)} onCommit={(v) => set({ y: num(v) })} />
      </div>
    </aside>
  );
}

function KeyplanEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const st = keyplanStyle(p);
  const route = useSurvey((x) => x.route);
  const background = useSurvey((x) => x.background);
  const set = (patch: Partial<KeyplanStyle>) => s.updatePanel(p.id, { keyplan: { ...st, ...patch } });
  const colour = (label: string, key: 'background' | 'dxfColor' | 'routeColor' | 'boundaryColor' | 'currentColor' | 'gridColor') => (
    <label className="field">
      <span>{label}</span>
      <input type="color" value={st[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  return (
    <>
      <h4>Key plan</h4>
      <p className="hint">
        Drop the route (.dig, .xyz) and a background DXF onto the sheet.
        <br />
        Route: {route ? `${route.name} (${(route.length / 1000).toFixed(3)} km)` : 'none'}
        <br />
        Background: {background ? `${background.name} (${background.lines.length} lines)` : 'none'}
      </p>
      <div className="row2">
        {colour('Background', 'background')}
        {colour('DXF lines', 'dxfColor')}
      </div>
      <div className="row2">
        {colour('Survey line', 'routeColor')}
        {colour('Chart boundaries', 'boundaryColor')}
      </div>
      <div className="row2">
        {colour('This chart', 'currentColor')}
        {colour('Grid', 'gridColor')}
      </div>
      <Field label="Grid spacing (0 = auto)" type="number" step={100} suffix="m" value={st.gridSpacing} onCommit={(v) => num(v) >= 0 && set({ gridSpacing: num(v) })} />
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={st.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} /> Easting / northing grid
        </label>
        <label className="check">
          <input type="checkbox" checked={st.showNorthArrow} onChange={(e) => set({ showNorthArrow: e.target.checked })} /> North arrow
        </label>
        <label className="check">
          <input type="checkbox" checked={st.showBoundaries} onChange={(e) => set({ showBoundaries: e.target.checked })} /> Chart boundaries
        </label>
      </div>
      {(route || background) && (
        <div className="row2">
          {route && (
            <button onClick={() => useSurvey.getState().setRoute(null)}>Remove route</button>
          )}
          {background && (
            <button onClick={() => useSurvey.getState().setBackground(null)}>Remove background</button>
          )}
        </div>
      )}
    </>
  );
}

function PlanStyleEditor({ p }: { p: Panel }) {
  const s = useEditor.getState();
  const st = planStyle(p);
  const set = (patch: Partial<PlanStyle>) => s.updatePanel(p.id, { plan: { ...st, ...patch } });
  type ColourKey = { [K in keyof PlanStyle]: PlanStyle[K] extends string ? K : never }[keyof PlanStyle];
  type NumberKey = { [K in keyof PlanStyle]: PlanStyle[K] extends number ? K : never }[keyof PlanStyle];
  const colour = (label: string, key: ColourKey) => (
    <label className="field">
      <span>{label}</span>
      <input type="color" value={st[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  const size = (label: string, key: NumberKey, suffix = 'mm', step = 0.1) => (
    <Field label={label} type="number" step={step} suffix={suffix} value={st[key]} onCommit={(v) => num(v) >= 0 && set({ [key]: num(v) })} />
  );
  return (
    <>
      <h4>Route</h4>
      <div className="row2">
        {colour('Route colour', 'routeColor')}
        {size('Route width', 'routeWidth')}
      </div>
      {colour('Background DXF colour', 'dxfColor')}
      <h4>KP blocks</h4>
      <label className="check">
        <input type="checkbox" checked={st.showKp} onChange={(e) => set({ showKp: e.target.checked })} /> Show KP blocks
      </label>
      <div className="row2">
        {size('Interval (0 = scale ÷ 10)', 'kpInterval', 'm', 50)}
        {size('Block size', 'kpBlockSize')}
      </div>
      <Field label="Block rotation" type="number" step={5} suffix="°" value={st.kpRotation} onCommit={(v) => Number.isFinite(num(v)) && set({ kpRotation: num(v) })} />
      <div className="row2">
        {size('Stem length', 'kpStem')}
        {size('Text height', 'kpTextSize')}
      </div>
      <div className="row2">
        {colour('Block colour', 'kpColor')}
        {colour('Block fill', 'kpFill')}
      </div>
      {colour('Text colour', 'kpTextColor')}
      <h4>Easting / northing grid</h4>
      <label className="check">
        <input type="checkbox" checked={st.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} /> Show grid
      </label>
      {size('Grid spacing (0 = auto)', 'gridSpacing', 'm', 100)}
      <div className="row2">
        {size('Text height', 'gridTextSize')}
        {colour('Text colour', 'gridTextColor')}
      </div>
      <div className="row2">
        {size('Cross size', 'crossSize')}
        {colour('Cross colour', 'crossColor')}
      </div>
      <div className="row2">
        {size('Tick length', 'tickSize')}
        {colour('Tick colour', 'tickColor')}
      </div>
      <p className="hint">Labels that would overlap another label or run off the frame are left out.</p>
      <h4>North arrow</h4>
      <label className="check">
        <input type="checkbox" checked={st.showNorth} onChange={(e) => set({ showNorth: e.target.checked })} /> Show north arrow (drag it on the sheet to move it)
      </label>
      <div className="row2">
        {size('Size', 'northSize')}
        {colour('Colour', 'northColor')}
      </div>
    </>
  );
}
