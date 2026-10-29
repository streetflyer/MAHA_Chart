import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { movePanels, resizeEdge, snap, type Edge } from '../model/layout';
import { resolveTokens } from '../model/scale';
import { templateTokens } from '../model/tokens';
import type { ChartTemplate, Panel, Selection, TextItem } from '../model/types';
import { useEditor } from '../state/store';
import { InlineEditor } from './InlineEditor';
import { PanelContent } from './PanelContent';
import { approxTextWidth, fontSize } from './svgText';

export interface ContextTarget {
  kind: 'panel' | 'text' | 'row' | 'sheet';
  id?: string;
  rowId?: string;
}

interface Props {
  onContextMenu(clientX: number, clientY: number, at: { x: number; y: number }, target: ContextTarget): void;
  onCursor(at: { x: number; y: number } | null): void;
  onOpenProperties(): void;
  fitSignal: number;
  dark: boolean;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag =
  | { type: 'move'; start: Pt; panelIds: string[]; textIds: string[]; moved: boolean; wasSelected: boolean; hit: Selection }
  | { type: 'edge'; start: Pt; panelId: string; edges: Edge[]; origin: Record<Edge, number> }
  | { type: 'pan'; startClient: Pt; startView: ViewBox }
  | { type: 'marquee'; start: Pt; cur: Pt; additive: boolean };

interface Pt {
  x: number;
  y: number;
}

const SNAP_PX = 6;
const EDGE_HIT_PX = 6;
const SLOW_CLICK_MS = 550;

export function SheetView({ onContextMenu, onCursor, onOpenProperties, fitSignal, dark }: Props) {
  const template = useEditor((s) => s.template)!;
  const selection = useEditor((s) => s.selection);
  const editing = useEditor((s) => s.editing);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewBox>({ x: -10, y: -10, w: template.paper.width + 20, h: template.paper.height + 20 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const spaceDown = useRef(false);
  const renameTimer = useRef<number | null>(null);

  const tokens = useMemo(() => templateTokens(template), [template]);
  const selectedPanelIds = useMemo(() => new Set(selection.filter((s) => s.kind === 'panel').map((s) => s.id)), [selection]);
  const selectedTextIds = useMemo(() => new Set(selection.filter((s) => s.kind === 'text').map((s) => s.id)), [selection]);

  const fit = useCallback(() => {
    const m = Math.max(template.paper.width, template.paper.height) * 0.02;
    setView({ x: -m, y: -m, w: template.paper.width + 2 * m, h: template.paper.height + 2 * m });
  }, [template.paper.width, template.paper.height]);

  useEffect(fit, [fitSignal, template.paper.width, template.paper.height, fit]);

  // Re-render once the svg has a size so the inline editor can map coordinates.
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => forceRender((n) => n + 1));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toMm = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  /** Screen pixels per paper millimetre at the current zoom. */
  const pxPerMm = (): number => svgRef.current?.getScreenCTM()?.a ?? 1;

  // Zoom with the wheel around the cursor. Registered natively so preventDefault works.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toMm(e.clientX, e.clientY);
      const k = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.min(Math.max(v.w * k, 5), 20000);
        const h = (v.h * w) / v.w;
        return { x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toMm]);

  const store = useEditor.getState;

  function clearRenameTimer() {
    if (renameTimer.current !== null) {
      clearTimeout(renameTimer.current);
      renameTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    const at = toMm(e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      setDrag({ type: 'pan', startClient: { x: e.clientX, y: e.clientY }, startView: view });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const el = e.target as Element;
    const edgeEl = el.closest('[data-edge]');
    const itemEl = el.closest('[data-item]');
    svgRef.current!.setPointerCapture(e.pointerId);

    if (edgeEl) {
      const panelId = edgeEl.getAttribute('data-panel')!;
      const edges = edgeEl.getAttribute('data-edge')!.split(',') as Edge[];
      const p = template.panels.find((x) => x.id === panelId)!;
      if (p.locked) return;
      if (!selectedPanelIds.has(panelId)) store().select({ kind: 'panel', id: panelId });
      const origin = { left: p.x, right: p.x + p.w, top: p.y, bottom: p.y + p.h };
      store().beginGesture();
      setDrag({ type: 'edge', start: at, panelId, edges, origin });
      return;
    }
    if (itemEl) {
      const kind = itemEl.getAttribute('data-kind') as 'panel' | 'text';
      const id = itemEl.getAttribute('data-item')!;
      const hit: Selection = { kind, id };
      const wasSelected = kind === 'panel' ? selectedPanelIds.has(id) : selectedTextIds.has(id);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        store().select(hit, true);
        return;
      }
      if (!wasSelected) store().select(hit);
      const sel = wasSelected ? store().selection : [hit];
      const panelIds = sel.filter((s) => s.kind === 'panel').map((s) => s.id).filter((pid) => !template.panels.find((p) => p.id === pid)?.locked);
      const textIds = sel.filter((s) => s.kind === 'text').map((s) => s.id);
      store().beginGesture();
      setDrag({ type: 'move', start: at, panelIds, textIds, moved: false, wasSelected, hit });
      return;
    }
    setDrag({ type: 'marquee', start: at, cur: at, additive: e.shiftKey });
  }

  function onPointerMove(e: React.PointerEvent) {
    const at = toMm(e.clientX, e.clientY);
    onCursor(at);
    if (!drag) {
      const edgeEl = (e.target as Element).closest('[data-edge]');
      setHoverEdge(edgeEl ? `${edgeEl.getAttribute('data-panel')}:${edgeEl.getAttribute('data-edge')}` : null);
      return;
    }
    const tol = SNAP_PX / pxPerMm();
    if (drag.type === 'pan') {
      // Zoom doesn't change while panning, so the current pixel size applies to the whole drag.
      const s = 1 / pxPerMm();
      setView({ ...drag.startView, x: drag.startView.x - (e.clientX - drag.startClient.x) * s, y: drag.startView.y - (e.clientY - drag.startClient.y) * s });
      return;
    }
    if (drag.type === 'marquee') {
      setDrag({ ...drag, cur: at });
      return;
    }
    if (drag.type === 'move') {
      let dx = at.x - drag.start.x;
      let dy = at.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) * pxPerMm() < 3) return;
      clearRenameTimer();
      const base = useEditor.getState().gestureBase!;
      const lead = base.panels.find((p) => p.id === drag.panelIds[0]);
      const g: { x?: number; y?: number } = {};
      if (lead && !e.altKey) {
        const moving = new Set(drag.panelIds);
        const others = base.panels.filter((p) => !moving.has(p.id) && !moving.has(p.parentId ?? ''));
        const xs = [template.paper.frameInset, template.paper.width - template.paper.frameInset, ...others.flatMap((p) => [p.x, p.x + p.w])];
        const ys = [template.paper.frameInset, template.paper.height - template.paper.frameInset, ...others.flatMap((p) => [p.y, p.y + p.h])];
        const sl = snap(lead.x + dx, xs, tol);
        const sr = snap(lead.x + lead.w + dx, xs, tol);
        if (sl.guide !== undefined) [dx, g.x] = [sl.value - lead.x, sl.guide];
        else if (sr.guide !== undefined) [dx, g.x] = [sr.value - lead.x - lead.w, sr.guide];
        const st = snap(lead.y + dy, ys, tol);
        const sb = snap(lead.y + lead.h + dy, ys, tol);
        if (st.guide !== undefined) [dy, g.y] = [st.value - lead.y, st.guide];
        else if (sb.guide !== undefined) [dy, g.y] = [sb.value - lead.y - lead.h, sb.guide];
      }
      setGuides(g);
      const textIds = new Set(drag.textIds);
      store().updateGesture((t) => ({
        ...t,
        panels: movePanels(t.panels, drag.panelIds, dx, dy),
        texts: t.texts.map((x) => (textIds.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)),
      }));
      if (!drag.moved) setDrag({ ...drag, moved: true });
      return;
    }
    if (drag.type === 'edge') {
      const base = useEditor.getState().gestureBase!;
      const g: { x?: number; y?: number } = {};
      store().updateGesture((t) => {
        let panels = t.panels;
        for (const edge of drag.edges) {
          const vertical = edge === 'left' || edge === 'right';
          const raw = drag.origin[edge] + (vertical ? at.x - drag.start.x : at.y - drag.start.y);
          const others = base.panels.filter((p) => p.id !== drag.panelId);
          const cands = vertical
            ? [template.paper.frameInset, template.paper.width - template.paper.frameInset, ...others.flatMap((p) => [p.x, p.x + p.w])]
            : [template.paper.frameInset, template.paper.height - template.paper.frameInset, ...others.flatMap((p) => [p.y, p.y + p.h])];
          const s = e.altKey ? { value: raw } : snap(raw, cands, tol);
          if (s.guide !== undefined) g[vertical ? 'x' : 'y'] = s.guide;
          panels = resizeEdge(panels, drag.panelId, edge, s.value, !e.altKey);
        }
        return { ...t, panels };
      });
      setGuides(g);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    svgRef.current!.releasePointerCapture?.(e.pointerId);
    if (drag.type === 'move') {
      store().endGesture();
      // Windows-style slow click: clicking an already-selected item again starts a rename.
      if (!drag.moved && drag.wasSelected && store().selection.length === 1) {
        clearRenameTimer();
        const hit = drag.hit;
        renameTimer.current = window.setTimeout(() => {
          renameTimer.current = null;
          store().startEdit(hit.kind === 'text' ? { kind: 'text', id: hit.id } : { kind: 'panelTitle', id: hit.id });
        }, SLOW_CLICK_MS);
      }
    } else if (drag.type === 'edge') {
      store().endGesture();
    } else if (drag.type === 'marquee') {
      const x0 = Math.min(drag.start.x, drag.cur.x);
      const x1 = Math.max(drag.start.x, drag.cur.x);
      const y0 = Math.min(drag.start.y, drag.cur.y);
      const y1 = Math.max(drag.start.y, drag.cur.y);
      if ((x1 - x0) * pxPerMm() < 3 && (y1 - y0) * pxPerMm() < 3) {
        if (!drag.additive) store().select(null);
      } else {
        const inside = (p: Panel) => p.x >= x0 && p.y >= y0 && p.x + p.w <= x1 && p.y + p.h <= y1;
        const hits: Selection[] = template.panels.filter(inside).map((p) => ({ kind: 'panel', id: p.id }));
        for (const tx of template.texts) {
          const pos = textPos(tx, template);
          if (pos.x >= x0 && pos.x <= x1 && pos.y >= y0 && pos.y <= y1) hits.push({ kind: 'text', id: tx.id });
        }
        store().select(hits, drag.additive);
      }
    }
    setGuides({});
    setDrag(null);
  }

  function onDoubleClick(e: React.MouseEvent) {
    clearRenameTimer();
    const itemEl = (e.target as Element).closest('[data-item]');
    if (!itemEl) return;
    const kind = itemEl.getAttribute('data-kind');
    const id = itemEl.getAttribute('data-item')!;
    if (kind === 'text') return store().startEdit({ kind: 'text', id });
    const p = template.panels.find((x) => x.id === id);
    if (p && p.body !== undefined) return store().startEdit({ kind: 'panelBody', id });
    onOpenProperties();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    clearRenameTimer();
    const at = toMm(e.clientX, e.clientY);
    const rowEl = (e.target as Element).closest('[data-row]');
    const itemEl = (e.target as Element).closest('[data-item]');
    if (rowEl && itemEl) {
      const id = itemEl.getAttribute('data-item')!;
      if (!selectedPanelIds.has(id)) store().select({ kind: 'panel', id });
      return onContextMenu(e.clientX, e.clientY, at, { kind: 'row', id, rowId: rowEl.getAttribute('data-row')! });
    }
    if (itemEl) {
      const kind = itemEl.getAttribute('data-kind') as 'panel' | 'text';
      const id = itemEl.getAttribute('data-item')!;
      const already = kind === 'panel' ? selectedPanelIds.has(id) : selectedTextIds.has(id);
      if (!already) store().select({ kind, id });
      return onContextMenu(e.clientX, e.clientY, at, { kind, id });
    }
    onContextMenu(e.clientX, e.clientY, at, { kind: 'sheet' });
  }

  const px = pxPerMm();
  const hitW = EDGE_HIT_PX / px;
  const handle = 7 / px;

  const ordered = useMemo(() => {
    // Containers first so their sections draw on top of them.
    const tops = template.panels.filter((p) => !p.parentId);
    const out: Panel[] = [];
    const add = (p: Panel) => {
      out.push(p);
      template.panels.filter((c) => c.parentId === p.id).forEach(add);
    };
    tops.forEach(add);
    const seen = new Set(out.map((p) => p.id));
    return [...out, ...template.panels.filter((p) => !seen.has(p.id))];
  }, [template.panels]);

  const cursor = drag?.type === 'pan' ? 'grabbing' : spaceDown.current ? 'grab' : undefined;

  return (
    <div className={`sheet-wrap${dark ? ' dark' : ''}`} ref={wrapRef}>
      <svg
        ref={svgRef}
        className="sheet"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => onCursor(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ cursor }}
      >
        <rect className="paper" x={0} y={0} width={template.paper.width} height={template.paper.height} />
        <rect
          className="frame"
          x={template.paper.frameInset}
          y={template.paper.frameInset}
          width={template.paper.width - 2 * template.paper.frameInset}
          height={template.paper.height - 2 * template.paper.frameInset}
        />
        {ordered.map((p) => (
          <PanelView
            key={p.id}
            p={p}
            template={template}
            tokens={tokens}
            selected={selectedPanelIds.has(p.id)}
            hitW={hitW}
            handle={handle}
            hoverEdge={hoverEdge}
            editingTitle={editing?.kind === 'panelTitle' && editing.id === p.id}
          />
        ))}
        {template.texts.map((tx) => (
          <TextView key={tx.id} tx={tx} template={template} tokens={tokens} selected={selectedTextIds.has(tx.id)} editing={editing?.kind === 'text' && editing.id === tx.id} px={px} />
        ))}
        {guides.x !== undefined && <line className="guide" x1={guides.x} y1={view.y} x2={guides.x} y2={view.y + view.h} />}
        {guides.y !== undefined && <line className="guide" x1={view.x} y1={guides.y} x2={view.x + view.w} y2={guides.y} />}
        {drag?.type === 'marquee' && (
          <rect
            className="marquee"
            x={Math.min(drag.start.x, drag.cur.x)}
            y={Math.min(drag.start.y, drag.cur.y)}
            width={Math.abs(drag.cur.x - drag.start.x)}
            height={Math.abs(drag.cur.y - drag.start.y)}
          />
        )}
      </svg>
      {editing && svgRef.current && <InlineEditor svg={svgRef.current} wrap={wrapRef.current!} />}
    </div>
  );
}

