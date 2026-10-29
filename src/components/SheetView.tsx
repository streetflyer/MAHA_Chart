import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { movePanels, resizeEdge, snap, type Edge } from '../model/layout';
import { resolveTokens } from '../model/scale';
import { templateTokens } from '../model/tokens';
import type { ChartTemplate, ImageItem, Panel, Selection, TextItem } from '../model/types';
import { useEditor } from '../state/store';
import { fitInto, readImageFile } from './imageImport';
import { InlineEditor } from './InlineEditor';
import { PanelContent, TITLE_INSIDE_H } from './PanelContent';
import { approxTextWidth, fontSize } from './svgText';

export interface ContextTarget {
  kind: 'panel' | 'text' | 'image' | 'row' | 'sheet';
  id?: string;
  rowId?: string;
}

interface Props {
  onContextMenu(clientX: number, clientY: number, at: { x: number; y: number }, target: ContextTarget): void;
  onCursor(at: { x: number; y: number } | null): void;
  onOpenProperties(): void;
  onNotice(msg: string): void;
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
  | { type: 'move'; start: Pt; panelIds: string[]; textIds: string[]; imageIds: string[]; moved: boolean; wasSelected: boolean; hit: Selection }
  | { type: 'imgResize'; start: Pt; id: string; sx: number; sy: number; origin: ImageItem }
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

export function SheetView({ onContextMenu, onCursor, onOpenProperties, onNotice, fitSignal, dark }: Props) {
  const template = useEditor((s) => s.template)!;
  const selection = useEditor((s) => s.selection);
  const editing = useEditor((s) => s.editing);
  const sheetIndex = useEditor((s) => s.sheetIndex);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewBox>({ x: -10, y: -10, w: template.paper.width + 20, h: template.paper.height + 20 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const spaceDown = useRef(false);
  const renameTimer = useRef<number | null>(null);

  const tokens = useMemo(() => templateTokens(template, sheetIndex), [template, sheetIndex]);
  const images = template.images ?? [];
  const selectedImageIds = useMemo(() => new Set(selection.filter((s) => s.kind === 'image').map((s) => s.id)), [selection]);
  const isSelected = (s: Selection) => (s.kind === 'panel' ? selectedPanelIds : s.kind === 'text' ? selectedTextIds : selectedImageIds).has(s.id);
  const lockedPanel = (id?: string) => !!id && !!template.panels.find((p) => p.id === id)?.locked;
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
    const imgHandle = el.closest('[data-img-handle]');
    svgRef.current!.setPointerCapture(e.pointerId);

    if (imgHandle) {
      const id = imgHandle.getAttribute('data-img-handle')!;
      const [sx, sy] = imgHandle.getAttribute('data-dir')!.split(',').map(Number);
      const img = images.find((x) => x.id === id)!;
      store().beginGesture();
      setDrag({ type: 'imgResize', start: at, id, sx, sy, origin: img });
      return;
    }

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
      const kind = itemEl.getAttribute('data-kind') as Selection['kind'];
      const id = itemEl.getAttribute('data-item')!;
      const hit: Selection = { kind, id };
      const wasSelected = isSelected(hit);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        store().select(hit, true);
        return;
      }
      if (!wasSelected) store().select(hit);
      const sel = wasSelected ? store().selection : [hit];
      const panelIds = sel.filter((s) => s.kind === 'panel').map((s) => s.id).filter((pid) => !template.panels.find((p) => p.id === pid)?.locked);
      const textIds = sel.filter((s) => s.kind === 'text').map((s) => s.id);
      const imageIds = sel.filter((s) => s.kind === 'image').map((s) => s.id).filter((iid) => !lockedPanel(images.find((x) => x.id === iid)?.panelId));
      store().beginGesture();
      setDrag({ type: 'move', start: at, panelIds, textIds, imageIds, moved: false, wasSelected, hit });
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
      const imageIds = new Set(drag.imageIds);
      store().updateGesture((t) => ({
        ...t,
        panels: movePanels(t.panels, drag.panelIds, dx, dy),
        texts: t.texts.map((x) => (textIds.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)),
        images: (t.images ?? []).map((x) => (imageIds.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)),
      }));
      if (!drag.moved) setDrag({ ...drag, moved: true });
      return;
    }
    if (drag.type === 'imgResize') {
      // Corner drag keeps the logo's proportions; hold Shift to stretch freely.
      const o = drag.origin;
      let w = Math.max(3, o.w + drag.sx * (at.x - drag.start.x));
      let h = Math.max(3, o.h + drag.sy * (at.y - drag.start.y));
      if (!e.shiftKey) {
        const k = Math.max(w / o.w, h / o.h);
        w = o.w * k;
        h = o.h * k;
      }
      const x = drag.sx < 0 ? o.x + o.w - w : o.x;
      const y = drag.sy < 0 ? o.y + o.h - h : o.y;
      store().updateGesture((t) => ({ ...t, images: (t.images ?? []).map((im) => (im.id === drag.id ? { ...im, x, y, w, h } : im)) }));
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
        if (hit.kind !== 'image')
          renameTimer.current = window.setTimeout(() => {
            renameTimer.current = null;
            store().startEdit(hit.kind === 'text' ? { kind: 'text', id: hit.id } : { kind: 'panelTitle', id: hit.id });
          }, SLOW_CLICK_MS);
      }
    } else if (drag.type === 'edge' || drag.type === 'imgResize') {
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
        for (const im of images) {
          const r = imageRect(im, template);
          if (r.x >= x0 && r.y >= y0 && r.x + r.w <= x1 && r.y + r.h <= y1) hits.push({ kind: 'image', id: im.id });
        }
        store().select(hits, drag.additive);
      }
    }
    setGuides({});
    setDrag(null);
  }

  function onDoubleClick(e: React.MouseEvent) {
    clearRenameTimer();
    // The svg holds pointer capture from the first click, so e.target is the svg itself.
    // Resize grips drawn on the selection sit over cells at the panel edge, so look beneath them.
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => !x.closest('[data-edge],[data-img-handle]')) ?? (e.target as Element);
    const itemEl = el.closest('[data-item]');
    // Double-click on empty paper zooms to fit, like a CAD viewport.
    if (!itemEl) return fit();
    const kind = itemEl.getAttribute('data-kind');
    const id = itemEl.getAttribute('data-item')!;
    if (kind === 'text') return store().startEdit({ kind: 'text', id });
    if (kind === 'image') return onOpenProperties();
    const rev = el.closest('[data-rev]');
    if (rev) return store().startEdit({ kind: 'revision', id, rowId: rev.getAttribute('data-rev')!, col: rev.getAttribute('data-col')! });
    const field = el.closest('[data-field]');
    if (field) return store().startEdit({ kind: 'field', id, col: field.getAttribute('data-field')! });
    if (el.closest('[data-body2]')) return store().startEdit({ kind: 'panelBody2', id });
    const p = template.panels.find((x) => x.id === id);
    if (p && p.body !== undefined) return store().startEdit({ kind: 'panelBody', id });
    onOpenProperties();
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    const at = toMm(e.clientX, e.clientY);
    const imagesIn = files.filter((f) => f.type.startsWith('image/'));
    const other = files.filter((f) => !f.type.startsWith('image/'));
    if (other.length) onNotice(`Survey data import (${other.map((f) => f.name).join(', ')}) arrives in step 2. Images can be dropped now.`);
    // Drop onto the innermost panel under the cursor; logos fit inside its box.
    const target = [...template.panels]
      .reverse()
      .find((p) => at.x >= p.x && at.x <= p.x + p.w && at.y >= p.y && at.y <= p.y + p.h && p.type !== 'chartInfo');
    for (const [i, f] of imagesIn.entries()) {
      try {
        const img = await readImageFile(f);
        if (target) {
          const top = target.titlePosition === 'inside' ? TITLE_INSIDE_H : 1;
          const box = { x: 1.5, y: top, w: target.w - 3, h: target.h - top - 1.5 };
          const r = fitInto(img.width, img.height, box);
          store().addImage({ panelId: target.id, ...r, x: r.x + i * 4, src: img.src, name: f.name });
        } else {
          const w = 40;
          store().addImage({ x: at.x + i * 4, y: at.y + i * 4, w, h: (w * img.height) / img.width, src: img.src, name: f.name });
        }
      } catch (err) {
        onNotice((err as Error).message);
      }
    }
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
      const kind = itemEl.getAttribute('data-kind') as Selection['kind'];
      const id = itemEl.getAttribute('data-item')!;
      if (!isSelected({ kind, id })) store().select({ kind, id });
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
    <div className={`sheet-wrap${dark ? ' dark' : ''}`} ref={wrapRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
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
        style={{ cursor, fontFamily: `${template.fontFamily ?? 'Arial'}, Arial, Helvetica, sans-serif` }}
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
            hasImage={images.some((im) => im.panelId === p.id)}
          />
        ))}
        {images.map((im) => (
          <ImageView key={im.id} im={im} template={template} selected={selectedImageIds.has(im.id)} locked={lockedPanel(im.panelId)} handle={handle} />
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

export function imageRect(im: ImageItem, t: ChartTemplate) {
  const p = im.panelId ? t.panels.find((x) => x.id === im.panelId) : undefined;
  return { x: (p?.x ?? 0) + im.x, y: (p?.y ?? 0) + im.y, w: im.w, h: im.h };
}

function ImageView({ im, template, selected, locked, handle }: { im: ImageItem; template: ChartTemplate; selected: boolean; locked: boolean; handle: number }) {
  const r = imageRect(im, template);
  const corners = [
    [-1, -1, r.x, r.y, 'nwse-resize'],
    [1, -1, r.x + r.w, r.y, 'nesw-resize'],
    [-1, 1, r.x, r.y + r.h, 'nesw-resize'],
    [1, 1, r.x + r.w, r.y + r.h, 'nwse-resize'],
  ] as const;
  return (
    <g className="image-item">
      <g data-item={im.id} data-kind="image">
        <image href={im.src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="xMidYMid meet" />
        <rect className="text-hit" x={r.x} y={r.y} width={r.w} height={r.h} />
      </g>
      {selected && <rect className="sel-outline" x={r.x} y={r.y} width={r.w} height={r.h} />}
      {selected &&
        !locked &&
        corners.map(([sx, sy, x, y, cur]) => (
          <rect key={`${sx}${sy}`} className="handle" data-img-handle={im.id} data-dir={`${sx},${sy}`} x={x - handle / 2} y={y - handle / 2} width={handle} height={handle} style={{ cursor: cur }} />
        ))}
    </g>
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
  hasImage: boolean;
}

function PanelView({ p, template, tokens, selected, hitW, handle, hoverEdge, editingTitle, hasImage }: PanelViewProps) {
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
          hasImage={hasImage}
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

