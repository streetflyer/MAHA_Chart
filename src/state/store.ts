import { create } from 'zustand';
import { newId } from '../model/ids';
import { descendants, movePanels, splitPanel } from '../model/layout';
import { paperDimensions, resizePaper } from '../model/paper';
import { alignKpPanels, planPanel, setHorizontalScale, setKpPerSheet, syncScaleToPlan } from '../model/scale';
import type { ChartTemplate, Panel, PanelType, PaperSizeName, ScaleSettings, Selection, TextItem } from '../model/types';
import { PANEL_DEFAULTS } from './panelDefaults';

const HISTORY_LIMIT = 200;

export interface InlineEdit {
  kind: 'panelTitle' | 'panelBody' | 'text' | 'row';
  id: string;
  rowId?: string;
}

interface Clip {
  panels: Panel[];
  texts: TextItem[];
}

interface EditorState {
  template: ChartTemplate | null;
  selection: Selection[];
  past: ChartTemplate[];
  future: ChartTemplate[];
  dirty: boolean;
  editing: InlineEdit | null;
  clipboard: Clip | null;
  gestureBase: ChartTemplate | null;

  open(t: ChartTemplate): void;
  close(): void;
  markSaved(t: ChartTemplate): void;

  /** One undoable change. */
  commit(fn: (t: ChartTemplate) => ChartTemplate): void;
  /** Drag gestures: preview many frames, record one undo step. */
  beginGesture(): void;
  updateGesture(fn: (base: ChartTemplate) => ChartTemplate): void;
  endGesture(): void;

  undo(): void;
  redo(): void;

  select(sel: Selection[] | Selection | null, additive?: boolean): void;
  startEdit(e: InlineEdit | null): void;

  updatePanel(id: string, patch: Partial<Panel>): void;
  updateText(id: string, patch: Partial<TextItem>): void;
  addPanel(type: PanelType, at?: { x: number; y: number }, parentId?: string): void;
  addText(at: { x: number; y: number }, panelId?: string): void;
  deleteSelection(): void;
  copySelection(): void;
  cutSelection(): void;
  paste(at?: { x: number; y: number }): void;
  duplicateSelection(): void;
  nudgeSelection(dx: number, dy: number): void;
  reorderSelection(where: 'front' | 'back'): void;
  splitSelected(direction: 'horizontal' | 'vertical'): void;
  toggleLockSelection(): void;

  setPaper(size: PaperSizeName, orientation: 'landscape' | 'portrait', custom?: [number, number]): void;
  setHorizontalScale(v: number): void;
  setKpPerSheet(m: number): void;
  setScale(patch: Partial<ScaleSettings>): void;
  setField(key: string, value: string): void;
  renameTemplate(name: string): void;
}

/**
 * Keeps the linked layout consistent after any change: KP-aligned panels share
 * the plan view's horizontal extent, and the scale follows the plan view width.
 */
export function normalize(prev: ChartTemplate, next: ChartTemplate): ChartTemplate {
  const prevPlan = planPanel(prev);
  let plan = planPanel(next);
  if (!plan || !prevPlan) return next;
  let t = next;
  const planChanged = plan.x !== prevPlan.x || plan.w !== prevPlan.w;
  if (!planChanged) {
    // A KP-aligned panel was resized on its own: the plan view (and the rest) follow it.
    const lead = next.panels.find((p) => {
      if (!p.kpAligned) return false;
      const before = prev.panels.find((q) => q.id === p.id);
      return before && (before.x !== p.x || before.w !== p.w);
    });
    if (lead) {
      t = { ...t, panels: t.panels.map((p) => (p.id === plan!.id ? { ...p, x: lead.x, w: lead.w } : p)) };
      plan = planPanel(t)!;
    }
  }
  if (plan.w !== prevPlan.w) return syncScaleToPlan(t);
  return alignKpPanels(t);
}

function selectedIds(sel: Selection[], kind: Selection['kind']): string[] {
  return sel.filter((s) => s.kind === kind).map((s) => s.id);
}