export function textPos(tx: TextItem, t: ChartTemplate): Pt {
  const p = tx.panelId ? t.panels.find((x) => x.id === tx.panelId) : undefined;
  return { x: (p?.x ?? 0) + tx.x, y: (p?.y ?? 0) + tx.y };
}

const TITLE_CAP = 2.2;

export function titleRect(p: Panel): { x: number; y: number; w: number; h: number } {
  if (p.titlePosition === 'above') return { x: p.x, y: p.y - 6, w: p.w, h: 5 };
  return { x: p.x + 1, y: p.y + 0.5, w: p.w - 2, h: 4.5 };
}

interface PanelViewProps {
  p: Panel;
  template: ChartTemplate;
  tokens: Record<string, string>;
  selected: boolean;
  hitW: number;
  handle: number;
  hoverEdge: string | null;
  editingTitle: boolean;
}

function PanelView({ p, template, tokens, selected, hitW, handle, hoverEdge, editingTitle }: PanelViewProps) {
  const startEdit = useEditor((s) => s.startEdit);
  const title = resolveTokens(p.title, tokens);
  const edges: Array<{ e: Edge; x1: number; y1: number; x2: number; y2: number }> = [
    { e: 'left', x1: p.x, y1: p.y, x2: p.x, y2: p.y + p.h },
    { e: 'right', x1: p.x + p.w, y1: p.y, x2: p.x + p.w, y2: p.y + p.h },
    { e: 'top', x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y },
    { e: 'bottom', x1: p.x, y1: p.y + p.h, x2: p.x + p.w, y2: p.y + p.h },
  ];
  const corners: Array<{ es: Edge[]; x: number; y: number; cursor: string }> = [
    { es: ['left', 'top'], x: p.x, y: p.y, cursor: 'nwse-resize' },
    { es: ['right', 'top'], x: p.x + p.w, y: p.y, cursor: 'nesw-resize' },
    { es: ['left', 'bottom'], x: p.x, y: p.y + p.h, cursor: 'nesw-resize' },
    { es: ['right', 'bottom'], x: p.x + p.w, y: p.y + p.h, cursor: 'nwse-resize' },
  ];
  const isContainer = p.type === 'chartInfo';
  return (
    <g className={`panel type-${p.type}${selected ? ' selected' : ''}${p.locked ? ' locked' : ''}`}>
      <g data-item={p.id} data-kind="panel">
        <rect className={isContainer ? 'panel-box container' : 'panel-box'} x={p.x} y={p.y} width={p.w} height={p.h} style={p.fill ? { fill: p.fill } : undefined} />
        {p.titlePosition !== 'none' && !editingTitle && (
          <text
            className={p.titlePosition === 'above' ? 'panel-title above' : 'panel-title'}
            x={p.titlePosition === 'above' ? p.x + p.w / 2 : p.x + 2}
            y={p.titlePosition === 'above' ? p.y - 2 : p.y + 3.4}
            fontSize={fontSize(p.titlePosition === 'above' ? 2.5 : TITLE_CAP * 0.8)}
            textAnchor={p.titlePosition === 'above' ? 'middle' : 'start'}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEdit({ kind: 'panelTitle', id: p.id });
            }}
          >
            {title}
          </text>
        )}
        <PanelContent
          panel={p}
          template={template}
          tokens={tokens}
          onRowDoubleClick={(panelId, rowId) => startEdit({ kind: 'row', id: panelId, rowId })}
        />
      </g>
      {!p.locked &&
        edges.map((ed) => (
          <line
            key={ed.e}
            className={`edge-hit${hoverEdge === `${p.id}:${ed.e}` ? ' hover' : ''}`}
            data-edge={ed.e}
            data-panel={p.id}
            x1={ed.x1}
            y1={ed.y1}
            x2={ed.x2}
            y2={ed.y2}
            strokeWidth={hitW}
            style={{ cursor: ed.e === 'left' || ed.e === 'right' ? 'ew-resize' : 'ns-resize' }}
          />
        ))}
      {selected && <rect className="sel-outline" x={p.x} y={p.y} width={p.w} height={p.h} />}
      {selected &&
        !p.locked &&
        corners.map((c) => (
          <rect
            key={c.es.join()}
            className="handle"
            data-edge={c.es.join(',')}
            data-panel={p.id}
            x={c.x - handle / 2}
            y={c.y - handle / 2}
            width={handle}
            height={handle}
            style={{ cursor: c.cursor }}
          />
        ))}
    </g>
  );
}

