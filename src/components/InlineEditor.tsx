import { useEffect, useRef, useState } from 'react';
import type { ChartTemplate } from '../model/types';
import { useEditor, type InlineEdit } from '../state/store';
import { textPos, titleRect } from './SheetView';
import { approxTextWidth, fontSize } from './svgText';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function targetRect(e: InlineEdit, t: ChartTemplate): { rect: Rect; value: string; multiline: boolean; cap: number } | null {
  if (e.kind === 'text') {
    const tx = t.texts.find((x) => x.id === e.id);
    if (!tx) return null;
    const pos = textPos(tx, t);
    const w = Math.max(40, approxTextWidth(tx.text, tx.size) + 10);
    const x = tx.anchor === 'middle' ? pos.x - w / 2 : tx.anchor === 'end' ? pos.x - w : pos.x;
    return { rect: { x, y: pos.y - fontSize(tx.size), w, h: fontSize(tx.size) * 1.5 }, value: tx.text, multiline: false, cap: tx.size };
  }
  const p = t.panels.find((x) => x.id === e.id);
  if (!p) return null;
  if (e.kind === 'panelTitle') {
    const r = p.titlePosition === 'none' ? { x: p.x, y: p.y, w: p.w, h: 5 } : titleRect(p);
    return { rect: r, value: p.title, multiline: false, cap: 2.2 };
  }
  if (e.kind === 'row') {
    const rows = p.rows ?? [];
    const i = rows.findIndex((r) => r.id === e.rowId);
    if (i < 0) return null;
    const rh = p.h / rows.length;
    return { rect: { x: p.x, y: p.y + i * rh, w: Math.max(p.labelWidth ?? 30, 60), h: Math.max(rh, 6) }, value: rows[i].label, multiline: false, cap: 1.8 };
  }
  const top = p.titlePosition === 'inside' ? p.y + 5 : p.y;
  return { rect: { x: p.x, y: top, w: p.w, h: Math.max(p.y + p.h - top, 20) }, value: p.body ?? '', multiline: true, cap: 1.8 };
}

/**
 * The rename / edit box laid over the sheet. Enter (or Ctrl+Enter for multi-line
 * text) commits, Escape cancels, clicking elsewhere commits — like Windows Explorer.
 */
export function InlineEditor({ svg, wrap }: { svg: SVGSVGElement; wrap: HTMLDivElement }) {
  const editing = useEditor((s) => s.editing)!;
  const template = useEditor((s) => s.template)!;
  const target = targetRect(editing, template);
  const [value, setValue] = useState(target?.value ?? '');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  if (!target) return null;
  const ctm = svg.getScreenCTM();
  const box = wrap.getBoundingClientRect();
  if (!ctm) return null;
  const tl = new DOMPoint(target.rect.x, target.rect.y).matrixTransform(ctm);
  const br = new DOMPoint(target.rect.x + target.rect.w, target.rect.y + target.rect.h).matrixTransform(ctm);
  const style: React.CSSProperties = {
    left: tl.x - box.left,
    top: tl.y - box.top,
    width: Math.max(br.x - tl.x, 120),
    height: target.multiline ? Math.max(br.y - tl.y, 80) : Math.max(br.y - tl.y, 22),
    fontSize: Math.min(Math.max(fontSize(target.cap) * ctm.a, 11), 18),
  };

  function finish(commit: boolean) {
    if (done.current) return;
    done.current = true;
    const s = useEditor.getState();
    if (commit && value !== target!.value) {
      const e = editing;
      if (e.kind === 'text') s.updateText(e.id, { text: value });
      else if (e.kind === 'panelTitle') s.updatePanel(e.id, { title: value });
      else if (e.kind === 'panelBody') s.updatePanel(e.id, { body: value });
      else if (e.kind === 'row') {
        const p = s.template!.panels.find((x) => x.id === e.id)!;
        s.updatePanel(e.id, { rows: (p.rows ?? []).map((r) => (r.id === e.rowId ? { ...r, label: value } : r)) });
      }
    }
    s.startEdit(null);
  }

  const common = {
    ref,
    className: 'inline-editor',
    style,
    value,
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(ev.target.value),
    onBlur: () => finish(true),
    onPointerDown: (ev: React.PointerEvent) => ev.stopPropagation(),
    onKeyDown: (ev: React.KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') finish(false);
      else if (ev.key === 'Enter' && (!target.multiline || ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        finish(true);
      }
    },
  };
  return target.multiline ? <textarea {...common} title="Ctrl+Enter to finish, Esc to cancel" /> : <input {...common} />;
}
