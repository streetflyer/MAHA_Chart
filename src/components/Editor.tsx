import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../model/ids';
import { PAPER_SIZES } from '../model/paper';
import { BUILTIN_TEMPLATES } from '../model/builtinTemplates';
import { deleteSheet, editSheet, insertSheet, sheetCount, sheetRange, sheetRotation } from '../model/scale';
import { exportTemplateFile, importTemplateFile, listUserTemplates, saveUserTemplate } from '../model/storage';
import type { ChartTemplate, PanelType, PaperSizeName } from '../model/types';
import { ADDABLE_TYPES, PANEL_DEFAULTS } from '../state/panelDefaults';
import { chartInfoLocked, useEditor } from '../state/store';
import { useSurvey } from '../state/surveyData';
import { fitInto, readImageFile } from './imageImport';
import { titleInsideHeight } from './PanelContent';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { askConfirm, askText } from './Dialog';
import { PropertiesPanel } from './PropertiesPanel';
import { SheetView, type ContextTarget } from './SheetView';

interface Menu {
  x: number;
  y: number;
  items: MenuItem[];
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
};

export function Editor({ onExit }: { onExit(): void }) {
  const template = useEditor((s) => s.template)!;
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('mahachart.darkSheet') === '1';
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState<string | null>(null);
  const propsRef = useRef<HTMLDivElement>(null);
  const s = useEditor.getState;

  const [showLoad, setShowLoad] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | undefined>(undefined);
  const toastTimer = useRef<number | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), Math.max(2500, msg.length * 45));
  };

  const save = useCallback(
    async (asNew: boolean) => {
      const t = s().template!;
      let name = t.name;
      if (asNew || t.builtIn) {
        const answer = await askText('Save template as', t.builtIn ? `${t.name} (copy)` : t.name, 'Save');
        if (!answer) return;
        name = answer;
      }
      const saved = saveUserTemplate({ ...t, id: asNew || t.builtIn ? newId('tpl') : t.id, name });
      if (!saved) return flash('Could not save: browser storage is full or blocked.');
      s().markSaved(saved);
      flash(`Saved "${saved.name}"`);
    },
    [s],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || s().editing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sel = s().selection;
      if (mod && k === 'z' && !e.shiftKey) s().undo();
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) s().redo();
      else if (mod && k === 'c') s().copySelection();
      else if (mod && k === 'x') s().cutSelection();
      else if (mod && k === 'v') s().paste();
      else if (mod && k === 'd') s().duplicateSelection();
      else if (mod && k === 's') save(e.shiftKey);
      else if (mod && k === 'a') {
        const t = s().template!;
        s().select([...t.panels.filter((p) => !p.parentId).map((p) => ({ kind: 'panel' as const, id: p.id })), ...t.texts.map((x) => ({ kind: 'text' as const, id: x.id }))]);
      } else if (mod && k === '0') setFitSignal((n) => n + 1);
      else if (e.key === 'Delete' || e.key === 'Backspace') s().deleteSelection();
      else if (e.key === 'F2' && sel.length === 1) s().startEdit(sel[0].kind === 'text' ? { kind: 'text', id: sel[0].id } : { kind: 'panelTitle', id: sel[0].id });
      else if (e.key === 'Escape') s().select(null);
      else if (e.key.startsWith('Arrow') && sel.length) {
        const step = e.shiftKey ? 5 : 0.5;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
        s().nudgeSelection(d[0], d[1]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (s().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [s]);

  function addPanelMenu(at?: { x: number; y: number }, parentId?: string): MenuItem[] {
    const hasPlan = template.panels.some((p) => p.type === 'plan');
    return ADDABLE_TYPES.map((type: PanelType) => ({
      label: PANEL_DEFAULTS[type].label,
      disabled: type === 'plan' && hasPlan,
      action: () => s().addPanel(type, at, parentId),
    }));
  }

  function openMenu(clientX: number, clientY: number, at: { x: number; y: number }, target: ContextTarget) {
    const st = s();
    const sel = st.selection;
    const panel = target.id && target.kind !== 'text' ? template.panels.find((p) => p.id === target.id) : undefined;
    const common: MenuItem[] = [
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: !sel.length, action: () => st.cutSelection() },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: !sel.length, action: () => st.copySelection() },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !st.clipboard, action: () => st.paste(at) },
      { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !sel.length, action: () => st.duplicateSelection() },
      { label: 'Delete', shortcut: 'Del', disabled: !sel.length, action: () => st.deleteSelection() },
    ];
    let items: MenuItem[];
    if (target.kind === 'sheet') {
      items = [
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !st.clipboard, action: () => st.paste(at) },
        'separator',
        { label: 'Add panel', submenu: addPanelMenu(at) },
        { label: 'Add text here', action: () => st.addText(at) },
        'separator',
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => st.select([...template.panels.filter((p) => !p.parentId).map((p) => ({ kind: 'panel' as const, id: p.id }))]) },
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !st.past.length, action: () => st.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !st.future.length, action: () => st.redo() },
        'separator',
        { label: 'Zoom to fit', shortcut: 'Ctrl+0', action: () => setFitSignal((n) => n + 1) },
        { label: 'Template properties', action: () => st.select(null) },
      ];
    } else if (target.kind === 'image') {
      items = [...common, 'separator', { label: 'Properties', action: focusProps }];
    } else if (target.kind === 'text') {
      items = [
        { label: 'Edit text', shortcut: 'F2', action: () => st.startEdit({ kind: 'text', id: target.id! }) },
        'separator',
        ...common,
        'separator',
        { label: 'Properties', action: focusProps },
      ];
    } else {
      const p = panel!;
      const rowItems: MenuItem[] =
        target.kind === 'row' && p.rows
          ? [
              { label: 'Rename row', action: () => st.startEdit({ kind: 'row', id: p.id, rowId: target.rowId }) },
              { label: 'Insert row above', action: () => insertRow(p.id, target.rowId!, 0) },
              { label: 'Insert row below', action: () => insertRow(p.id, target.rowId!, 1) },
              { label: 'Delete row', action: () => st.updatePanel(p.id, { rows: p.rows!.filter((r) => r.id !== target.rowId) }) },
              'separator',
            ]
          : [];
      items = [
        ...rowItems,
        { label: 'Rename', shortcut: 'F2', action: () => st.startEdit({ kind: 'panelTitle', id: p.id }) },
        ...(p.body !== undefined ? [{ label: 'Edit text', action: () => st.startEdit({ kind: 'panelBody', id: p.id }) } as MenuItem] : []),
        'separator',
        ...common,
        'separator',
        { label: 'Split left / right', disabled: sel.length !== 1, action: () => st.splitSelected('vertical') },
        { label: 'Split top / bottom', disabled: sel.length !== 1, action: () => st.splitSelected('horizontal') },
        ...(p.type === 'chartInfo' || p.parentId ? [{ label: 'Add section', submenu: addPanelMenu(at, p.parentId ?? p.id) } as MenuItem] : []),
        ...(p.rows ? [{ label: 'Add row', action: () => st.updatePanel(p.id, { rows: [...p.rows!, { id: newId('r'), label: 'NEW ROW' }] }) } as MenuItem] : []),
        { label: 'Add text here', action: () => st.addText({ x: at.x - p.x, y: at.y - p.y }, p.id) },
        {
          label: p.type === 'logo' ? 'Insert logo image…' : 'Insert image…',
          action: () => {
            imageTarget.current = p.id;
            imageInput.current?.click();
          },
        },
        'separator',
        { label: 'Bring to front', action: () => st.reorderSelection('front') },
        { label: 'Send to back', action: () => st.reorderSelection('back') },
        { label: p.locked ? 'Unlock' : 'Lock', action: () => st.toggleLockSelection() },
        'separator',
        { label: 'Properties', action: focusProps },
      ];
    }
    setMenu({ x: clientX, y: clientY, items });
  }

  function insertRow(panelId: string, rowId: string, offset: 0 | 1) {
    const p = s().template!.panels.find((x) => x.id === panelId)!;
    const rows = [...(p.rows ?? [])];
    const i = rows.findIndex((r) => r.id === rowId);
    const id = newId('r');
    rows.splice(i + offset, 0, { id, label: 'NEW ROW' });
    s().updatePanel(panelId, { rows });
    s().startEdit({ kind: 'row', id: panelId, rowId: id });
  }

  function focusProps() {
    propsRef.current?.querySelector<HTMLInputElement>('input, select, textarea')?.focus();
  }

  function setPaper(size: PaperSizeName) {
    s().setPaper(size, template.paper.orientation, [template.paper.width, template.paper.height]);
  }

  async function reset() {
    if (!(await askConfirm('Reset to template?', 'This puts the layout back the way it was when you opened it. You can undo this with Ctrl+Z.', 'Reset'))) return;
    s().resetToOrigin();
    setFitSignal((n) => n + 1);
    flash('Reset to the opened template');
  }

  async function loadTemplate(t: ChartTemplate) {
    setShowLoad(false);
    if (s().dirty && !(await askConfirm('Load another template?', 'Your changes to this template have not been saved.', 'Load anyway', true))) return;
    s().open(t);
    setFitSignal((n) => n + 1);
    flash(`Loaded "${t.name}"`);
  }

  async function insertImages(files: FileList | null) {
    const target = imageTarget.current ? s().template!.panels.find((p) => p.id === imageTarget.current) : undefined;
    for (const f of [...(files ?? [])]) {
      try {
        const img = await readImageFile(f);
        if (target) {
          const top = target.titlePosition === 'inside' ? titleInsideHeight(target) : 1;
          const r = fitInto(img.width, img.height, { x: 1.5, y: top, w: target.w - 3, h: target.h - top - 1.5 });
          s().addImage({ panelId: target.id, ...r, src: img.src, name: f.name });
        } else {
          const t = s().template!;
          s().addImage({ x: t.paper.width / 2 - 20, y: t.paper.height / 2 - 10, w: 40, h: (40 * img.height) / img.width, src: img.src, name: f.name });
        }
      } catch (err) {
        flash((err as Error).message);
      }
    }
  }

  async function exit() {
    if (dirty && !(await askConfirm('Leave without saving?', 'Your changes to this template have not been saved.', 'Leave', true))) return;
    onExit();
  }

  const infoLocked = chartInfoLocked(template);
  const hasInfo = template.panels.some((p) => p.type === 'chartInfo');

  return (
    <div className="editor">
      <header className="toolbar">
        <button onClick={exit} title="Back to template list">
          ← Templates
        </button>
        <span className="tpl-name" title={template.name}>
          {template.name}
          {dirty ? ' •' : ''}
        </span>
        <div className="group">
          <button onClick={() => save(false)} title="Save template (Ctrl+S)">
            Save
          </button>
          <button onClick={() => save(true)} title="Save as a new template (Ctrl+Shift+S)">
            Save as…
          </button>
          <button onClick={() => setShowLoad(true)} title="Open a saved or built-in template">
            Load…
          </button>
          <button onClick={reset} title="Put the layout back the way it was when you opened it">
            Reset
          </button>
          <button onClick={() => exportTemplateFile(template)} title="Download the template as a file to share">
            Export file
          </button>
        </div>
        <div className="group">
          <button onClick={() => s().undo()} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={() => s().redo()} disabled={!canRedo} title="Redo (Ctrl+Y)">
            Redo
          </button>
        </div>
        <div className="group">
          <label>
            Paper{' '}
            <select value={template.paper.size} onChange={(e) => setPaper(e.target.value as PaperSizeName)}>
              {Object.keys(PAPER_SIZES).map((k) => (
                <option key={k}>{k}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </label>
          <ScaleQuick />
        </div>
        <div className="group">
          <button onClick={(e) => setMenu({ x: e.clientX, y: e.clientY + 12, items: addPanelMenu() })}>+ Panel</button>
          <button onClick={() => s().addText({ x: template.paper.width / 2, y: template.paper.height / 2 })}>+ Text</button>
          {hasInfo && (
            <label title="Lock the Chart Information panel and every section inside it">
              <input type="checkbox" checked={infoLocked} onChange={(e) => s().setChartInfoLocked(e.target.checked)} /> Lock Chart Information
            </label>
          )}
        </div>
        <div className="group right">
          <button onClick={() => setFitSignal((n) => n + 1)} title="Zoom to fit (Ctrl+0 or double-click empty paper)">
            Fit
          </button>
          <label title="Show the sheet like a CAD model space">
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => {
                setDark(e.target.checked);
                try {
                  localStorage.setItem('mahachart.darkSheet', e.target.checked ? '1' : '0');
                } catch {
                  /* preference only */
                }
              }}
            />{' '}
            Dark sheet
          </label>
        </div>
      </header>
      <div className="workspace">
        <div className="sheet-col">
          <SheetView onContextMenu={openMenu} onCursor={setCursor} onNotice={flash} fitSignal={fitSignal} dark={dark} />
          <ChartTabs />
        </div>
        <div ref={propsRef} className="props-wrap">
          <PropertiesPanel />
        </div>
      </div>
      <footer className="statusbar">
        <span>{cursor ? `X ${cursor.x.toFixed(1)}  Y ${cursor.y.toFixed(1)} mm` : ' '}</span>
        <span>
          {template.paper.size} {template.paper.width.toFixed(0)}×{template.paper.height.toFixed(0)} mm
        </span>
        <span className="hint-text">Drag an edge to resize (Alt = ignore shared dividers) · Drop a logo on a panel · Wheel to zoom · Double-click (or wheel double-click) to fit · F2 rename</span>
      </footer>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages(e.target.files);
          e.target.value = '';
        }}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {showLoad && <LoadDialog onLoad={loadTemplate} onClose={() => setShowLoad(false)} onError={flash} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** One tab per chart needed to cover the survey line; each chart starts where the previous one ends. */
function ChartTabs() {
  const template = useEditor((s) => s.template)!;
  const current = useEditor((s) => s.sheetIndex);
  const n = sheetCount(template);
  const st = () => useEditor.getState();
  return (
    <div className="chart-bar">
      <nav className="chart-tabs" aria-label="Charts">
        {Array.from({ length: n }, (_, i) => {
          const r = sheetRange(template, i);
          return (
            <button key={i} className={i === current ? 'active' : ''} onClick={() => st().setSheet(i)} title={`KP ${r.start.toFixed(3)} to KP ${r.end.toFixed(3)}`}>
              Chart {i + 1}
              <span>
                KP {r.start.toFixed(3)}–{r.end.toFixed(3)}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="chart-tools">
        <ChartNumber
          label="Start KP"
          suffix="km"
          title="KP at the left edge of this chart's plan view. Chart 1 may start before KP 0."
          value={sheetRange(template, current).start.toFixed(3)}
          onCommit={(v) => st().commit((t) => editSheet(t, current, { start: Math.round(v * 1000 * 1000) / 1000 }))}
        />
        <ChartNumber
          label="Rotate"
          suffix="°"
          title="Turn this chart's frame, e.g. for a sharp bend. You can also drag the round grip in the key plan."
          value={String(sheetRotation(template, current))}
          onCommit={(v) => st().commit((t) => editSheet(t, current, { rotation: v }))}
        />
        <button onClick={() => st().commit((t) => insertSheet(t, current))} title="Add a chart after this one, halfway along. Use it where the line turns sharply.">
          + Add chart
        </button>
        <button disabled={n <= 1} onClick={() => st().commit((t) => deleteSheet(t, current))} title="Delete this chart">
          Delete chart
        </button>
      </div>
    </div>
  );
}

function ChartNumber({ label, suffix, title, value, onCommit }: { label: string; suffix: string; title: string; value: string; onCommit(v: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label title={title}>
      {label}
      <input
        className="scale-input short"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft.replace(',', '.'));
          if (Number.isFinite(v) && draft !== value) onCommit(v);
          else setDraft(value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix}
    </label>
  );
}

function LoadDialog({ onLoad, onClose, onError }: { onLoad(t: ChartTemplate): void; onClose(): void; onError(msg: string): void }) {
  const users = listUserTemplates();
  const builtins = BUILTIN_TEMPLATES.map((f) => f());
  const all = [...users, ...builtins];
  const [id, setId] = useState(all[0]?.id ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.getElementById('load-select')?.focus();
  }, []);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-title"
        onSubmit={(e) => {
          e.preventDefault();
          const t = all.find((x) => x.id === id);
          if (t) onLoad(t);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
      >
        <h3 id="load-title">Load template</h3>
        <select id="load-select" size={Math.min(8, all.length + 2)} value={id} onChange={(e) => setId(e.target.value)} onDoubleClick={() => all.find((x) => x.id === id) && onLoad(all.find((x) => x.id === id)!)}>
          {users.length > 0 && (
            <optgroup label="My templates">
              {users.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Built-in">
            {builtins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
        <div className="dialog-actions">
          <button type="button" className="push-left" onClick={() => fileRef.current?.click()}>
            Import file…
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!id}>
            Load
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              onLoad(await importTemplateFile(f));
            } catch (err) {
              onError((err as Error).message);
            }
          }}
        />
      </form>
    </div>
  );
}

function ScaleQuick() {
  const template = useEditor((s) => s.template!);
  const scale = template.scale;
  const [draft, setDraft] = useState(String(scale.horizontal));
  const [route, setRoute] = useState((scale.routeLength / 1000).toFixed(3));
  useEffect(() => setDraft(String(scale.horizontal)), [scale.horizontal]);
  useEffect(() => setRoute((scale.routeLength / 1000).toFixed(3)), [scale.routeLength]);
  const [overlap, setOverlap] = useState(String(scale.overlap));
  useEffect(() => setOverlap(String(scale.overlap)), [scale.overlap]);
  const hasRoute = useSurvey((s) => !!s.source);
  const reversed = useSurvey((s) => s.reversed);
  const shifted = !!scale.sheets;
  return (
    <>
      <label title="Plan view scale. The panel keeps its size; this sets how much route fits in it.">
        Scale 1:
        <input
          className="scale-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = parseFloat(draft);
            if (v > 0 && v !== scale.horizontal) useEditor.getState().setHorizontalScale(v);
            else setDraft(String(scale.horizontal));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="muted"> {(scale.kpPerSheet / 1000).toFixed(3)} km/chart</span>
      </label>
      <label title="Survey line length. Filled in from the route file once data import arrives.">
        Route
        <input
          className="scale-input"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          onBlur={() => {
            const v = parseFloat(route) * 1000;
            if (v > 0 && v !== scale.routeLength) useEditor.getState().setScale({ routeLength: v });
            else setRoute((scale.routeLength / 1000).toFixed(3));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        km
        <span className="muted"> = {sheetCount(template)} charts</span>
      </label>
      <label title="How far each chart overlaps the one before it, in metres">
        Overlap
        <input
          className="scale-input short"
          value={overlap}
          onChange={(e) => setOverlap(e.target.value)}
          onBlur={() => {
            const v = parseFloat(overlap);
            if (v >= 0 && v < scale.kpPerSheet && v !== scale.overlap) useEditor.getState().setScale({ overlap: v });
            else setOverlap(String(scale.overlap));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        m
      </label>
      {hasRoute && (
        <label className="check" title="Run KP from the other end of the line. The first chart always starts at KP 0.">
          <input
            type="checkbox"
            checked={reversed}
            onChange={(e) => {
              useSurvey.getState().setReversed(e.target.checked);
              useEditor.getState().setScale({ sheets: undefined });
            }}
          />
          Reverse route
        </label>
      )}
      {shifted && (
        <button onClick={() => useEditor.getState().setScale({ sheets: undefined })} title="Put every chart frame back to the evenly spaced positions">
          Reset frames
        </button>
      )}
    </>
  );
}