export const useEditor = create<EditorState>((set, get) => ({
  template: null,
  selection: [],
  past: [],
  future: [],
  dirty: false,
  editing: null,
  clipboard: null,
  gestureBase: null,

  open(t) {
    set({ template: structuredClone(t), selection: [], past: [], future: [], dirty: false, editing: null });
  },
  close() {
    set({ template: null, selection: [], past: [], future: [], dirty: false, editing: null });
  },
  markSaved(t) {
    set({ template: t, dirty: false });
  },

  commit(fn) {
    const cur = get().template;
    if (!cur) return;
    const next = normalize(cur, fn(cur));
    if (next === cur) return;
    set({ template: next, past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [], dirty: true });
  },
  beginGesture() {
    set({ gestureBase: get().template });
  },
  updateGesture(fn) {
    const base = get().gestureBase;
    if (!base) return;
    set({ template: normalize(base, fn(base)) });
  },
  endGesture() {
    const { gestureBase, template, past } = get();
    if (gestureBase && template && gestureBase !== template) {
      set({ past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [], dirty: true });
    }
    set({ gestureBase: null });
  },

  undo() {
    const { past, template, future } = get();
    if (!past.length || !template) return;
    set({ template: past[past.length - 1], past: past.slice(0, -1), future: [template, ...future], dirty: true, editing: null });
  },
  redo() {
    const { past, template, future } = get();
    if (!future.length || !template) return;
    set({ template: future[0], past: [...past, template], future: future.slice(1), dirty: true, editing: null });
  },

  select(sel, additive = false) {
    const list = sel === null ? [] : Array.isArray(sel) ? sel : [sel];
    if (!additive) return set({ selection: list });
    const cur = get().selection;
    const out = [...cur];
    for (const s of list) {
      const i = out.findIndex((x) => x.kind === s.kind && x.id === s.id);
      if (i >= 0) out.splice(i, 1);
      else out.push(s);
    }
    set({ selection: out });
  },
  startEdit(e) {
    set({ editing: e });
  },

  updatePanel(id, patch) {
    get().commit((t) => ({ ...t, panels: t.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  updateText(id, patch) {
    get().commit((t) => ({ ...t, texts: t.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  },
  addPanel(type, at, parentId) {
    const d = PANEL_DEFAULTS[type];
    const id = newId('p');
    const t = get().template;
    if (!t) return;
    const w = Math.min(d.w, t.paper.width / 3);
    const h = Math.min(d.h, t.paper.height / 3);
    const panel: Panel = {
      id,
      type,
      title: d.title,
      titlePosition: d.titlePosition,
      x: at?.x ?? (t.paper.width - w) / 2,
      y: at?.y ?? (t.paper.height - h) / 2,
      w,
      h,
      parentId,
      ...(d.extra?.() ?? {}),
    };
    get().commit((tt) => ({ ...tt, panels: [...tt.panels, panel] }));
    set({ selection: [{ kind: 'panel', id }] });
  },
  addText(at, panelId) {
    const id = newId('t');
    const item: TextItem = { id, panelId, x: at.x, y: at.y, text: 'New text', size: 2.5, anchor: 'start' };
    get().commit((t) => ({ ...t, texts: [...t.texts, item] }));
    set({ selection: [{ kind: 'text', id }], editing: { kind: 'text', id } });
  },
  deleteSelection() {
    const { selection, template } = get();
    if (!template || !selection.length) return;
    const pids = selectedIds(selection, 'panel').filter((id) => !template.panels.find((p) => p.id === id)?.locked);
    const all = new Set(pids.flatMap((id) => [id, ...descendants(template.panels, id)]));
    const tids = new Set(selectedIds(selection, 'text'));
    get().commit((t) => ({
      ...t,
      panels: t.panels.filter((p) => !all.has(p.id)),
      texts: t.texts.filter((x) => !tids.has(x.id) && !(x.panelId && all.has(x.panelId))),
    }));
    set({ selection: [] });
  },
  copySelection() {
    const { selection, template } = get();
    if (!template) return;
    // The plan view drives the sheet's scale, so there is only ever one.
    const pids = selectedIds(selection, 'panel').filter((id) => template.panels.find((p) => p.id === id)?.type !== 'plan');
    const all = new Set(pids.flatMap((id) => [id, ...descendants(template.panels, id)]));
    const tids = new Set(selectedIds(selection, 'text'));
    set({
      clipboard: {
        panels: structuredClone(template.panels.filter((p) => all.has(p.id))),
        texts: structuredClone(template.texts.filter((x) => tids.has(x.id) || (x.panelId && all.has(x.panelId)))),
      },
    });
  },
  cutSelection() {
    get().copySelection();
    get().deleteSelection();
  },
  paste(at) {
    const clip = get().clipboard;
    if (!clip || (!clip.panels.length && !clip.texts.length)) return;
    const idMap = new Map<string, string>();
    for (const p of clip.panels) idMap.set(p.id, newId('p'));
    for (const x of clip.texts) idMap.set(x.id, newId('t'));
    const tops = clip.panels.filter((p) => !p.parentId || !idMap.has(p.parentId));
    const sheetTexts = clip.texts.filter((x) => !x.panelId || !idMap.has(x.panelId));
    const minX = Math.min(...tops.map((p) => p.x), ...sheetTexts.filter((x) => !x.panelId).map((x) => x.x));
    const minY = Math.min(...tops.map((p) => p.y), ...sheetTexts.filter((x) => !x.panelId).map((x) => x.y));
    const dx = at && Number.isFinite(minX) ? at.x - minX : 10;
    const dy = at && Number.isFinite(minY) ? at.y - minY : 10;
    const panels = clip.panels.map((p) => ({
      ...p,
      id: idMap.get(p.id)!,
      parentId: p.parentId && idMap.has(p.parentId) ? idMap.get(p.parentId) : undefined,
      x: p.x + dx,
      y: p.y + dy,
      kpAligned: false,
      locked: false,
      rows: p.rows?.map((r) => ({ ...r, id: newId('r') })),
    }));
    const texts = clip.texts.map((x) => {
      const inPasted = !!x.panelId && idMap.has(x.panelId);
      // Text inside a pasted panel keeps its place; text on another panel shifts a little; sheet text follows the paste point.
      const [ox, oy] = inPasted ? [0, 0] : x.panelId ? [5, 5] : [dx, dy];
      return { ...x, id: idMap.get(x.id)!, panelId: inPasted ? idMap.get(x.panelId!) : x.panelId, x: x.x + ox, y: x.y + oy };
    });
    get().commit((t) => ({ ...t, panels: [...t.panels, ...panels], texts: [...t.texts, ...texts] }));
    set({
      selection: [
        ...panels.filter((p) => !p.parentId).map((p) => ({ kind: 'panel' as const, id: p.id })),
        ...texts.filter((x) => !x.panelId || !panels.some((p) => p.id === x.panelId)).map((x) => ({ kind: 'text' as const, id: x.id })),
      ],
    });
  },
  duplicateSelection() {
    get().copySelection();
    get().paste();
  },
  nudgeSelection(dx, dy) {
    const { selection } = get();
    const pids = selectedIds(selection, 'panel');
    const tids = new Set(selectedIds(selection, 'text'));
    get().commit((t) => ({
      ...t,
      panels: movePanels(t.panels, pids, dx, dy),
      texts: t.texts.map((x) => (tids.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)),
    }));
  },
  reorderSelection(where) {
    const pids = new Set(selectedIds(get().selection, 'panel'));
    get().commit((t) => {
      const sel = t.panels.filter((p) => pids.has(p.id));
      const rest = t.panels.filter((p) => !pids.has(p.id));
      return { ...t, panels: where === 'front' ? [...rest, ...sel] : [...sel, ...rest] };
    });
  },
  splitSelected(direction) {
    const pid = selectedIds(get().selection, 'panel')[0];
    if (!pid) return;
    const id = newId('p');
    get().commit((t) => ({ ...t, panels: splitPanel(t.panels, pid, direction, id) }));
  },
  toggleLockSelection() {
    const pids = new Set(selectedIds(get().selection, 'panel'));
    const t = get().template;
    if (!t) return;
    const lock = !t.panels.filter((p) => pids.has(p.id)).every((p) => p.locked);
    get().commit((tt) => ({ ...tt, panels: tt.panels.map((p) => (pids.has(p.id) ? { ...p, locked: lock } : p)) }));
  },

  setPaper(size, orientation, custom) {
    const [w, h] = paperDimensions(size, orientation, custom);
    get().commit((t) => {
      const r = resizePaper(t, w, h);
      return { ...r, paper: { ...r.paper, size, orientation } };
    });
  },
  setHorizontalScale(v) {
    get().commit((t) => setHorizontalScale(t, v));
  },
  setKpPerSheet(m) {
    get().commit((t) => setKpPerSheet(t, m));
  },
  setScale(patch) {
    get().commit((t) => ({ ...t, scale: { ...t.scale, ...patch } }));
  },
  setField(key, value) {
    get().commit((t) => ({ ...t, fields: { ...t.fields, [key]: value } }));
  },
  renameTemplate(name) {
    get().commit((t) => ({ ...t, name }));
  },
}));
