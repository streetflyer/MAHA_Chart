import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/*
 * In-page replacements for window.prompt / window.confirm, which embedded
 * browsers and sandboxed frames often block.
 */

interface Request {
  kind: 'text' | 'confirm';
  title: string;
  message?: string;
  initial?: string;
  okLabel: string;
  danger?: boolean;
  resolve(v: string | boolean | null): void;
}

const useDialog = create<{ req: Request | null }>(() => ({ req: null }));

export function askText(title: string, initial = '', okLabel = 'OK'): Promise<string | null> {
  return new Promise((resolve) => useDialog.setState({ req: { kind: 'text', title, initial, okLabel, resolve: (v) => resolve(v as string | null) } }));
}

export function askConfirm(title: string, message: string, okLabel = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => useDialog.setState({ req: { kind: 'confirm', title, message, okLabel, danger, resolve: (v) => resolve(v === true) } }));
}

export function DialogHost() {
  const req = useDialog((s) => s.req);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    setValue(req.initial ?? '');
    setTimeout(() => (req.kind === 'text' ? inputRef.current?.select() : okRef.current?.focus()), 0);
  }, [req]);

  if (!req) return null;
  const close = (v: string | boolean | null) => {
    useDialog.setState({ req: null });
    req.resolve(v);
  };
  const ok = () => {
    if (req.kind === 'text') {
      if (value.trim()) close(value.trim());
    } else close(true);
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(req.kind === 'text' ? null : false)}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close(req.kind === 'text' ? null : false);
        }}
      >
        <h3 id="dialog-title">{req.title}</h3>
        {req.message && <p>{req.message}</p>}
        {req.kind === 'text' && <input id="dialog-input" ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />}
        <div className="dialog-actions">
          <button type="button" onClick={() => close(req.kind === 'text' ? null : false)}>
            Cancel
          </button>
          <button ref={okRef} type="submit" className={req.danger ? 'primary danger-fill' : 'primary'} disabled={req.kind === 'text' && !value.trim()}>
            {req.okLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
