import { useSyncExternalStore } from "react";
import type { Dataset } from "../model/datasets";
import { useCpEdit } from "./cpEdit";
import { useDrawingEdit } from "./drawingEdit";
import { useEventEdit } from "./eventEdit";
import { useKeyplanView } from "./keyplanView";
import { useMatchPick } from "./matchPick";
import { useSmoothTool } from "./smoothTool";
import { useEditor } from "./store";
import { useSurvey } from "./surveyData";

/**
 * The interaction mode of the sheet: ONE state machine over the four edit stores.
 *
 *   idle ──double-click plan view──────────▶ drawing   (useDrawingEdit)
 *   idle ──double-click CP panel───────────▶ cp        (useCpEdit)
 *   idle ──double-click events panel───────▶ events    (useEventEdit)
 *   idle ──"Smooth tool" in the properties─▶ smooth    (useSmoothTool)
 *   idle ──"Pick / Draw matchline" (key plan)▶ matchline (useMatchPick)
 *   idle ──double-click the key plan─────────▶ keyview   (useKeyplanView: wheel zooms, drag moves the map)
 *   any  ──Esc / Done / click outside──────▶ idle
 *   any  ──enter another mode──────────────▶ that mode (the old one is left first)
 *   any  ──its panel or data disappears────▶ idle      (folder switch, file removed, template closed)
 *
 * Each store still owns its own data (selection, undo history, drawing context). This
 * module owns only "which one is on": it keeps them mutually exclusive and never lets a
 * mode point at something that no longer exists. Read the mode with `currentMode()` /
 * `useMode()`, change it with `enterMode()` / `exitMode()`. The editor root carries it as
 * `data-mode` for tests and automation.
 */
export type Mode =
  | "idle"
  | "drawing"
  | "cp"
  | "events"
  | "smooth"
  | "matchline"
  | "keyview";

export const MODES: Mode[] = [
  "idle",
  "drawing",
  "cp",
  "events",
  "smooth",
  "matchline",
  "keyview",
];
const ON = [
  "drawing",
  "cp",
  "events",
  "smooth",
  "matchline",
  "keyview",
] as const;

/** What the user is told while a mode is on. */
export const MODE_INFO: Record<
  Exclude<Mode, "idle">,
  { label: string; hint: string }
> = {
  drawing: {
    label: "Editing the drawing",
    hint: "Click or drag to choose objects, right-click for the menu. Esc or a click outside the plan view finishes.",
  },
  cp: {
    label: "Editing CP readings",
    hint: "Click a reading, drag it, right-click for its options, double-click for its text. Esc or a click outside the panel finishes.",
  },
  events: {
    label: "Editing event codes",
    hint: "Drag a code to move it. Esc or a click outside the panel finishes.",
  },
  smooth: {
    label: "Smooth tool",
    hint: "Click on the profile to smooth along the helper line. Esc finishes.",
  },
  matchline: {
    label: "Choosing matchlines",
    hint: "Pick: click a green overlap in the key plan. Draw: click two points across the line. Esc or Done finishes.",
  },
  keyview: {
    label: "Key plan view",
    hint: "Scroll to zoom, drag the map to move it. Esc or Done finishes.",
  },
};

export interface ModeFlags {
  drawing: boolean;
  cp: boolean;
  events: boolean;
  smooth: boolean;
  matchline: boolean;
  keyview: boolean;
}

/** The mode a set of store flags stands for. More than one on is never left standing: see `conflicts`. */
export function modeOf(f: ModeFlags): Mode {
  if (f.drawing) return "drawing";
  if (f.cp) return "cp";
  if (f.events) return "events";
  if (f.smooth) return "smooth";
  if (f.matchline) return "matchline";
  if (f.keyview) return "keyview";
  return "idle";
}

/** The modes to leave when `entered` has just been switched on. */
export function conflicts(
  f: ModeFlags,
  entered: Exclude<Mode, "idle">,
): Exclude<Mode, "idle">[] {
  return ON.filter((m) => m !== entered && f[m]);
}

/** What a mode needs to stay on; anything missing sends it back to idle. */
export interface ModeWorld {
  /** Ids of the template's panels (empty: no template open). */
  panels: string[];
  datasets: Pick<Dataset, "id" | "kind" | "visible">[];
}

export interface ModeTargets {
  drawingPanel: string | null;
  cpPanel: string | null;
  cpDataset: string | null;
  eventsPanel: string | null;
  smoothDataset: string | null;
  matchPanel: string | null;
  keyviewPanel: string | null;
}

