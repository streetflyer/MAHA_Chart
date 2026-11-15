import { useEditor } from "../state/store";
import { askPair } from "./Dialog";
import { pairsOf, pairsText } from "./PropertiesPanel";

/**
 * Double-click on a "label : value" line of a text panel (equipment, geodetic…):
 * edit the two parts in their own boxes, so the colon stays lined up.
 * Returns true when there was such a line under the pointer.
 */
export function editPairAt(clientX: number, clientY: number): boolean {
  const hit = [
    ...document.querySelectorAll("svg.sheet [data-item] tspan[data-line]"),
  ].find((t) => {
    if (t.closest("[data-codes]")) return false;
    const r = t.getBoundingClientRect();
    return (
      clientX >= r.left - 2 &&
      clientX <= r.right + 40 &&
      clientY >= r.top - 1 &&
      clientY <= r.bottom + 1
    );
  });
  if (!hit) return false;
  const id = hit.closest("[data-item]")?.getAttribute("data-item");
  const ed = useEditor.getState();
  const p = ed.template?.panels.find((q) => q.id === id);
  if (!p) return false;
  const key = hit.closest("[data-body2]") ? "body2" : "body";
  const rows = pairsOf(p[key] ?? "");
  if (!rows) return false;
  const i = [
    ...hit.parentElement!.querySelectorAll("tspan[data-line]"),
  ].indexOf(hit);
  if (i < 0 || i >= rows.length) return false;
  void (async () => {
    const v = await askPair(
      "Edit item",
      p.type === "equipment"
        ? ["System type", "System name"]
        : ["Item", "Value"],
      rows[i],
    );
    if (!v) return;
    const next = rows.map((r, j) => (j === i ? v : r));
    ed.updatePanel(p.id, { [key]: pairsText(next) });
  })();
  return true;
}
