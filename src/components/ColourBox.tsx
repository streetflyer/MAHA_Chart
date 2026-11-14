import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Office theme colours: the top row of Excel's colour box. */
const THEME = [
  "#FFFFFF",
  "#000000",
  "#E7E6E6",
  "#44546A",
  "#4472C4",
  "#ED7D31",
  "#A5A5A5",
  "#FFC000",
  "#5B9BD5",
  "#70AD47",
];
/** Excel's "Standard Colors" row. */
const STANDARD = [
  "#C00000",
  "#FF0000",
  "#FFC000",
  "#FFFF00",
  "#92D050",
  "#00B050",
  "#00B0F0",
  "#0070C0",
  "#002060",
  "#7030A0",
];
const RECENT_KEY = "maha.recentColours";

const hex = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");
const rgb = (c: string) =>
  [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lighten = (c: string, t: number) =>
  "#" +
  rgb(c)
    .map((v) => hex(v + (255 - v) * t))
    .join("");
const darken = (c: string, t: number) =>
  "#" +
  rgb(c)
    .map((v) => hex(v * (1 - t)))
    .join("");

/** Five tints and shades under each theme colour, the way Office builds them. */
function shades(c: string): string[] {
  const [r, g, b] = rgb(c);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.95) return [0.05, 0.15, 0.25, 0.35, 0.5].map((t) => darken(c, t));
  if (lum < 0.05)
    return [0.5, 0.35, 0.25, 0.15, 0.05].map((t) => lighten(c, t));
  if (lum > 0.8) return [0.1, 0.25, 0.5, 0.75, 0.9].map((t) => darken(c, t));
  return [
    lighten(c, 0.8),
    lighten(c, 0.6),
    lighten(c, 0.4),
    darken(c, 0.25),
    darken(c, 0.5),
  ];
}

const GRID = [0, 1, 2, 3, 4].map((row) => THEME.map((c) => shades(c)[row]));

function loadRecent(): string[] {
  try {
    return (
      JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]
    ).slice(0, 10);
  } catch {
    return [];
  }
}

function saveRecent(c: string) {
  try {
    const list = [
      c,
      ...loadRecent().filter((x) => x.toLowerCase() !== c.toLowerCase()),
    ].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Not remembered in private windows; the box still works.
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A colour button that opens a box like Excel's: theme colours with their tints
 * and shades, the standard colours, recent picks and "More Colours…" for any other.
 */
export function ColourBox({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange(c: string): void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 236;
    const h = pop.current?.offsetHeight ?? 220;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const top =
      r.bottom + h + 8 > window.innerHeight
        ? Math.max(8, r.top - h - 4)
        : r.bottom + 4;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t))
        setOpen(false);
    };
    const key = (e: KeyboardEvent) =>
      e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const choose = (c: string) => {
    saveRecent(c);
    onChange(c.toLowerCase());
    setOpen(false);
  };
  const swatch = (c: string, k: string | number) => (
    <button
      key={k}
      type="button"
      className={"cb-swatch" + (same(c, value) ? " on" : "")}
      style={{ background: c }}
      title={c.toUpperCase()}
      onClick={() => choose(c)}
    />
  );
  const recent = open ? loadRecent() : [];

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="colour-box"
        title={title ?? "Colour"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="cb-chip" style={{ background: value }} />
        <span className="cb-caret">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="cb-pop"
            style={{ left: pos.left, top: pos.top }}
            role="dialog"
            aria-label="Colours"
          >
            <div className="cb-head">Theme Colours</div>
            <div className="cb-row">{THEME.map(swatch)}</div>
            <div className="cb-shades">
              {GRID.map((row, i) => (
                <div key={i} className="cb-row tight">
                  {row.map((c, j) => swatch(c, `${i}-${j}`))}
                </div>
              ))}
            </div>
            <div className="cb-head">Standard Colours</div>
            <div className="cb-row">{STANDARD.map(swatch)}</div>
            {recent.length > 0 && (
              <>
                <div className="cb-head">Recent Colours</div>
                <div className="cb-row">{recent.map(swatch)}</div>
              </>
            )}
            <button
              type="button"
              className="cb-more"
              onClick={() => more.current?.click()}
            >
              <span className="cb-wheel" /> More Colours…
            </button>
            <input
              ref={more}
              type="color"
              className="cb-native"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={(e) => saveRecent(e.target.value)}
              tabIndex={-1}
              aria-hidden
            />
          </div>,
          document.body,
        )}
    </>
  );
}
