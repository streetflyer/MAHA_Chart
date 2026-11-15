import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
import { askText } from "./Dialog";
import { LEGEND_GROUPS } from "../model/presets";
import type { LegendGroup, Panel } from "../model/types";

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
