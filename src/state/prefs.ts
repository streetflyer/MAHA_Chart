import { create } from "zustand";

/**
 * The user's own settings for this browser (not saved in the project): hover info and
 * its shortcut. Kept in localStorage; works without it.
 */
interface Prefs {
  hoverInfo: boolean;
  /** Shortcut that turns hover info on and off, e.g. "F3" or "Ctrl+I". */
  hoverKey: string;
  /** Shortcut that turns the ruler on and off. */
  rulerKey: string;
  /** Shortcut that turns the measuring arrow on and off. */
  measureKey: string;
  setMeasureKey(k: string): void;
  /** The section list at the top of the properties panel. */
  propsNav: boolean;
  setPropsNav(on: boolean): void;
  /** Ask which charts a change is for, the first time something is changed in an edit mode. */
  scopeRemind: boolean;
  setScopeRemind(on: boolean): void;
  setRulerKey(k: string): void;
  setHoverInfo(on: boolean): void;
  setHoverKey(k: string): void;
}

const KEY = "maha-chart-prefs";

function load(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
  } catch {
    return {};
  }
}

function keep(p: Prefs) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        hoverInfo: p.hoverInfo,
        hoverKey: p.hoverKey,
        rulerKey: p.rulerKey,
        measureKey: p.measureKey,
        propsNav: p.propsNav,
        scopeRemind: p.scopeRemind,
      }),
    );
  } catch {
    /* private window: settings last for this visit only */
  }
}

const saved = load();

export const usePrefs = create<Prefs>((set, get) => ({
  hoverInfo: saved.hoverInfo ?? false,
  hoverKey: saved.hoverKey || "F3",
  rulerKey: saved.rulerKey || "F4",
  propsNav: saved.propsNav ?? true,
  scopeRemind: saved.scopeRemind ?? true,
  setScopeRemind: (scopeRemind) => {
    set({ scopeRemind });
    keep(get());
  },
  setPropsNav: (propsNav) => {
    set({ propsNav });
    keep(get());
  },
  measureKey: saved.measureKey || "F5",
  setMeasureKey: (measureKey) => {
    set({ measureKey });
    keep(get());
  },
  setRulerKey: (rulerKey) => {
    set({ rulerKey });
    keep(get());
  },
  setHoverInfo: (hoverInfo) => {
    set({ hoverInfo });
    keep(get());
  },
  setHoverKey: (hoverKey) => {
    set({ hoverKey });
    keep(get());
  },
}));

/** A shortcut as typed ("ctrl + i", "f3") in its usual form ("Ctrl+I", "F3"), or null if it can't be one. */
export function normaliseShortcut(s: string): string | null {
  const parts = s
    .split("+")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === "ctrl" || l === "control") mods.add("Ctrl");
    else if (l === "alt" || l === "option") mods.add("Alt");
    else if (l === "shift") mods.add("Shift");
    else if (key) return null;
    else if (/^f([1-9]|1[0-2])$/.test(l)) key = l.toUpperCase();
    else if (p.length === 1) key = p.toUpperCase();
    else return null;
  }
  if (!key) return null;
  return [...["Ctrl", "Alt", "Shift"].filter((m) => mods.has(m)), key].join(
    "+",
  );
}

/** The shortcut a key press stands for, in the form normaliseShortcut gives. */
export function shortcutOf(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [
    e.ctrlKey || e.metaKey ? "Ctrl" : "",
    e.altKey ? "Alt" : "",
    e.shiftKey ? "Shift" : "",
    k,
  ]
    .filter(Boolean)
    .join("+");
}
