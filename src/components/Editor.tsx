import { chartKpRange, drawingNoOf } from "../model/tokens";
import { useCallback, useEffect, useRef, useState } from "react";
import { newId } from "../model/ids";
import { PAPER_SIZES } from "../model/paper";
import { BUILTIN_TEMPLATES } from "../model/builtinTemplates";
import {
  autoSheets,
  chartFrames,
  fitSegments,
  fitSegmentsN,
} from "../model/route";
import {
  deleteSheet,
  editSheet,
  insertSheet,
  planPanel,
  sheetCount,
  sheetRange,
  sheetFrame,
  sheetRotation,
  fitSheet,
} from "../model/scale";
import {
  exportTemplateFile,
  importTemplateFile,
  listUserTemplates,
  saveUserTemplate,
} from "../model/storage";
import type {
  ChartTemplate,
  Panel,
  PanelKpLine,
  PanelType,
  PaperSizeName,
} from "../model/types";
import { ADDABLE_TYPES, PANEL_DEFAULTS } from "../state/panelDefaults";
import { chartInfoLocked, useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
import { fitInto, readImageFile } from "./imageImport";
import { titleInsideHeight } from "./PanelContent";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { drawingMenu } from "./drawingMenu";
import { askChoice, askConfirm, askText } from "./Dialog";
import { normaliseShortcut, shortcutOf, usePrefs } from "../state/prefs";
import { useHoverTip } from "../state/hoverInfo";
import { useMatchPick } from "../state/matchPick";
import { ParametersDialog } from "./ParametersDialog";
import { kpToX } from "./KpPanels";
import { kpFinder } from "./CpPanel";
import { withGridLine } from "../model/kpGrid";
import { clearChartData } from "../state/chartData";
import { chartBoxesToDxf, chartsToDxf } from "../model/dxfExport";
import { chartsToPdf } from "../model/pdfExport";
import { ThemeButton } from "./ThemeButton";
import { ImportDialog, useImport } from "./ImportDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { PropsNav } from "./PropsNav";
import { ProjectPanel } from "./ProjectPanel";
import {
  type SaveMode,
  downloadBlob,
  loadWorkspace,
  workspaceBlob,
} from "../state/workspace";
import { useSmoothTool } from "../state/smoothTool";
import { eventLabelMenu } from "./eventLabelEdit";
import { codeDefMenu, legendSymMenu } from "./legendEdit";
import { useLegendEdit } from "../state/legendEdit";
import { useScope } from "../state/scope";
import { longSectionMenu } from "./longSectionMenu";
import { CodeDefsDialog } from "./CodeDefsDialog";
import { SymbolDialog } from "./SymbolDialog";
import { LegendAddDialog } from "./LegendAddDialog";
import { useEventEdit } from "../state/eventEdit";
import { EventEditBar } from "./EventEditBar";
import { ModeBar } from "./ModeBar";
import { exitMode, useMode } from "../state/mode";
import { useBodyBox } from "../state/bodyBox";
import { useRuler } from "../state/ruler";
import { useMeasure } from "../state/measure";
import { useKeyplanView } from "../state/keyplanView";
import { undoEventLabels } from "./eventLabelEdit";
import { planItemMenu } from "./planItems";
import { calloutMenu } from "./calloutEdit";
import { SheetView, type ContextTarget } from "./SheetView";
import { useDrawingEdit } from "../state/drawingEdit";
import { drawingKey } from "./drawingEditing";
import { useCpEdit } from "../state/cpEdit";
import { cpKey, cpMenu } from "./cpEditing";

interface Menu {
  x: number;
  y: number;
  items: MenuItem[];
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  // A ticked box or a button does not take typing: shortcuts keep working after clicking one.
  if (
    el instanceof HTMLInputElement &&
    ["checkbox", "radio", "button"].includes(el.type)
  )
    return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
};

export function Editor({ onExit }: { onExit(): void }) {
  const template = useEditor((s) => s.template)!;
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const importOpen = useImport((s) => s.open);
  const importFiles = useImport((s) => s.files);
  const importPanel = useImport((s) => s.panelType);
  const route = useSurvey((s) => s.route);
  const plan = planPanel(template);
  // Refit the charts to the line whenever the line, the scale or the plan view changes.
  useEffect(() => {
    const t = useEditor.getState().template;
    if (t)
      useEditor
        .getState()
        .setAutoSheets(route ? autoSheets(t, route) : undefined);
  }, [
    route,
    template.scale.horizontal,
    template.scale.overlap,
    template.kind,
    plan?.w,
    plan?.h,
    template.fields.START_KP,
  ]);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("mahachart.darkSheet") === "1";
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState<string | null>(null);
  const mode = useMode();
  /** Writing a PDF/DXF flips through the charts: one export at a time. */
  const [exporting, setExporting] = useState(false);
  const propsRef = useRef<HTMLDivElement>(null);
  const s = useEditor.getState;

  const [showLoad, setShowLoad] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | undefined>(undefined);
  const toastTimer = useRef<number | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => setToast(null),
      Math.max(2500, msg.length * 45),
    );
  };

  const save = useCallback(
    async (asNew: boolean) => {
      const t = s().template!;
      let name = t.name;
      if (asNew || t.builtIn) {
        const answer = await askText(
          "Save template as",
          t.builtIn ? `${t.name} (copy)` : t.name,
          "Save",
        );
        if (!answer) return;
        name = answer;
      }
      const saved = saveUserTemplate({
        ...t,
        id: asNew || t.builtIn ? newId("tpl") : t.id,
        name,
      });
      if (!saved)
        return flash("Could not save: browser storage is full or blocked.");
      s().markSaved(saved);
      flash(`Saved "${saved.name}"`);
    },
    [s],
  );

  const projectInput = useRef<HTMLInputElement>(null);
  const [panes, setPanes] = useState(loadPanes);
  useEffect(() => {
    try {
      localStorage.setItem(PANES_KEY, JSON.stringify(panes));
    } catch {
      /* not remembered */
    }
  }, [panes]);
  /** Where the last Save went (Chrome / Edge can write there again); one per kind of save. */
  const lastSave = useRef<{
    mode: SaveMode;
    handle: FileSystemFileHandle;
  } | null>(null);
  const [progress, setProgress] = useState<{
    label: string;
    f: number;
  } | null>(null);
  async function saveProject(as = false) {
    let mode: SaveMode;
    const last = lastSave.current;
    if (!as && last) mode = last.mode;
    else {
      const pick = await askChoice(
        as ? "Save the project as…" : "Save the project",
        "Settings only: the paper, scale, overlap, every panel setting, the look and import settings of your files, the video timing list and your saved presets. No survey data, so the file is small (a few hundred KB). Use it to start another product, hand the setup over or move to another machine, then add the data files there.\n\nFull project: all of the above plus the imported data and the drawing lines as they are on the chart, so it opens exactly as you left it. Your raw files are not copied in; they stay in the project folder. The file can be tens of MB.",
        ["Settings only", "Full project"],
      );
      if (pick === null) return;
      mode = pick === 0 ? "settings" : "full";
    }
    const t = s().template!;
    const name = `${t.name.replace(/[^\w.-]+/g, "_")}${mode === "settings" ? "_settings" : ""}.mahachart`;
    // Save as (or the first save) asks where, when the browser can write files.
    let handle = !as && last?.mode === mode ? last.handle : null;
    const picker = (
      window as unknown as {
        showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;
    if (!handle && picker) {
      try {
        handle = await picker({
          suggestedName: name,
          types: [
            {
              description: "MAHA Chart project",
              accept: { "application/octet-stream": [".mahachart"] },
            },
          ],
        });
      } catch {
        return; // cancelled
      }
    }
    const label =
      mode === "settings" ? "Saving the settings" : "Saving the full project";
    setProgress({ label, f: 0 });
    try {
      const blob = await workspaceBlob(mode, (f) => setProgress({ label, f }));
      if (handle) {
        setProgress({ label: `${label}: writing`, f: 0.98 });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        // Read the size back: a sync or antivirus program can leave a short file.
        const got = (await handle.getFile()).size;
        if (got !== blob.size)
          throw new Error(
            `the file on disk is ${got} bytes, not ${blob.size}. Save again, or save to a folder that is not synced`,
          );
        lastSave.current = { mode, handle };
      } else downloadBlob(blob, name);
      setProgress({ label, f: 1 });
      s().markSaved(t);
      flash(
        `Saved ${mode === "settings" ? "the settings" : "the full project"}${handle ? ` to ${handle.name}` : ""} (${(blob.size / 1048576).toFixed(1)} MB)`,
      );
    } catch (e) {
      flash(`Could not save: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setProgress(null), 400);
    }
  }
  async function loadProject(f: File | undefined) {
    if (!f) return;
    if (
      s().dirty &&
      !(await askConfirm(
        "Load a project file?",
        "Everything now open is replaced by the file's contents.",
        "Load",
        true,
      ))
    )
      return;
    try {
      const name = await loadWorkspace(f);
      setFitSignal((n) => n + 1);
      flash(`Loaded the project "${name}"`);
    } catch (e) {
      flash((e as Error).message);
    }
  }

  async function clearData() {
    const n = useSurvey.getState().datasets.length;
    if (
      !(await askConfirm(
        "Clear the data from the chart?",
        n
          ? `All ${n} data sets (the line, plan drawings, profiles, events, CP…) are taken off this chart, and the folder forgets how they were read. The files stay in the folder and the layout stays. You can import them again with Check imported data.`
          : "There is no data on the chart; this also forgets what the folder remembers about its files.",
        "Clear data",
        true,
      ))
    )
      return;
    clearChartData();
    flash("The chart is empty: all data was taken off it.");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || s().editing) return;
      if (shortcutOf(e) === usePrefs.getState().rulerKey) {
        e.preventDefault();
        const r = useRuler.getState();
        r.setOn(!r.on);
        return;
      }
      if (shortcutOf(e) === usePrefs.getState().measureKey) {
        e.preventDefault();
        const m = useMeasure.getState();
        // Leaving the arrow mode takes the arrow away.
        if (m.armed) m.reset();
        else m.setArmed(true);
        return;
      }
      if (shortcutOf(e) === usePrefs.getState().hoverKey) {
        e.preventDefault();
        toggleHoverInfo();
        return;
      }
      if (e.key === "Escape" && useMeasure.getState().armed) {
        useMeasure.getState().reset();
        return;
      }
      if (e.key === "Escape" && useMatchPick.getState().active) {
        // Esc drops a line half drawn first, then finishes.
        const mp = useMatchPick.getState();
        if (mp.first) mp.setFirst(null);
        else mp.exit();
        return;
      }
      if (
        useEventEdit.getState().active &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey &&
        undoEventLabels()
      ) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && useBodyBox.getState().active) {
        useBodyBox.getState().exit();
        return;
      }
      // F8 / F9: changes apply to all charts / this chart only.
      if (e.key === "F8" || e.key === "F9") {
        e.preventDefault();
        const chart = e.key === "F9";
        useScope.getState().set(chart ? "chart" : "all");
        flash(
          chart
            ? "Changes apply to this chart only (F8: all charts)"
            : "Changes apply to all charts (F9: this chart only)",
        );
        return;
      }
      if (e.key === "Escape" && useLegendEdit.getState().active) {
        useLegendEdit.getState().exit();
        return;
      }
      if (e.key === "Escape" && useKeyplanView.getState().active) {
        useKeyplanView.getState().exit();
        return;
      }
      if (e.key === "Escape" && useEventEdit.getState().active) {
        useEventEdit.getState().exit();
        return;
      }
      if (e.key === "Escape" && useSmoothTool.getState().active) {
        useSmoothTool.getState().stop();
        return;
      }
      // Editing the drawing in the plan view takes the keys first (Delete removes drawing objects, not panels).
      if (useDrawingEdit.getState().active && drawingKey(e)) {
        e.preventDefault();
        return;
      }
      if (useCpEdit.getState().active && cpKey(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sel = s().selection;
      if (mod && k === "z" && !e.shiftKey) s().undo();
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) s().redo();
      else if (mod && k === "c") s().copySelection();
      else if (mod && k === "x") s().cutSelection();
      else if (mod && k === "v") s().paste();
      else if (mod && k === "d") s().duplicateSelection();
      else if (mod && k === "s") {
        e.preventDefault();
        if (e.shiftKey) void save(true);
        else void saveProject();
      } else if (mod && k === "a") {
        const t = s().template!;
        s().select([
          ...t.panels
            .filter((p) => !p.parentId)
            .map((p) => ({ kind: "panel" as const, id: p.id })),
          ...t.texts.map((x) => ({ kind: "text" as const, id: x.id })),
        ]);
      } else if (mod && k === "0") setFitSignal((n) => n + 1);
      else if (e.key === "Delete" || e.key === "Backspace")
        s().deleteSelection();
      else if (e.key === "F2" && sel.length === 1)
        s().startEdit(
          sel[0].kind === "text"
            ? { kind: "text", id: sel[0].id }
            : { kind: "panelTitle", id: sel[0].id },
        );
      else if (e.key === "Escape") s().select(null);
      else if (e.key.startsWith("Arrow") && sel.length) {
        const step = e.shiftKey ? 5 : 0.5;
        const d = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[e.key]!;
        s().nudgeSelection(d[0], d[1]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (s().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [s]);

  function addPanelMenu(
    at?: { x: number; y: number },
    parentId?: string,
  ): MenuItem[] {
    const hasPlan = template.panels.some((p) => p.type === "plan");
    return ADDABLE_TYPES.map((type: PanelType) => ({
      label: PANEL_DEFAULTS[type].label,
      disabled: type === "plan" && hasPlan,
      action: () => s().addPanel(type, at, parentId),
    }));
  }

  function openMenu(
    clientX: number,
    clientY: number,
    at: { x: number; y: number },
    target: ContextTarget,
  ) {
    if (target.kind === "cp") {
      setMenu({ x: clientX, y: clientY, items: cpMenu(at) });
      return;
    }
    if (target.kind === "longsection") {
      setMenu({
        x: clientX,
        y: clientY,
        items: longSectionMenu(target.code ?? ""),
      });
      return;
    }
    if (target.kind === "legendsym") {
      setMenu({
        x: clientX,
        y: clientY,
        items: legendSymMenu(target.id ?? "", target.code ?? ""),
      });
      return;
    }
    if (target.kind === "codedef") {
      setMenu({
        x: clientX,
        y: clientY,
        items: codeDefMenu(target.id ?? "", target.code),
      });
      return;
    }
    if (target.kind === "evlabel") {
      setMenu({
        x: clientX,
        y: clientY,
        items: eventLabelMenu(target.id ?? ""),
      });
      return;
    }
    if (target.kind === "callout") {
      setMenu({ x: clientX, y: clientY, items: calloutMenu(target.id ?? "") });
      return;
    }
    if (target.kind === "planitem") {
      setMenu({ x: clientX, y: clientY, items: planItemMenu(target.id ?? "") });
      return;
    }
    if (target.kind === "drawing") {
      setMenu({ x: clientX, y: clientY, items: drawingMenu(at) });
      return;
    }
    const st = s();
    const sel = st.selection;
    const panel =
      target.id && target.kind !== "text"
        ? template.panels.find((p) => p.id === target.id)
        : undefined;
    const common: MenuItem[] = [
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        disabled: !sel.length,
        action: () => st.cutSelection(),
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        disabled: !sel.length,
        action: () => st.copySelection(),
      },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !st.clipboard,
        action: () => st.paste(at),
      },
      {
        label: "Duplicate",
        shortcut: "Ctrl+D",
        disabled: !sel.length,
        action: () => st.duplicateSelection(),
      },
      {
        label: "Delete",
        shortcut: "Del",
        disabled: !sel.length,
        action: () => st.deleteSelection(),
      },
    ];
    let items: MenuItem[];
    if (target.kind === "sheet") {
      items = [
        {
          label: "Paste",
          shortcut: "Ctrl+V",
          disabled: !st.clipboard,
          action: () => st.paste(at),
        },
        "separator",
        { label: "Add panel", submenu: addPanelMenu(at) },
        { label: "Add text here", action: () => st.addText(at) },
        "separator",
        {
          label: "Select all",
          shortcut: "Ctrl+A",
          action: () =>
            st.select([
              ...template.panels
                .filter((p) => !p.parentId)
                .map((p) => ({ kind: "panel" as const, id: p.id })),
            ]),
        },
        {
          label: "Undo",
          shortcut: "Ctrl+Z",
          disabled: !st.past.length,
          action: () => st.undo(),
        },
        {
          label: "Redo",
          shortcut: "Ctrl+Y",
          disabled: !st.future.length,
          action: () => st.redo(),
        },
        "separator",
        {
          label: "Zoom to fit",
          shortcut: "Ctrl+0",
          action: () => setFitSignal((n) => n + 1),
        },
        { label: "Template properties", action: () => st.select(null) },
      ];
    } else if (target.kind === "image") {
      items = [
        ...common,
        "separator",
        { label: "Properties", action: focusProps },
      ];
    } else if (target.kind === "text") {
      items = [
        {
          label: "Edit text",
          shortcut: "F2",
          action: () => st.startEdit({ kind: "text", id: target.id! }),
        },
        "separator",
        ...common,
        "separator",
        { label: "Properties", action: focusProps },
      ];
    } else {
      const p = panel!;
      const rowItems: MenuItem[] =
        target.kind === "row" && p.rows
          ? [
              {
                label: "Rename row",
                action: () =>
                  st.startEdit({ kind: "row", id: p.id, rowId: target.rowId }),
              },
              {
                label: "Insert row above",
                action: () => insertRow(p.id, target.rowId!, 0),
              },
              {
                label: "Insert row below",
                action: () => insertRow(p.id, target.rowId!, 1),
              },
              {
                label: "Move row up",
                disabled: p.rows[0]?.id === target.rowId,
                action: () => moveRow(p.id, target.rowId!, -1),
              },
              {
                label: "Move row down",
                disabled: p.rows[p.rows.length - 1]?.id === target.rowId,
                action: () => moveRow(p.id, target.rowId!, 1),
              },
              {
                label: "Delete row",
                action: () =>
                  st.updatePanel(p.id, {
                    rows: p.rows!.filter((r) => r.id !== target.rowId),
                  }),
              },
              "separator",
            ]
          : [];
      const sideItems: MenuItem[] =
        p.type === "events"
          ? [
              {
                label: "Description column on the left (this chart)",
                checked:
                  (p.labelSides?.[st.sheetIndex] ?? p.labelSide) !== "right",
                action: () =>
                  st.updatePanel(p.id, {
                    labelSides: { ...p.labelSides, [st.sheetIndex]: "left" },
                  }),
              },
              {
                label: "Description column on the right (this chart)",
                checked:
                  (p.labelSides?.[st.sheetIndex] ?? p.labelSide) === "right",
                action: () =>
                  st.updatePanel(p.id, {
                    labelSides: { ...p.labelSides, [st.sheetIndex]: "right" },
                  }),
              },
              "separator",
            ]
          : [];
      items = [
        ...rowItems,
        ...sideItems,
        ...(p.type === "longProfile" || p.type === "transProfile"
          ? [...gridLineMenu(p, at.x), "separator" as const]
          : []),
        {
          label: "Rename",
          shortcut: "F2",
          action: () => st.startEdit({ kind: "panelTitle", id: p.id }),
        },
        ...(p.body !== undefined
          ? [
              {
                label: "Edit text",
                action: () => st.startEdit({ kind: "panelBody", id: p.id }),
              } as MenuItem,
            ]
          : []),
        "separator",
        ...common,
        "separator",
        {
          label: "Split left / right",
          disabled: sel.length !== 1,
          action: () => st.splitSelected("vertical"),
        },
        {
          label: "Split top / bottom",
          disabled: sel.length !== 1,
          action: () => st.splitSelected("horizontal"),
        },
        ...(p.type === "chartInfo" || p.parentId
          ? [
              {
                label: "Add section",
                submenu: addPanelMenu(at, p.parentId ?? p.id),
              } as MenuItem,
            ]
          : []),
        ...(p.rows
          ? [
              {
                label: "Add row",
                action: () =>
                  st.updatePanel(p.id, {
                    rows: [...p.rows!, { id: newId("r"), label: "NEW ROW" }],
                  }),
              } as MenuItem,
            ]
          : []),
        {
          label: "Add text here",
          action: () => st.addText({ x: at.x - p.x, y: at.y - p.y }, p.id),
        },
        {
          label: p.type === "logo" ? "Insert logo image…" : "Insert image…",
          action: () => {
            imageTarget.current = p.id;
            imageInput.current?.click();
          },
        },
        "separator",
        { label: "Bring to front", action: () => st.reorderSelection("front") },
        { label: "Send to back", action: () => st.reorderSelection("back") },
        {
          label: p.locked ? "Unlock" : "Lock",
          action: () => st.toggleLockSelection(),
        },
        "separator",
        { label: "Properties", action: focusProps },
      ];
    }
    setMenu({ x: clientX, y: clientY, items });
  }

  /** Right-click menu of a profile panel: vertical grid lines at the data's ends or at a KP. */
  function gridLineMenu(p: Panel, atX: number): MenuItem[] {
    const route = useSurvey.getState().route;
    const sheet = s().sheetIndex;
    const toX = kpToX(template, route, sheet);
    const k0 = (parseFloat(template.fields.START_KP ?? "0") || 0) * 1000;
    const len = route?.length ?? template.scale.routeLength;
    const here = toX ? kpFinder(toX, [k0 - len, k0 + 2 * len])(atX) : k0;
    const add = (line: PanelKpLine) =>
      s().updatePanel(p.id, { kpGrid: withGridLine(p, line) });
    return [
      {
        label: "Vertical grid line",
        submenu: [
          {
            label: "At the left of the data",
            action: () => add({ at: "left" }),
          },
          {
            label: "At the right of the data",
            action: () => add({ at: "right" }),
          },
          {
            label: "At a KP…",
            action: async () => {
              const v = await askText(
                "Vertical grid line at KP (km)",
                (here / 1000).toFixed(3),
                "Add",
              );
              const kp = parseFloat((v ?? "").replace(",", "."));
              if (Number.isFinite(kp)) add({ at: "kp", kp: kp * 1000 });
            },
          },
          "separator",
          {
            label:
              p.kpStartLine === false
                ? "Show the grid line at the start of the chart"
                : "Hide the grid line at the start of the chart",
            action: () =>
              s().updatePanel(p.id, { kpStartLine: p.kpStartLine === false }),
          },
          {
            label: "Remove the grid lines I added",
            disabled: !p.kpGrid?.length,
            action: () => s().updatePanel(p.id, { kpGrid: undefined }),
          },
        ],
      },
    ];
  }

  function insertRow(panelId: string, rowId: string, offset: 0 | 1) {
    const p = s().template!.panels.find((x) => x.id === panelId)!;
    const rows = [...(p.rows ?? [])];
    const i = rows.findIndex((r) => r.id === rowId);
    const id = newId("r");
    rows.splice(i + offset, 0, { id, label: "NEW ROW" });
    s().updatePanel(panelId, { rows });
    s().startEdit({ kind: "row", id: panelId, rowId: id });
  }

  function moveRow(panelId: string, rowId: string, by: -1 | 1) {
    const p = s().template!.panels.find((x) => x.id === panelId)!;
    const rows = [...(p.rows ?? [])];
    const i = rows.findIndex((r) => r.id === rowId);
    const j = i + by;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    s().updatePanel(panelId, { rows });
  }

  function focusProps() {
    propsRef.current
      ?.querySelector<HTMLInputElement>("input, select, textarea")
      ?.focus();
  }

  function setPaper(size: PaperSizeName) {
    s().setPaper(size, template.paper.orientation, [
      template.paper.width,
      template.paper.height,
    ]);
  }

  /** Chart(s) as PDF or DXF: the current one or all of them (PDF: one page each; DXF: side by side in one file). */
  /** Every chart's box in the key plan as rectangles in easting / northing. */
  function saveChartBoxes() {
    const route = useSurvey.getState().route;
    if (!route)
      return flash("Load the survey line first: the boxes sit on it.");
    const frames = chartFrames(template, route);
    if (!frames.length) return flash("No chart boxes to save.");
    const names = frames.map(
      (_, i) => drawingNoOf(template, i) || `Chart ${i + 1}`,
    );
    const used = new Set<string>();
    const files = frames.map((f, i) => {
      let name = names[i].replace(/[^\w.-]+/g, "_") || `Chart_${i + 1}`;
      while (used.has(name)) name += "_";
      used.add(name);
      return { name: `${name}.dxf`, text: chartBoxesToDxf([f], [names[i]]) };
    });
    // One file per chart box, a short pause apart so the browser allows them all.
    files.forEach((f, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([f.text], { type: "application/dxf" }),
        );
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, i * 350),
    );
    flash(
      `Saved ${files.length} DXF files, one per chart box, in easting / northing`,
    );
  }

  async function saveAs() {
    if (exporting) return flash("Still writing the last file…");
    const n = sheetCount(template);
    const cur = s().sheetIndex;
    const fmt = await askChoice(
      "Save as",
      "PDF is for printing and sending; DXF opens in AutoCAD. A DWG file cannot be written in the browser: open the DXF in AutoCAD, TrueView or the free ODA File Converter and save it as DWG there.",
      ["PDF", "DXF", "Chart boxes of the key plan (DXF)"],
    );
    if (fmt === null) return;
    if (fmt === 2) return saveChartBoxes();
    const ext = fmt ? "dxf" : "pdf";
    // Each entry is one file: the charts it holds.
    let files: number[][] = [[cur]];
    if (n > 1) {
      const all = Array.from({ length: n }, (_, i) => i);
      const pick = await askChoice(
        `Save as ${ext.toUpperCase()}`,
        `Save Chart ${cur + 1} only, all ${n} charts in one file, or each of the ${n} charts as its own file (${n} downloads)?`,
        [`Chart ${cur + 1}`, `All ${n} in one file`, `Each chart its own file`],
      );
      if (pick === null) return;
      if (pick === 1) files = [all];
      if (pick === 2) files = all.map((i) => [i]);
    }
    flash(`Writing ${ext.toUpperCase()}…`);
    setExporting(true);
    // The export draws each chart as it is on screen: leave any edit mode so its outlines are not printed.
    exitMode();
    const prevSel = s().selection;
    useEditor.setState({ selection: [] });
    const frame = () =>
      new Promise((r) => requestAnimationFrame(() => r(null)));
    const draw = async (i: number) => {
      s().setSheet(i);
      await frame();
      await frame();
      await new Promise((r) => setTimeout(r, 60));
      return document.querySelector<SVGSVGElement>("svg.sheet");
    };
    const base = (template.fields.CHART_NO || template.name).replace(
      /[^\w.-]+/g,
      "_",
    );
    const saved: string[] = [];
    try {
      for (const sheets of files) {
        const { width, height } = template.paper;
        const blob = fmt
          ? new Blob([await chartsToDxf(width, height, sheets, draw)], {
              type: "application/dxf",
            })
          : new Blob(
              [(await chartsToPdf(width, height, sheets, draw)) as BlobPart],
              { type: "application/pdf" },
            );
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        // Named by the drawing number: 33DJ100160-LCV-CH-002.001.pdf, or …-002.001_to_003.pdf for several charts.
        const dn = (i: number) =>
          (drawingNoOf(template, i) || `${base}_chart${i + 1}`).replace(
            /[^\w.-]+/g,
            "_",
          );
        const last = sheets[sheets.length - 1];
        a.download =
          sheets.length > 1
            ? `${dn(sheets[0])}_to_${dn(last).split(".").pop()}.${ext}`
            : `${dn(sheets[0])}.${ext}`;
        a.click();
        saved.push(a.download);
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        if (files.length > 1) await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      s().setSheet(cur);
      useEditor.setState({ selection: prevSel });
      setExporting(false);
    }
    flash(
      saved.length > 1
        ? `Saved ${saved.length} files, ${saved[0]} …`
        : `Saved ${saved[0]}`,
    );
  }

  async function reset() {
    if (
      !(await askConfirm(
        "Reset to template?",
        "This puts the layout back the way it was when you opened it. You can undo this with Ctrl+Z.",
        "Reset",
      ))
    )
      return;
    s().resetToOrigin();
    setFitSignal((n) => n + 1);
    flash("Reset to the opened template");
  }

  async function loadTemplate(t: ChartTemplate) {
    setShowLoad(false);
    if (
      s().dirty &&
      !(await askConfirm(
        "Load another template?",
        "Your changes to this template have not been saved.",
        "Load anyway",
        true,
      ))
    )
      return;
    s().open(t);
    setFitSignal((n) => n + 1);
    flash(`Loaded "${t.name}"`);
  }

  async function insertImages(files: FileList | null) {
    const target = imageTarget.current
      ? s().template!.panels.find((p) => p.id === imageTarget.current)
      : undefined;
    for (const f of [...(files ?? [])]) {
      try {
        const img = await readImageFile(f);
        if (target) {
          const top =
            target.titlePosition === "inside" ? titleInsideHeight(target) : 1;
          const r = fitInto(img.width, img.height, {
            x: 1.5,
            y: top,
            w: target.w - 3,
            h: target.h - top - 1.5,
          });
          s().addImage({
            panelId: target.id,
            ...r,
            src: img.src,
            name: f.name,
          });
        } else {
          const t = s().template!;
          s().addImage({
            x: t.paper.width / 2 - 20,
            y: t.paper.height / 2 - 10,
            w: 40,
            h: (40 * img.height) / img.width,
            src: img.src,
            name: f.name,
          });
        }
      } catch (err) {
        flash((err as Error).message);
      }
    }
  }

  async function exit() {
    if (
      dirty &&
      !(await askConfirm(
        "Leave without saving?",
        "Your changes to this template have not been saved.",
        "Leave",
        true,
      ))
    )
      return;
    onExit();
  }

  const infoLocked = chartInfoLocked(template);
  const hasInfo = template.panels.some((p) => p.type === "chartInfo");

  return (
    <div
      className="editor"
      data-mode={mode}
      data-busy={exporting ? "export" : progress ? "save" : undefined}
    >
      <header className="toolbar">
        <button onClick={exit} title="Back to template list">
          ← Templates
        </button>
        <span className="tpl-name" title={template.name}>
          {template.name}
          {dirty ? " •" : ""}
        </span>
        <div className="group">
          <button
            onClick={() => void saveProject()}
            title="Save everything to a project file: paper, scale, overlap, every panel setting, imported data, project folders and their files, import settings (Ctrl+S)"
          >
            Save
          </button>
          <button
            onClick={() => void saveProject(true)}
            title="Choose settings only or the full project, and where to save it"
          >
            Save as…
          </button>
          <button
            onClick={() => projectInput.current?.click()}
            title="Load a project file saved with Save: brings back all of it"
          >
            Load
          </button>
          <button
            onClick={() => void save(true)}
            title="Save only the layout as a template (Ctrl+Shift+S)"
          >
            Save template…
          </button>
          <button
            onClick={() => setShowLoad(true)}
            title="Open a saved or built-in template"
          >
            Templates…
          </button>
          <button
            onClick={() => setPanes(DEFAULT_PANES)}
            title="Put the left and right panels back to their usual width (drag the thin bars beside them to resize)"
          >
            Reset panels
          </button>
          <button
            onClick={reset}
            title="Put the layout back the way it was when you opened it"
          >
            Reset
          </button>
          <button
            onClick={() => exportTemplateFile(template)}
            title="Download the template as a file to share"
          >
            Export file
          </button>
          <button
            disabled={exporting}
            onClick={() => void saveAs()}
            title="Save the chart as a PDF or an AutoCAD DXF (DWG: save the DXF as DWG in AutoCAD)"
          >
            Save as PDF / DXF…
          </button>
          <button
            onClick={() => useImport.getState().request()}
            title="Import survey data: route, plan view data, profiles, events, CP, logos, site plan"
          >
            Import data…
          </button>
        </div>
        <div className="group">
          <button
            onClick={() => void clearData()}
            title="Take all the data off the chart (the layout stays)"
            data-clear-data
          >
            Clear data…
          </button>
          <button
            onClick={() => setShowParams(true)}
            title="Show and edit every {PARAMETER} the chart text uses ({TITLE}, {PROJECT}…), for all charts or one chart"
          >
            Parameters…
          </button>
          <HoverInfoButtons />
          <RulerButtons />
          <MeasureButton />
        </div>
        <div className="group">
          <button
            onClick={() => s().undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={() => s().redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>
        </div>
        <div className="group">
          <label>
            Paper{" "}
            <select
              value={template.paper.size}
              onChange={(e) => setPaper(e.target.value as PaperSizeName)}
            >
              {Object.keys(PAPER_SIZES).map((k) => (
                <option key={k}>{k}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </label>
          <ScaleQuick />
        </div>
        <div className="group">
          <button
            onClick={(e) =>
              setMenu({
                x: e.clientX,
                y: e.clientY + 12,
                items: addPanelMenu(),
              })
            }
          >
            + Panel
          </button>
          <button
            onClick={() =>
              s().addText({
                x: template.paper.width / 2,
                y: template.paper.height / 2,
              })
            }
          >
            + Text
          </button>
          {hasInfo && (
            <label title="Lock the Chart Information panel and every section inside it">
              <input
                type="checkbox"
                checked={infoLocked}
                onChange={(e) => s().setChartInfoLocked(e.target.checked)}
              />{" "}
              Lock Chart Information
            </label>
          )}
        </div>
        <div className="group right">
          <button
            onClick={() => setFitSignal((n) => n + 1)}
            title="Zoom to fit (Ctrl+0 or double-click empty paper)"
          >
            Fit
          </button>
          <label title="Show the sheet like a CAD model space">
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => {
                setDark(e.target.checked);
                try {
                  localStorage.setItem(
                    "mahachart.darkSheet",
                    e.target.checked ? "1" : "0",
                  );
                } catch {
                  /* preference only */
                }
              }}
            />{" "}
            Dark sheet
          </label>
          <ThemeButton />
        </div>
      </header>
      <div
        className="workspace"
        style={
          {
            "--left-w": `${panes.left}px`,
            "--right-w": `${panes.right}px`,
          } as React.CSSProperties
        }
      >
        <ProjectPanel onNotice={flash} />
        <PaneResizer side="left" panes={panes} setPanes={setPanes} />
        <div className="sheet-col">
          <SheetView
            onContextMenu={openMenu}
            onCursor={setCursor}
            onNotice={flash}
            fitSignal={fitSignal}
            dark={dark}
          />
          <EventEditBar />
          <ModeBar />
          <HoverTip />
          <CodeDefsDialog />
          <SymbolDialog />
          <LegendAddDialog />
          {showParams && (
            <ParametersDialog onClose={() => setShowParams(false)} />
          )}
          {progress && (
            <div
              className="save-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress.f * 100)}
            >
              <span>
                {progress.label}… {Math.round(progress.f * 100)}%
              </span>
              <div className="bar">
                <div style={{ width: `${Math.round(progress.f * 100)}%` }} />
              </div>
            </div>
          )}
          <ChartTabs onNotice={flash} />
        </div>
        <PaneResizer side="right" panes={panes} setPanes={setPanes} />
        <div ref={propsRef} className="props-wrap">
          <PropsNav />
          <PropertiesPanel />
        </div>
      </div>
      <footer className="statusbar">
        <span>
          {cursor
            ? `X ${cursor.x.toFixed(1)}  Y ${cursor.y.toFixed(1)} mm`
            : " "}
        </span>
        <span>
          {template.paper.size} {template.paper.width.toFixed(0)}×
          {template.paper.height.toFixed(0)} mm
        </span>
        <span className="hint-text">
          Drag an edge to resize (Alt = ignore shared dividers) · Drop a logo on
          a panel · Wheel to zoom · Double-click (or wheel double-click) to fit
          · F2 rename
        </span>
      </footer>
      <input
        ref={projectInput}
        type="file"
        accept=".mahachart"
        hidden
        onChange={(e) => {
          void loadProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages(e.target.files);
          e.target.value = "";
        }}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {importOpen && (
        <ImportDialog
          initial={importFiles}
          dropPanelType={importPanel}
          onClose={() => useImport.getState().close()}
          onNotice={flash}
        />
      )}
      {showLoad && (
        <LoadDialog
          onLoad={loadTemplate}
          onClose={() => setShowLoad(false)}
          onError={flash}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** One tab per chart needed to cover the survey line; each chart starts where the previous one ends. */
function ChartTabs({ onNotice }: { onNotice(m: string): void }) {
  const template = useEditor((s) => s.template)!;
  const current = useEditor((s) => s.sheetIndex);
  const panMap = useEditor((s) => s.panMap);
  const n = sheetCount(template);
  const st = () => useEditor.getState();
  const route = useSurvey((s) => s.route);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    i: number;
  } | null>(null);
  const fitCurve = async (i: number, ask = false) => {
    if (!route) return;
    // Start where the chart's plan view shows the line now (it may have been panned).
    const from = chartKpRange(template, i).start * 1000;
    let fit = fitSegments(template, route, i, 0.97, 12, from);
    if (ask) {
      const v = await askText(
        `Fit Chart ${i + 1} to the curved line: number of segments in the chart (the automatic fit makes ${(fit?.segments.length ?? 0) + 1}; fewer segments allow more curve in each)`,
        String((fit?.segments.length ?? 1) + 1),
      );
      const n = parseInt(v ?? "", 10);
      if (!(n >= 1)) return;
      fit = n === 1 ? null : fitSegmentsN(template, route, i, n, from);
      if (n === 1) {
        st().commit((t) => fitSheet(t, i, undefined, undefined));
        onNotice(`Chart ${i + 1} is one straight frame again.`);
        return;
      }
    }
    if (!fit) {
      onNotice("No line on this chart.");
      return;
    }
    if (!fit.segments.length && !ask) {
      onNotice(`Chart ${i + 1}: the line is already straight enough.`);
      return;
    }
    const f = fit;
    st().commit((t) => fitSheet(t, i, f.segments, f.end, f.start));
    st().setSheet(i);
    onNotice(
      `Chart ${i + 1} fitted to the curve in ${f.segments.length + 1} segments, KP ${(f.start / 1000).toFixed(3)} to ${(f.end / 1000).toFixed(3)}. The charts after it moved along.`,
    );
  };
  return (
    <div className="chart-bar">
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Fit to curved line",
              disabled: !route,
              action: () => void fitCurve(menu.i),
            },
            {
              label: "Fit to curved line in a number of segments…",
              disabled: !route,
              action: () => void fitCurve(menu.i, true),
            },
            {
              label: "Straighten (undo the fit)",
              disabled: !sheetFrame(template, menu.i)?.segments?.length,
              action: () =>
                st().commit((t) => fitSheet(t, menu.i, undefined, undefined)),
            },
            "separator",
            {
              label: "Add chart after this one",
              action: () => st().commit((t) => insertSheet(t, menu.i)),
            },
            ...(menu.i === 0
              ? [
                  {
                    label: "Match panels' start KP to KP 0 in the plan view",
                    checked: !!template.scale.kpAlign?.[menu.i],
                    action: () =>
                      st().setScale({
                        kpAlign: {
                          ...template.scale.kpAlign,
                          [menu.i]: !template.scale.kpAlign?.[menu.i],
                        },
                      }),
                  },
                ]
              : []),
            ...(menu.i === n - 1
              ? [
                  {
                    label: "Match panels' end KP to End KP in the plan view",
                    checked: !!template.scale.kpAlignEnd?.[menu.i],
                    action: () =>
                      st().setScale({
                        kpAlignEnd: {
                          ...template.scale.kpAlignEnd,
                          [menu.i]: !template.scale.kpAlignEnd?.[menu.i],
                        },
                      }),
                  },
                ]
              : []),
            {
              label: "Delete this chart",
              disabled: n <= 1,
              action: () => st().commit((t) => deleteSheet(t, menu.i)),
            },
          ]}
        />
      )}
      <nav className="chart-tabs" aria-label="Charts">
        {Array.from({ length: n }, (_, i) => {
          // The KPs of the runline in the chart's plan view (as the title block gives them).
          const r = chartKpRange(template, i);
          return (
            <button
              key={i}
              className={i === current ? "active" : ""}
              onClick={() => st().setSheet(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                st().setSheet(i);
                setMenu({ x: e.clientX, y: e.clientY, i });
              }}
              title={`KP ${r.start.toFixed(3)} to KP ${r.end.toFixed(3)}. Right-click: fit to a curved line, add or delete a chart.`}
            >
              Chart {i + 1}
              <span>
                KP {r.start.toFixed(3)}–{r.end.toFixed(3)}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="chart-tools">
        <ChartNumber
          label="Start KP"
          suffix="km"
          title="KP at the left edge of this chart's plan view. Chart 1 may start before KP 0."
          value={sheetRange(template, current).start.toFixed(3)}
          onCommit={(v) =>
            st().commit((t) =>
              editSheet(t, current, {
                start: Math.round(v * 1000 * 1000) / 1000,
              }),
            )
          }
        />
        {sheetFrame(template, current)?.end !== undefined && (
          <ChartNumber
            label="End KP"
            suffix="km"
            title="KP where this chart hands over to the next. For the parts of a fitted curve the next part starts here."
            value={((sheetFrame(template, current)!.end ?? 0) / 1000).toFixed(
              3,
            )}
            onCommit={(v) =>
              st().commit((t) =>
                editSheet(t, current, {
                  end: Math.round(v * 1000 * 1000) / 1000,
                }),
              )
            }
          />
        )}
        <ChartNumber
          label="Rotate"
          suffix="°"
          title="Turn this chart's frame, e.g. for a sharp bend. You can also drag the round grip in the key plan."
          value={String(sheetRotation(template, current))}
          onCommit={(v) =>
            st().commit((t) => editSheet(t, current, { rotation: v }))
          }
        />
        <button
          className={panMap ? "active" : ""}
          aria-pressed={panMap}
          onClick={() => st().setPanMap(!panMap)}
          title="Drag inside the plan view to move the map for this chart. Click again to go back to moving panels."
        >
          Pan map
        </button>
        <button
          onClick={() => st().commit((t) => insertSheet(t, current))}
          title="Add a chart after this one, halfway along. Use it where the line turns sharply."
        >
          + Add chart
        </button>
        <button
          disabled={n <= 1}
          onClick={() => st().commit((t) => deleteSheet(t, current))}
          title="Delete this chart"
        >
          Delete chart
        </button>
      </div>
    </div>
  );
}

function ChartNumber({
  label,
  suffix,
  title,
  value,
  onCommit,
}: {
  label: string;
  suffix: string;
  title: string;
  value: string;
  onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label title={title}>
      {label}
      <input
        className="scale-input short"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft.replace(",", "."));
          if (Number.isFinite(v) && draft !== value) onCommit(v);
          else setDraft(value);
        }}
        onKeyDown={(e) =>
          e.key === "Enter" && (e.target as HTMLInputElement).blur()
        }
      />
      {suffix}
    </label>
  );
}

function LoadDialog({
  onLoad,
  onClose,
  onError,
}: {
  onLoad(t: ChartTemplate): void;
  onClose(): void;
  onError(msg: string): void;
}) {
  const users = listUserTemplates();
  const builtins = BUILTIN_TEMPLATES.map((f) => f());
  const all = [...users, ...builtins];
  const [id, setId] = useState(all[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.getElementById("load-select")?.focus();
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-title"
        onSubmit={(e) => {
          e.preventDefault();
          const t = all.find((x) => x.id === id);
          if (t) onLoad(t);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
      >
        <h3 id="load-title">Load template</h3>
        <select
          id="load-select"
          size={Math.min(8, all.length + 2)}
          value={id}
          onChange={(e) => setId(e.target.value)}
          onDoubleClick={() =>
            all.find((x) => x.id === id) &&
            onLoad(all.find((x) => x.id === id)!)
          }
        >
          {users.length > 0 && (
            <optgroup label="My templates">
              {users.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Built-in">
            {builtins.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
        <div className="dialog-actions">
          <button
            type="button"
            className="push-left"
            onClick={() => fileRef.current?.click()}
          >
            Import file…
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!id}>
            Load
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              onLoad(await importTemplateFile(f));
            } catch (err) {
              onError((err as Error).message);
            }
          }}
        />
      </form>
    </div>
  );
}

function ScaleQuick() {
  const template = useEditor((s) => s.template!);
  const scale = template.scale;
  const [draft, setDraft] = useState(String(scale.horizontal));
  const [route, setRoute] = useState((scale.routeLength / 1000).toFixed(3));
  useEffect(() => setDraft(String(scale.horizontal)), [scale.horizontal]);
  useEffect(
    () => setRoute((scale.routeLength / 1000).toFixed(3)),
    [scale.routeLength],
  );
  const [overlap, setOverlap] = useState(String(scale.overlap));
  useEffect(() => setOverlap(String(scale.overlap)), [scale.overlap]);
  const hasRoute = useSurvey((s) => !!s.source);
  const reversed = useSurvey((s) => s.reversed);
  const shifted = !!scale.sheets;
  return (
    <>
      <label title="Plan view scale. The panel keeps its size; this sets how much route fits in it.">
        Scale 1:
        <input
          className="scale-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = parseFloat(draft);
            if (v > 0 && v !== scale.horizontal)
              useEditor.getState().setHorizontalScale(v);
            else setDraft(String(scale.horizontal));
          }}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.target as HTMLInputElement).blur()
          }
        />
        <span className="muted">
          {" "}
          {(scale.kpPerSheet / 1000).toFixed(3)} km/chart
        </span>
      </label>
      <label title="Survey line length. Filled in from the route file once data import arrives.">
        Route
        <input
          className="scale-input"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          onBlur={() => {
            const v = parseFloat(route) * 1000;
            if (v > 0 && v !== scale.routeLength)
              useEditor.getState().setScale({ routeLength: v });
            else setRoute((scale.routeLength / 1000).toFixed(3));
          }}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.target as HTMLInputElement).blur()
          }
        />
        km
        <span className="muted"> = {sheetCount(template)} charts</span>
      </label>
      <label title="How far each chart overlaps the one before it, in metres">
        Overlap
        <input
          className="scale-input short"
          value={overlap}
          onChange={(e) => setOverlap(e.target.value)}
          onBlur={() => {
            const v = parseFloat(overlap);
            if (v >= 0 && v < scale.kpPerSheet && v !== scale.overlap)
              useEditor.getState().setScale({ overlap: v });
            else setOverlap(String(scale.overlap));
          }}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.target as HTMLInputElement).blur()
          }
        />
        m
      </label>
      {hasRoute && (
        <label
          className="check"
          title="Run KP from the other end of the line. The first chart always starts at KP 0."
        >
          <input
            type="checkbox"
            checked={reversed}
            onChange={(e) => {
              useSurvey.getState().setReversed(e.target.checked);
              useEditor.getState().setScale({ sheets: undefined });
            }}
          />
          Reverse route
        </label>
      )}
      <button
        disabled={!shifted}
        onClick={() => useEditor.getState().setScale({ sheets: undefined })}
        title="Undo hand-made frame changes and fit the charts to the line again"
      >
        Reset frames
      </button>
    </>
  );
}

const DEFAULT_PANES = { left: 250, right: 300 };
const PANES_KEY = "maha.paneWidths";

function loadPanes() {
  try {
    const v = JSON.parse(localStorage.getItem(PANES_KEY) ?? "null");
    if (v && Number.isFinite(v.left) && Number.isFinite(v.right))
      return v as typeof DEFAULT_PANES;
  } catch {
    /* use the default */
  }
  return DEFAULT_PANES;
}

/** The thin bar between a side panel and the sheet: drag it to change the panel's width. */
function PaneResizer({
  side,
  panes,
  setPanes,
}: {
  side: "left" | "right";
  panes: typeof DEFAULT_PANES;
  setPanes(p: typeof DEFAULT_PANES): void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`pane-resizer${drag ? " drag" : ""}`}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize; double-click to reset"
      onDoubleClick={() => setPanes({ ...panes, [side]: DEFAULT_PANES[side] })}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const w0 = panes[side];
        setDrag(true);
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - x0;
          const w = Math.round(
            Math.min(700, Math.max(160, side === "left" ? w0 + dx : w0 - dx)),
          );
          setPanes({ ...panes, [side]: w });
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          setDrag(false);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
    />
  );
}

function toggleHoverInfo() {
  const p = usePrefs.getState();
  p.setHoverInfo(!p.hoverInfo);
  if (p.hoverInfo) useHoverTip.setState({ tip: null });
}

/** Hover info on/off and its shortcut, on the toolbar. */
function HoverInfoButtons() {
  const on = usePrefs((p) => p.hoverInfo);
  const key = usePrefs((p) => p.hoverKey);
  async function change() {
    const v = await askText(
      "Shortcut for hover info (e.g. F3, F4, Ctrl+I, Alt+H)",
      key,
      "Set",
    );
    if (v === null) return;
    const k = normaliseShortcut(v);
    if (k) usePrefs.getState().setHoverKey(k);
  }
  return (
    <span className="btn-pair">
      <button
        className={on ? "active" : ""}
        aria-pressed={on}
        data-hover-info={on ? "on" : "off"}
        onClick={toggleHoverInfo}
        title={`Show what is under the pointer: easting, northing, KP and offset in the plan view and key plan, KP and values in the profiles (${key})`}
      >
        Hover info ({key})
      </button>
      <button
        className="hover-key"
        onClick={() => void change()}
        title="Change the hover info shortcut"
        aria-label="Change the hover info shortcut"
      >
        ⌨
      </button>
    </span>
  );
}

function MeasureButton() {
  const armed = useMeasure((m) => m.armed);
  const has = useMeasure((m) => !!m.a);
  const key = usePrefs((p) => p.measureKey);
  async function change() {
    const v = await askText(
      "Shortcut for the measuring arrow (e.g. F5, Ctrl+M, Alt+A)",
      key,
      "Set",
    );
    if (v === null) return;
    const k = normaliseShortcut(v);
    if (k) usePrefs.getState().setMeasureKey(k);
  }
  return (
    <span className="btn-pair">
      <button
        className={armed ? "active measure-on" : ""}
        aria-pressed={armed}
        data-measure={armed ? "on" : "off"}
        onClick={() => {
          const m = useMeasure.getState();
          if (m.armed) m.reset();
          else m.setArmed(true);
        }}
        title={`Draw an arrow on the sheet to measure a distance at the chart's horizontal scale: drag to draw it, drag it to move it, hold Shift to keep it straight (${key})`}
      >
        Arrow ({key})
      </button>
      <button
        className="hover-key"
        onClick={() => void change()}
        title="Change the arrow shortcut"
        aria-label="Change the arrow shortcut"
      >
        ⌨
      </button>
      {has && (
        <button
          className="hover-key"
          onClick={() => useMeasure.getState().set(null, null)}
          title="Remove the measuring arrow"
          aria-label="Remove the measuring arrow"
        >
          ✕
        </button>
      )}
    </span>
  );
}

function RulerButtons() {
  const on = useRuler((r) => r.on);
  const key = usePrefs((p) => p.rulerKey);
  async function change() {
    const v = await askText(
      "Shortcut for the ruler (e.g. F4, Ctrl+R, Alt+K)",
      key,
      "Set",
    );
    if (v === null) return;
    const k = normaliseShortcut(v);
    if (k) usePrefs.getState().setRulerKey(k);
  }
  return (
    <span className="btn-pair">
      <button
        className={on ? "active" : ""}
        aria-pressed={on}
        data-ruler={on ? "on" : "off"}
        onClick={() => useRuler.getState().setOn(!on)}
        title={`Show a red line at the same KP in every panel, following the pointer (${key})`}
      >
        Ruler ({key})
      </button>
      <button
        className="hover-key"
        onClick={() => void change()}
        title="Change the ruler shortcut"
        aria-label="Change the ruler shortcut"
      >
        ⌨
      </button>
    </span>
  );
}

/** The hover info box next to the pointer. */
function HoverTip() {
  const tip = useHoverTip((s) => s.tip);
  const on = usePrefs((p) => p.hoverInfo);
  if (!on || !tip) return null;
  const right = tip.x + 260 > window.innerWidth;
  return (
    <div
      className="hover-tip"
      role="tooltip"
      style={{
        left: right ? undefined : tip.x + 16,
        right: right ? window.innerWidth - tip.x + 16 : undefined,
        top: tip.y + 18,
      }}
    >
      {tip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? "hover-tip-head" : ""}>
          {l}
        </div>
      ))}
    </div>
  );
}
