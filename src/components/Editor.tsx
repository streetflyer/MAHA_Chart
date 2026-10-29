import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../model/ids';
import { PAPER_SIZES } from '../model/paper';
import { exportTemplateFile, saveUserTemplate } from '../model/storage';
import type { PanelType, PaperSizeName } from '../model/types';
import { ADDABLE_TYPES, PANEL_DEFAULTS } from '../state/panelDefaults';
import { useEditor } from '../state/store';
import { ContextMenu, type MenuItem } from './ContextMenu';
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

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const save = useCallback(
    (asNew: boolean) => {
      const t = s().template!;
      let name = t.name;
      if (asNew || t.builtIn) {
        const answer = window.prompt('Save template as:', t.builtIn ? `${t.name} (copy)` : t.name);
        if (!answer) return;
        name = answer.trim();
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

  function exit() {
    if (dirty && !window.confirm('You have unsaved changes to this template. Leave anyway?')) return;
    onExit();
  }

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
        </div>
        <div className="group right">
          <button onClick={() => setFitSignal((n) => n + 1)} title="Zoom to fit (Ctrl+0)">
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
        <SheetView onContextMenu={openMenu} onCursor={setCursor} onOpenProperties={focusProps} fitSignal={fitSignal} dark={dark} />
        <div ref={propsRef} className="props-wrap">
          <PropertiesPanel />
        </div>
      </div>
      <footer className="statusbar">
        <span>{cursor ? `X ${cursor.x.toFixed(1)}  Y ${cursor.y.toFixed(1)} mm` : ' '}</span>
        <span>
          {template.paper.size} {template.paper.width.toFixed(0)}×{template.paper.height.toFixed(0)} mm
        </span>
        <span className="hint-text">Drag edges to move dividers (Alt = this panel only) · Wheel to zoom · Space/middle-drag to pan · F2 rename · Right-click for more</span>
      </footer>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ScaleQuick() {
  const scale = useEditor((s) => s.template!.scale);
  const [draft, setDraft] = useState(String(scale.horizontal));
  useEffect(() => setDraft(String(scale.horizontal)), [scale.horizontal]);
  return (
    <label title="Horizontal scale. Linked to the plan view width and the Chart Information scale bar.">
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
      <span className="muted"> {(scale.kpPerSheet / 1000).toFixed(3)} km/sheet</span>
    </label>
  );
}
