import { useEffect, useState } from 'react';
import { newId } from '../model/ids';
import { PAPER_SIZES } from '../model/paper';
import { formatScale } from '../model/scale';
import type { ChartTemplate, Panel, PaperSizeName, TextItem } from '../model/types';
import { PANEL_DEFAULTS } from '../state/panelDefaults';
import { useEditor } from '../state/store';

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
      <label className="field">
        <span>When the plan view is resized</span>
        <select value={t.scale.lock} onChange={(e) => s.setScale({ lock: e.target.value as 'kp' | 'scale' })}>
          <option value="kp">Keep KP per sheet, change scale</option>
          <option value="scale">Keep scale, change KP per sheet</option>
        </select>
      </label>
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
      {p.body !== undefined && <Field label="Text" multiline value={p.body} onCommit={(v) => set({ body: v })} />}
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