function TextView({ tx, template, tokens, selected, editing, px }: { tx: TextItem; template: ChartTemplate; tokens: Record<string, string>; selected: boolean; editing: boolean; px: number }) {
  const pos = textPos(tx, template);
  const text = resolveTokens(tx.text, tokens);
  const w = approxTextWidth(text, tx.size);
  const h = fontSize(tx.size);
  const x0 = tx.anchor === 'middle' ? -w / 2 : tx.anchor === 'end' ? -w : 0;
  const pad = 2 / px;
  return (
    <g data-item={tx.id} data-kind="text" className={`text-item${selected ? ' selected' : ''}`} transform={`translate(${pos.x} ${pos.y}) rotate(${tx.rotation ?? 0})`}>
      <rect className="text-hit" x={x0 - pad} y={-h * 0.8 - pad} width={w + 2 * pad} height={h + 2 * pad} />
      {!editing && (
        <text x={0} y={0} fontSize={h} textAnchor={tx.anchor} fontWeight={tx.bold ? 'bold' : undefined} style={tx.color ? { fill: tx.color } : undefined}>
          {text}
        </text>
      )}
      {selected && <rect className="sel-outline" x={x0 - pad} y={-h * 0.8 - pad} width={w + 2 * pad} height={h + 2 * pad} />}
    </g>
  );
}

