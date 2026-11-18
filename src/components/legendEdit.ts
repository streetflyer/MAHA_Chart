import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
import { askText } from "./Dialog";
import { useCodeDefs } from "../state/codeDefs";
import { useSymbolEdit } from "../state/symbolEdit";
import type { MenuItem } from "./ContextMenu";
import { LEGEND_GROUPS } from "../model/presets";
import type { LegendGroup, LegendItem, Panel } from "../model/types";
import { dataLegend } from "../model/legendData";
import { planStyle } from "../model/planStyle";
import { newId } from "../model/ids";

/** The legend panel an element on the sheet belongs to. */
function legendOf(el: Element): Panel | undefined {
  const panels = useEditor.getState().template?.panels ?? [];
  let n: Element | null = el.closest("[data-item]");
  while (n) {
    const p = panels.find((q) => q.id === n!.getAttribute("data-item"));
    if (p?.type === "legend") return p;
    n = n.parentElement?.closest("[data-item]") ?? null;
  }
  return panels.find((q) => q.type === "legend");
}

/**
 * Double-click on legend text: a heading, an item's wording or an event code definition.
 * Returns true when it found legend text to edit.
 */
export function editLegendAt(
  el: Element,
  clientX: number,
  clientY: number,
): boolean {
  // Sheet text takes no pointer events, so find the legend text by where it is drawn.
  const under = (sel: string) =>
    [...document.querySelectorAll(`svg.sheet ${sel}`)].find((t) => {
      const r = t.getBoundingClientRect();
      return (
        clientX >= r.left - 2 &&
        clientX <= r.right + 2 &&
        clientY >= r.top - 1 &&
        clientY <= r.bottom + 1
      );
    });
  // A double-click on a symbol opens the symbol window; on the words it edits them.
  const symEl = under("[data-lsym]");
  if (symEl) {
    const panel = legendOf(symEl);
    const id = symEl.getAttribute("data-lsym");
    if (panel && id) {
      useSymbolEdit.getState().open(panel.id, id);
      return true;
    }
  }
  const headEl = under("[data-lhead]");
  const itemEl = headEl ? undefined : under("[data-legend]");
  const lineEl =
    headEl || itemEl ? undefined : under("[data-codes] tspan[data-line]");
  const head = headEl?.getAttribute("data-lhead");
  const item = itemEl?.getAttribute("data-legend");
  if (!head && !item && !lineEl) return false;
  const p = legendOf(headEl ?? itemEl ?? lineEl ?? el);
  if (!p) return false;
  void (async () => {
    const ed = useEditor.getState();
    const ls: Partial<NonNullable<Panel["legendStyle"]>> = p.legendStyle ?? {};
    const setLs = (patch: object) =>
      ed.updatePanel(p.id, {
        legendStyle: { ...p.legendStyle, ...patch } as Panel["legendStyle"],
      });
    if (head) {
      const g = head as LegendGroup | "codes";
      const cur =
        ls.headings?.[g] ||
        (g === "codes" ? "EVENT CODE DEFINITIONS:" : LEGEND_GROUPS[g]);
      const v = await askText("Heading", cur);
      if (v !== null) setLs({ headings: { ...ls.headings, [g]: v } });
      return;
    }
    if (item) {
      const t = (
        el.closest("[data-legend]") as SVGGElement | null
      )?.querySelector("text:last-of-type")?.textContent;
      const ld = p.legendData ?? { on: true, overrides: {} };
      if (item.startsWith("data:")) {
        const key = item.slice(5);
        const v = await askText(
          "Legend text",
          ld.overrides[key]?.label ?? t ?? "",
        );
        if (v !== null)
          ed.updatePanel(p.id, {
            legendData: {
              ...ld,
              overrides: {
                ...ld.overrides,
                [key]: { ...ld.overrides[key], label: v },
              },
            },
          });
      } else {
        const own = (p.legend ?? []).find((x) => x.id === item);
        if (!own) return;
        const v = await askText("Legend text", own.label);
        if (v !== null)
          ed.updatePanel(p.id, {
            legend: (p.legend ?? []).map((x) =>
              x.id === item ? { ...x, label: v } : x,
            ),
          });
      }
      return;
    }
    // A definition line: the one under the pointer.
    const hit = lineEl;
    const code = hit?.getAttribute("data-line");
    if (!code) return;
    const desc = hit!.textContent!.slice(code.length).trim();
    const fromData =
      p.legendData?.on !== false &&
      useSurvey
        .getState()
        .datasets.some((d) => d.kind === "events" && d.visible);
    const v = await askText(`Definition of ${code}`, desc);
    if (v === null) return;
    const key = code.trim().toUpperCase();
    if (fromData) setLs({ codeEdits: { ...ls.codeEdits, [key]: v } });
    else
      ed.updatePanel(p.id, {
        eventCodes: (p.eventCodes ?? "")
          .split("\n")
          .map((l) => (l.split("\t")[0] === code ? `${code}\t${v}` : l))
          .join("\n"),
      });
  })();
  return true;
}

/** A right-click on the event code definitions of a legend: which legend and which code. */
export function codeDefAt(
  clientX: number,
  clientY: number,
): { panelId: string; code?: string } | null {
  const over = (t: Element) => {
    const r = t.getBoundingClientRect();
    return (
      clientX >= r.left - 2 &&
      clientX <= r.right + 2 &&
      clientY >= r.top - 1 &&
      clientY <= r.bottom + 1
    );
  };
  const line = [
    ...document.querySelectorAll("svg.sheet [data-codes] tspan[data-line]"),
  ].find(over);
  const head = [
    ...document.querySelectorAll('svg.sheet [data-lhead="codes"]'),
  ].find(over);
  const hit = line ?? head;
  if (!hit) return null;
  const p = legendOf(hit);
  return p
    ? { panelId: p.id, code: line?.getAttribute("data-line") ?? undefined }
    : null;
}

