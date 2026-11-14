import { useState } from 'react';
import { FONT_FAMILIES, type LayerOverride, type TextMode } from '../model/datasets';
import { editTexts, rotateGroups } from '../model/drawingOps';
import { useDrawingEdit } from '../state/drawingEdit';
import { useSurvey } from '../state/surveyData';
import { ColourBox } from './ColourBox';
import { deleteSelected, planSets, selectedTexts, selectionBox, selectionCount } from './drawingEditing';
import { layerColour, layerShown, lookOf, type LineworkSet } from './LineworkLayer';

/** A number box that commits on Enter or when it loses focus; any sign allowed. */
function NumberBox({ label, value, step = 1, suffix, onCommit }: { label: string; value: number; step?: number; suffix?: string; onCommit(v: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 1000) / 1000);
  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(v);
    setDraft(null);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input type="number" step={step} value={shown} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

/** The font box every text can be given, like Word's Font dialog: family, style, colour. */
function FontPick({
  family,
  bold,
  italic,
  onFamily,
  onBold,
  onItalic,
  sheetFont = true,
}: {
  family: string;
  bold: boolean;
  italic: boolean;
  onFamily(f: string): void;
  onBold(b: boolean): void;
  onItalic(i: boolean): void;
  sheetFont?: boolean;
}) {
  return (
    <div className="style-row font-row">
      <label className="field">
        <span>Font</span>
        <select value={family} onChange={(e) => onFamily(e.target.value)} style={{ fontFamily: family || undefined }}>
          {sheetFont && <option value="">Sheet font</option>}
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={bold} onChange={(e) => onBold(e.target.checked)} />
        <b>Bold</b>
      </label>
      <label className="check">
        <input type="checkbox" checked={italic} onChange={(e) => onItalic(e.target.checked)} />
        <i>Italic</i>
      </label>
    </div>
  );
}

/** Layers of a drawing: on/off and colour of each, in a list that opens and closes. */
function LayerList({ d }: { d: LineworkSet }) {
  const sv = useSurvey.getState();
  const [filter, setFilter] = useState('');
  const infos = d.lw.layerInfo;
  if (!infos.length) return null;
  const set = (layer: string, patch: Partial<LayerOverride>) => sv.updateDataset(d.id, { layers: { ...d.layers, [layer]: { ...d.layers?.[layer], ...patch } } });
  const setAll = (on: boolean) => sv.updateDataset(d.id, { layers: Object.fromEntries(infos.map((l) => [l.name, { ...d.layers?.[l.name], hidden: !on }])) });
  const shown = infos.filter((l) => !filter || l.name.toLowerCase().includes(filter.toLowerCase()));
  const on = infos.filter((l) => layerShown(d, l.name)).length;
  return (
    <details className="layer-list">
      <summary>
        Layers ({on} of {infos.length} on)
      </summary>
      <div className="layer-tools">
        <button type="button" onClick={() => setAll(true)}>
          All on
        </button>
        <button type="button" onClick={() => setAll(false)}>
          All off
        </button>
        {infos.length > 10 && <input placeholder="Find a layer" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>
      <ul>
        {shown.map((l) => (
          <li key={l.name}>
            <input type="checkbox" checked={layerShown(d, l.name)} title="Show this layer" onChange={(e) => set(l.name, { hidden: !e.target.checked })} />
            <ColourBox value={layerColour(d, l.name) || '#888888'} title="Layer colour (the drawing's own colour is kept until you change it)" onChange={(c) => set(l.name, { color: c })} />
            <span className="layer-name" title={l.name}>
              {l.name}
            </span>
            <span className="muted">{l.count.toLocaleString()}</span>
            {d.layers?.[l.name]?.color && (
              <button type="button" className="link" title="Back to the drawing's colour" onClick={() => set(l.name, { color: undefined })}>
                ↺
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Look settings of a drawing: its own colours, layers, and text font, size, colour and turn. */
export function DrawingLook({ d }: { d: LineworkSet }) {
  const sv = useSurvey.getState();
  const lk = lookOf(d);
  const upd = (patch: Partial<LineworkSet>) => sv.updateDataset(d.id, patch);
  return (
    <div className="drawing-look">
      <label className="check" title="Draw every layer in the colour the drawing gives it, instead of one colour for all">
        <input type="checkbox" checked={lk.drawingColours} onChange={(e) => upd({ drawingColours: e.target.checked })} />
        Keep the layer colours of the drawing
      </label>
      <LayerList d={d} />
      {d.lw.texts.length > 0 && (
        <details className="layer-list" open>
          <summary>Text ({d.lw.texts.length.toLocaleString()})</summary>
          <FontPick family={lk.textFamily} bold={lk.textBold} italic={lk.textItalic} onFamily={(textFamily) => upd({ textFamily })} onBold={(textBold) => upd({ textBold })} onItalic={(textItalic) => upd({ textItalic })} />
          <div className="row2">
            <label className="field">
              <span>Size</span>
              <select value={d.textMode} onChange={(e) => upd({ textMode: e.target.value as TextMode })}>
                <option value="auto">Scaled, kept readable</option>
                <option value="drawn">As drawn, scaled</option>
                <option value="fixed">Fixed height on paper</option>
              </select>
            </label>
            {d.textMode !== 'fixed' ? (
              <NumberBox label="Scale" value={d.textScale} step={10} suffix="%" onCommit={(v) => v > 0 && upd({ textScale: v })} />
            ) : (
              <NumberBox label="Height" value={d.textHeight} step={0.1} suffix="mm" onCommit={(v) => v > 0 && upd({ textHeight: v })} />
            )}
          </div>
          <div className="row2">
            <label className="field colour-field">
              <span>Colour</span>
              <span className="input-wrap">
                <ColourBox value={lk.textColor || '#000000'} onChange={(c) => upd({ textColor: c })} />
                {lk.textColor && (
                  <button type="button" className="link" onClick={() => upd({ textColor: '' })}>
                    Layer colours
                  </button>
                )}
              </span>
            </label>
            <NumberBox label="Turn all text" value={lk.textRotation} step={15} suffix="°" onCommit={(textRotation) => upd({ textRotation })} />
          </div>
          <label className="check" title="Text that would read upside down on the sheet is turned the right way up">
            <input type="checkbox" checked={lk.textUpright} onChange={(e) => upd({ textUpright: e.target.checked })} />
            Keep text readable (never upside down)
          </label>
        </details>
      )}
    </div>
  );
}

/** Edit-mode controls in the plan view's properties: the choice, turn, delete and the chosen text's look. */
export function DrawingEditPanel({ panelId, when }: { panelId: string; when: 'active' | 'idle' }) {
  const active = useDrawingEdit((s) => s.active && s.panelId === panelId);
  const selected = useDrawingEdit((s) => s.selected);
  const canUndo = useDrawingEdit((s) => s.past.length > 0);
  const canRedo = useDrawingEdit((s) => s.future.length > 0);
  const datasets = useSurvey((s) => s.datasets);
  const [angle, setAngle] = useState(90);
  const [scale, setScale] = useState(150);
  const sets = planSets();
  if (!sets.length) return null;
  const de = useDrawingEdit.getState();
  if (!active && when === 'active') return null;
  if (active && when === 'idle') return null;
  if (!active)
    return (
      <>
        <h4>Drawing</h4>
        <button type="button" className="primary" onClick={() => de.enter(panelId)} title="Choose, move, turn and delete the objects of the drawings in this plan view (or double-click the plan view)">
          Edit the drawing objects…
        </button>
        <p className="hint">Or double-click the plan view.</p>
      </>
    );
  const n = selectionCount(selected);
  const ids = Object.keys(selected).filter((id) => selected[id].length);
  const texts = selectedTexts(selected);
  const allTexts = texts.flatMap((x) => x.texts);
  const one = allTexts.length === 1 ? allTexts[0] : null;
  const textPatch = (patch: Parameters<typeof editTexts>[2]) => de.change(texts.map((x) => x.d.id), (lw, id) => editTexts(lw, new Set(selected[id]), patch));
  const box = selectionBox(selected);
  void datasets;
  return (
    <>
      <h4>Editing the drawing</h4>
      <p className="hint">Click an object or drag a box (left to right: inside; right to left: touching). Shift+click adds. Drag a chosen object to move it, the round handle to turn it (Shift: 15° steps), arrow keys to nudge, Delete to remove.</p>
      <div className="project-actions">
        <button type="button" className="primary" onClick={() => de.exit()}>
          Done
        </button>
        <button type="button" disabled={!canUndo} onClick={() => de.undo()}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => de.redo()}>
          Redo
        </button>
      </div>
      <p className="muted">{n ? `${n} object${n > 1 ? 's' : ''} chosen${box ? '' : ''}` : 'Nothing chosen.'}</p>
      <div className="project-actions">
        <button type="button" disabled={!n} onClick={() => deleteSelected()}>
          Delete
        </button>
      </div>
      <div className="row2">
        <NumberBox label="Turn by" value={angle} step={15} suffix="° anticlockwise" onCommit={setAngle} />
        <button
          type="button"
          disabled={!n || !box}
          onClick={() => {
            if (!box) return;
            const cE = (box.minE + box.maxE) / 2;
            const cN = (box.minN + box.maxN) / 2;
            de.change(ids, (lw, id) => rotateGroups(lw, new Set(selected[id]), cE, cN, (angle * Math.PI) / 180));
          }}
        >
          Turn
        </button>
      </div>
      {allTexts.length > 0 && (
        <>
          <h4>Chosen text ({allTexts.length})</h4>
          {one && (
            <label className="field">
              <span>Text</span>
              <input key={one.text + one.x} defaultValue={one.text} onBlur={(e) => e.target.value !== one.text && textPatch({ text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </label>
          )}
          <FontPick
            family={one?.font ?? ''}
            bold={!!one?.bold}
            italic={!!one?.italic}
            onFamily={(font) => textPatch({ font })}
            onBold={(bold) => textPatch({ bold })}
            onItalic={(italic) => textPatch({ italic })}
          />
          <div className="row2">
            <label className="field colour-field">
              <span>Colour</span>
              <ColourBox value={one?.color || '#000000'} onChange={(color) => textPatch({ color })} />
            </label>
            <NumberBox label="Rotation" value={Math.round((one?.rot ?? 0) * 100) / 100} step={15} suffix="°" onCommit={(rot) => textPatch({ rot })} />
          </div>
          <div className="row2">
            <NumberBox label="Size" value={scale} step={10} suffix="%" onCommit={setScale} />
            <button type="button" onClick={() => scale > 0 && textPatch({ scale: scale / 100 })}>
              Resize chosen text
            </button>
          </div>
        </>
      )}
    </>
  );
}