/** Is the thing a mode works on still there? */
export function modeStillValid(
  m: Exclude<Mode, "idle">,
  t: ModeTargets,
  w: ModeWorld,
): boolean {
  const panel = (id: string | null) => !!id && w.panels.includes(id);
  const data = (id: string | null, kind: Dataset["kind"]) =>
    w.datasets.some((d) => d.id === id && d.kind === kind);
  switch (m) {
    case "drawing":
      return (
        panel(t.drawingPanel) && w.datasets.some((d) => d.kind === "linework")
      );
    case "cp":
      return panel(t.cpPanel) && data(t.cpDataset, "cp");
    case "events":
      return (
        panel(t.eventsPanel) &&
        w.datasets.some((d) => d.kind === "events" && d.visible)
      );
    case "smooth":
      return data(t.smoothDataset, "long");
    case "matchline":
      return panel(t.matchPanel) && w.datasets.some((d) => d.kind === "route");
    case "keyview":
      return panel(t.keyviewPanel);
  }
}

const flags = (): ModeFlags => ({
  drawing: useDrawingEdit.getState().active,
  cp: useCpEdit.getState().active,
  events: useEventEdit.getState().active,
  smooth: useSmoothTool.getState().active,
  matchline: useMatchPick.getState().active,
  keyview: useKeyplanView.getState().active,
});

export const currentMode = (): Mode => modeOf(flags());

const leave: Record<Exclude<Mode, "idle">, () => void> = {
  drawing: () => useDrawingEdit.getState().exit(),
  cp: () => useCpEdit.getState().exit(),
  events: () => useEventEdit.getState().exit(),
  smooth: () => useSmoothTool.getState().stop(),
  matchline: () => useMatchPick.getState().exit(),
  keyview: () => useKeyplanView.getState().exit(),
};

/** Back to idle, whatever is on. */
export function exitMode() {
  const f = flags();
  for (const m of ON) if (f[m]) leave[m]();
}

/**
 * Switch to a mode; the one that was on is left first. `panelId` is the panel being
 * edited; `datasetId` is needed for "cp" and "smooth".
 */
export function enterMode(
  m: Mode,
  target: { panelId?: string; datasetId?: string; tool?: "pick" | "draw" } = {},
) {
  if (m === "idle") return exitMode();
  const { panelId, datasetId } = target;
  if (m === "drawing" && panelId) useDrawingEdit.getState().enter(panelId);
  else if (m === "cp" && panelId && datasetId)
    useCpEdit.getState().enter(panelId, datasetId);
  else if (m === "events" && panelId) useEventEdit.getState().enter(panelId);
  else if (m === "smooth" && datasetId)
    useSmoothTool.getState().start(datasetId);
  else if (m === "matchline" && panelId)
    useMatchPick.getState().enter(panelId, target.tool ?? "pick");
  else if (m === "keyview" && panelId) useKeyplanView.getState().enter(panelId);
}

function validate() {
  const f = flags();
  if (!ON.some((m) => f[m])) return;
  const world: ModeWorld = {
    panels: useEditor.getState().template?.panels.map((p) => p.id) ?? [],
    datasets: useSurvey.getState().datasets,
  };
  const targets: ModeTargets = {
    drawingPanel: useDrawingEdit.getState().panelId,
    cpPanel: useCpEdit.getState().panelId,
    cpDataset: useCpEdit.getState().datasetId,
    eventsPanel: useEventEdit.getState().panelId,
    smoothDataset: useSmoothTool.getState().datasetId,
    matchPanel: useMatchPick.getState().panelId,
    keyviewPanel: useKeyplanView.getState().panelId,
  };
  for (const m of ON)
    if (f[m] && !modeStillValid(m, targets, world)) leave[m]();
}

let installed = false;
const listeners = new Set<() => void>();

/** Wire the machine to the stores. Safe to call more than once. */
export function installModeMachine() {
  if (installed) return;
  installed = true;
  const watch = (
    m: Exclude<Mode, "idle">,
    store: {
      subscribe(
        f: (s: { active: boolean }, p: { active: boolean }) => void,
      ): unknown;
    },
  ) =>
    store.subscribe((s, p) => {
      if (s.active === p.active) return;
      // One mode at a time: switching one on leaves the others.
      if (s.active) for (const other of conflicts(flags(), m)) leave[other]();
      listeners.forEach((l) => l());
    });
  watch("drawing", useDrawingEdit);
  watch("cp", useCpEdit);
  watch("events", useEventEdit);
  watch("smooth", useSmoothTool);
  watch("matchline", useMatchPick);
  watch("keyview", useKeyplanView);
  // A mode never outlives what it edits.
  useSurvey.subscribe((s, p) => s.datasets !== p.datasets && validate());
  useEditor.subscribe((s, p) => s.template !== p.template && validate());
}

/** The mode, for components. */
export function useMode(): Mode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentMode,
    currentMode,
  );
}
