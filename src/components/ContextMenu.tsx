import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { label: string; shortcut?: string; disabled?: boolean; checked?: boolean; action?: () => void; submenu?: MenuItem[] }
  | 'separator';

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}

/** A Windows-style context menu: keyboard navigable, closes on outside click or Escape. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}

function MenuList({ items, onClose }: { items: MenuItem[]; onClose(): void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul role="menu">
      {items.map((it, i) =>
        it === 'separator' ? (
          <li key={i} className="sep" role="separator" />
        ) : (
          <li
            key={i}
            role="menuitem"
            aria-disabled={it.disabled}
            className={`${it.disabled ? 'disabled' : ''}${it.submenu ? ' has-sub' : ''}${open === i ? ' open' : ''}`}
            onPointerEnter={() => setOpen(it.submenu ? i : null)}
            onClick={() => {
              if (it.disabled || it.submenu) return;
              onClose();
              it.action?.();
            }}
          >
            <span className="check">{it.checked ? '✓' : ''}</span>
            <span className="label">{it.label}</span>
            <span className="shortcut">{it.shortcut ?? (it.submenu ? '›' : '')}</span>
            {it.submenu && open === i && (
              <div className="context-menu sub">
                <MenuList items={it.submenu} onClose={onClose} />
              </div>
            )}
          </li>
        ),
      )}
    </ul>
  );
}
