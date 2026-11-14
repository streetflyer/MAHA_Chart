import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/*
 * In-page replacements for window.prompt / window.confirm, which embedded
 * browsers and sandboxed frames often block.
 */

interface Request {
  kind: "text" | "confirm" | "choice" | "codes";
  choices?: string[];
  items?: { code: string; note: string }[];
  title: string;
  message?: string;
  initial?: string;
  okLabel: string;
  danger?: boolean;
  resolve(v: string | boolean | string[] | null): void;
}

const useDialog = create<{ req: Request | null }>(() => ({ req: null }));

export function askText(
  title: string,
  initial = "",
  okLabel = "OK",
): Promise<string | null> {
  return new Promise((resolve) =>
    useDialog.setState({
      req: {
        kind: "text",
        title,
        initial,
        okLabel,
        resolve: (v) => resolve(v as string | null),
      },
    }),
  );
}

export function askConfirm(
  title: string,
  message: string,
  okLabel = "OK",
  danger = false,
): Promise<boolean> {
  return new Promise((resolve) =>
    useDialog.setState({
      req: {
        kind: "confirm",
        title,
        message,
        okLabel,
        danger,
        resolve: (v) => resolve(v === true),
      },
    }),
  );
}

/** A question with several answers; resolves with the index picked, or null when cancelled. */
export function askChoice(
  title: string,
  message: string,
  choices: string[],
): Promise<number | null> {
  return new Promise((resolve) =>
    useDialog.setState({
      req: {
        kind: "choice",
        title,
        message,
        choices,
        okLabel: "",
        resolve: (v) => resolve(typeof v === "string" ? Number(v) : null),
      },
    }),
  );
}

/** A list of codes to tick, with a search box; resolves with the ticked codes, or null when cancelled. */
export function askCodes(
  title: string,
  message: string,
  items: { code: string; note: string }[],
  okLabel = "Add",
): Promise<string[] | null> {
  return new Promise((resolve) =>
    useDialog.setState({
      req: {
        kind: "codes",
        title,
        message,
        items,
        okLabel,
        resolve: (v) => resolve(Array.isArray(v) ? v : null),
      },
    }),
  );
}

function CodePicker({
  items,
  okLabel,
  onDone,
}: {
  items: { code: string; note: string }[];
  okLabel: string;
  onDone(v: string[] | null): void;
}) {
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const q = find.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      !q ||
      i.code.toLowerCase().includes(q) ||
      i.note.toLowerCase().includes(q),
  );
  const toggle = (c: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  return (
    <>
      <input
        className="code-find"
        placeholder="Find a code or description"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        autoFocus
      />
      <ul className="code-pick">
        {shown.length === 0 && (
          <li className="muted">
            {items.length ? "No code matches." : "No more codes to add."}
          </li>
        )}
        {shown.map((i) => (
          <li key={i.code}>
            <label className="check">
              <input
                type="checkbox"
                checked={picked.has(i.code)}
                onChange={() => toggle(i.code)}
              />
              <b>{i.code}</b> <span className="muted">{i.note}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button
          type="button"
          onClick={() => setPicked(new Set(shown.map((i) => i.code)))}
        >
          Tick all shown
        </button>
        <button type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!picked.size}
          onClick={() => onDone([...picked])}
        >
          {okLabel} {picked.size ? `(${picked.size})` : ""}
        </button>
      </div>
    </>
  );
}

export function DialogHost() {
  const req = useDialog((s) => s.req);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    setValue(req.initial ?? "");
    setTimeout(
      () =>
        req.kind === "text"
          ? inputRef.current?.select()
          : okRef.current?.focus(),
      0,
    );
  }, [req]);

  if (!req) return null;
  const close = (v: string | boolean | string[] | null) => {
    useDialog.setState({ req: null });
    req.resolve(v);
  };
  const ok = () => {
    if (req.kind === "text") {
      if (value.trim()) close(value.trim());
    } else if (req.kind === "choice") close("0");
    else close(true);
  };

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) =>
        e.target === e.currentTarget &&
        close(req.kind === "text" ? null : false)
      }
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (req.kind !== "codes") ok();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close(req.kind === "text" ? null : false);
        }}
      >
        <h3 id="dialog-title">{req.title}</h3>
        {req.message && <p>{req.message}</p>}
        {req.kind === "text" && (
          <input
            id="dialog-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {req.kind === "codes" && (
          <CodePicker
            items={req.items ?? []}
            okLabel={req.okLabel}
            onDone={close}
          />
        )}
        {req.kind !== "codes" && (
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => close(req.kind === "text" ? null : false)}
            >
              Cancel
            </button>
            {req.kind === "choice" ? (
              req.choices!.map((c, i) => (
                <button
                  key={i}
                  ref={i === 0 ? okRef : undefined}
                  type="button"
                  className={i === 0 ? "primary" : undefined}
                  onClick={() => close(String(i))}
                >
                  {c}
                </button>
              ))
            ) : (
              <button
                ref={okRef}
                type="submit"
                className={req.danger ? "primary danger-fill" : "primary"}
                disabled={req.kind === "text" && !value.trim()}
              >
                {req.okLabel}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