/** Menu of a legend's event code definitions. */
export function codeDefMenu(panelId: string, code?: string): MenuItem[] {
  const p = useEditor.getState().template?.panels.find((q) => q.id === panelId);
  const items: MenuItem[] = [
    {
      label: "Write the definitions from the file's columns…",
      action: () => useCodeDefs.getState().open(panelId),
    },
  ];
  if (p?.legendStyle?.codeDef)
    items.push({
      label: "Back to the file's value column",
      action: () =>
        useEditor.getState().updatePanel(panelId, {
          legendStyle: {
            ...p.legendStyle,
            codeDef: undefined,
          } as Panel["legendStyle"],
        }),
    });
  if (code) {
    const key = code.trim().toUpperCase();
    items.push({
      label: `Write the definition of ${code}…`,
      action: async () => {
        const cur =
          p?.legendStyle?.codeEdits?.[key] ??
          document
            .querySelector(`svg.sheet [data-codes] tspan[data-line="${code}"]`)
            ?.textContent?.slice(code.length)
            .trim() ??
          "";
        const v = await askText(`Definition of ${code}`, cur);
        if (v === null) return;
        useEditor.getState().updatePanel(panelId, {
          legendStyle: {
            ...p?.legendStyle,
            codeEdits: { ...p?.legendStyle?.codeEdits, [key]: v },
          } as Panel["legendStyle"],
        });
      },
    });
    if (p?.legendStyle?.codeEdits?.[key] !== undefined)
      items.push({
        label: `Back to the written definition of ${code}`,
        action: () => {
          const { [key]: _gone, ...rest } = p.legendStyle!.codeEdits!;
          void _gone;
          useEditor.getState().updatePanel(panelId, {
            legendStyle: {
              ...p.legendStyle,
              codeEdits: rest,
            } as Panel["legendStyle"],
          });
        },
      });
  }
  return items;
}

/** The legend symbol under a screen point (sheet text takes no pointer events). */
export function legendSymAt(
  clientX: number,
  clientY: number,
): { panelId: string; itemId: string } | null {
  const el = [...document.querySelectorAll("svg.sheet [data-lsym]")].find(
    (t) => {
      const r = t.getBoundingClientRect();
      return (
        clientX >= r.left - 1 &&
        clientX <= r.right + 1 &&
        clientY >= r.top - 1 &&
        clientY <= r.bottom + 1
      );
    },
  );
  const panel = el && legendOf(el);
  const itemId = el?.getAttribute("data-lsym");
  return panel && itemId ? { panelId: panel.id, itemId } : null;
}

/** The item as drawn: a data item with the user's changes, or one of the legend's own. */
function resolvedItem(p: Panel, itemId: string): LegendItem | undefined {
  if (!itemId.startsWith("data:"))
    return (p.legend ?? []).find((x) => x.id === itemId);
  const t = useEditor.getState().template;
  const plan = t?.panels.find((q) => q.type === "plan");
  const evp = t?.panels.find((q) => q.type === "events" && q.rows?.length);
  const d = dataLegend(
    useSurvey.getState().datasets,
    plan ? planStyle(plan).kpColor : "#e00000",
    evp ? evp.h / evp.rows!.length : 8,
  ).find((x) => x.id === itemId);
  if (!d) return undefined;
  const o = p.legendData?.overrides[d.key];
  return { ...d, ...o, label: o?.label ?? d.label };
}

/** Right-click menu of a legend symbol: edit, duplicate (drawn right below), remove. */
export function legendSymMenu(panelId: string, itemId: string): MenuItem[] {
  const ed = useEditor.getState();
  const p = ed.template?.panels.find((q) => q.id === panelId);
  if (!p) return [];
  const dup = () => {
    const it = resolvedItem(p, itemId);
    if (!it) return;
    const copy = { ...it } as LegendItem & Record<string, unknown>;
    for (const k of ["key", "datasetId", "colorOf", "hidden", "linked"])
      delete copy[k];
    const own: LegendItem = {
      ...copy,
      id: newId(),
      custom: true,
      after: itemId,
    };
    const list = [...(p.legend ?? [])];
    const at = list.findIndex((x) => x.id === itemId);
    list.splice(at < 0 ? list.length : at + 1, 0, own);
    ed.updatePanel(p.id, { legend: list });
  };
  const remove = () => {
    if (itemId.startsWith("data:")) {
      const key = itemId.slice(5);
      const ld = p.legendData ?? { on: true, overrides: {} };
      ed.updatePanel(p.id, {
        legendData: {
          ...ld,
          overrides: {
            ...ld.overrides,
            [key]: { ...ld.overrides[key], hidden: true },
          },
        },
      });
    } else
      ed.updatePanel(p.id, {
        legend: (p.legend ?? [])
          .filter((x) => x.id !== itemId)
          // Copies of a removed item stay where it was.
          .map((x) => (x.after === itemId ? { ...x, after: undefined } : x)),
      });
  };
  return [
    {
      label: "Edit…",
      action: () => useSymbolEdit.getState().open(panelId, itemId),
    },
    { label: "Duplicate", action: dup },
    "separator",
    { label: "Remove", action: remove },
  ];
}
