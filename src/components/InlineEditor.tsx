import { useVideo } from "../state/video";
import { useProject } from "../state/project";
import { autoSurveyDate } from "../model/video";
import {
  currentRevision,
  setCurrentRevision,
  surveyDateOf,
  templateTokens,
} from "../model/tokens";
import { useEffect, useRef, useState } from "react";
import { REVIEW_OPTIONS } from "../model/presets";
import type {
  ChartTemplate,
  RevisionColumn,
  RevisionRow,
} from "../model/types";
import { useEditor, type InlineEdit } from "../state/store";
import {
  chartBody,
  chartField,
  clearChartField,
  hasChartBody,
  setChartBody,
  setChartField,
} from "../model/chartText";
import {
  REV_COLUMNS,
  isBlank,
  titleInsideHeight,
  titleBlockLayout,
} from "./PanelContent";
import { textPos, titleRect } from "./SheetView";
import { approxTextWidth, fontSize } from "./svgText";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Target {
  rect: Rect;
  value: string;
  multiline: boolean;
  cap: number;
  /** Offer these choices plus "User defined…". */
  options?: string[];
  /** Can be set for this chart only; `own`: this chart already has its own value. */
  perChart?: { own: boolean };
}

function targetFor(e: InlineEdit, t: ChartTemplate): Target | null {
  if (e.kind === "text") {
    const tx = t.texts.find((x) => x.id === e.id);
    if (!tx) return null;
    const pos = textPos(tx, t);
    const w = Math.max(40, approxTextWidth(tx.text, tx.size) + 10);
    const x =
      tx.anchor === "middle"
        ? pos.x - w / 2
        : tx.anchor === "end"
          ? pos.x - w
          : pos.x;
    return {
      rect: { x, y: pos.y - fontSize(tx.size), w, h: fontSize(tx.size) * 1.5 },
      value: tx.text,
      multiline: false,
      cap: tx.size,
    };
  }
  const p = t.panels.find((x) => x.id === e.id);
  if (!p) return null;
  if (e.kind === "panelTitle") {
    const r =
      p.titlePosition === "none"
        ? { x: p.x, y: p.y, w: p.w, h: 5 }
        : titleRect(p);
    return { rect: r, value: p.title, multiline: false, cap: 2.2 };
  }
  if (e.kind === "row") {
    const rows = p.rows ?? [];
    const i = rows.findIndex((r) => r.id === e.rowId);
    if (i < 0) return null;
    const rh = p.h / rows.length;
    return {
      rect: {
        x: p.x,
        y: p.y + i * rh,
        w: Math.max(p.labelWidth ?? 30, 60),
        h: Math.max(rh, 6),
      },
      value: rows[i].label,
      multiline: false,
      cap: 1.8,
    };
  }
  if (e.kind === "revision") {
    const L = titleBlockLayout(p);
    const ri = L.rows.findIndex((r) => r.id === e.rowId);
    const ci = REV_COLUMNS.findIndex((c) => c.key === e.col);
    if (ri < 0 || ci < 0) return null;
    const cell = L.cell(ri, ci);
    const col = e.col as RevisionColumn;
    return {
      rect: {
        ...cell,
        w: Math.max(cell.w, col === "desc" ? 60 : 22),
        h: Math.max(cell.h, 5),
      },
      value: L.rows[ri][col],
      multiline: false,
      cap: 1.5,
      options: col === "desc" ? REVIEW_OPTIONS : undefined,
    };
  }
  if (e.kind === "field") {
    const key = e.col!;
    const tb = p.type === "titleBlock" ? titleBlockLayout(p) : null;
    const survey = tb?.surveyCells.find((c) => c.key === key);
    const bottom = tb?.bottomCols.find((c) => c.key === key);
    const rect = survey
      ? {
          x: survey.x,
          y: tb!.surveyY,
          w: Math.max(survey.w, 60),
          h: Math.max(tb!.u * 1.1, 5),
        }
      : bottom
        ? {
            x: bottom.x,
            y: tb!.bottomY,
            w: Math.max(bottom.w, 60),
            h: Math.max(tb!.u * 2.4, 6),
          }
        : { x: p.x, y: p.y, w: p.w, h: 6 };
    const si = useEditor.getState().sheetIndex;
    const sheetTokens = templateTokens(t, si);
    const own = chartField(t, si, key);
    const auto = autoSurveyDate(useVideo.getState().rows, {
      drawingNo: sheetTokens.CHART_NO ?? "",
      folder: useProject.getState().active ?? "",
    });
    return {
      rect,
      value:
        own !== undefined
          ? own
          : key === "REV"
            ? currentRevision(t)
            : key === "SURVEY_DATE"
              ? surveyDateOf(t, auto)
              : (t.fields[key] ??
                (key === "PLOT_SIZE" ? `ISO ${t.paper.size}` : "")),
      multiline: false,
      cap: 1.8,
      perChart: { own: own !== undefined },
    };
  }
  const top = p.y + titleInsideHeight(p);
  const h = Math.max(p.y + p.h - top, 20);
  const si = useEditor.getState().sheetIndex;
  const second = e.kind === "panelBody2";
  const perChart = { own: hasChartBody(t, si, p.id, second) };
  if (second)
    return {
      rect: { x: p.x + p.w / 2, y: top, w: Math.max(p.w / 2, 80), h },
      value: chartBody(t, si, p, true) ?? "",
      multiline: true,
      cap: 1.8,
      perChart,
    };
  return {
    rect: { x: p.x, y: top, w: p.w, h },
    value: chartBody(t, si, p) ?? "",
    multiline: true,
    cap: 1.8,
    perChart,
  };
}

/** Apply an edited revision cell. A blank row that gets its first value becomes the newest revision. */
function setRevisionCell(
  rows: RevisionRow[],
  rowId: string,
  col: RevisionColumn,
  value: string,
): RevisionRow[] {
  const i = rows.findIndex((r) => r.id === rowId);
  if (i < 0) return rows;
  const wasBlank = isBlank(rows[i]);
  const updated = { ...rows[i], [col]: value };
  const rest = rows.filter((r) => r.id !== rowId);
  if (wasBlank && !isBlank(updated)) return [updated, ...rest];
  const out = [...rows];
  out[i] = updated;
  return out;
}

/**
 * The rename / edit box laid over the sheet. Enter (or Ctrl+Enter for multi-line
 * text) commits, Escape cancels, clicking elsewhere commits, like Windows Explorer.
 */
export function InlineEditor({
  svg,
  wrap,
}: {
  svg: SVGSVGElement;
  wrap: HTMLDivElement;
}) {
  const editing = useEditor((s) => s.editing)!;
  const template = useEditor((s) => s.template)!;
  const target = targetFor(editing, template);
  const [value, setValue] = useState(target?.value ?? "");
  const [custom, setCustom] = useState(
    () =>
      !!target?.options &&
      !!target.value &&
      !target.options.includes(target.value),
  );
  const ref = useRef<
    HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement
  >(null);
  const done = useRef(false);
  const switching = useRef(false);
  const [onlyThis, setOnlyThis] = useState(!!target?.perChart?.own);

  useEffect(() => {
    switching.current = false;
    ref.current?.focus();
    const el = ref.current as HTMLElement | null;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      el.select();
  }, [custom]);

  if (!target) return null;
  const ctm = svg.getScreenCTM();
  const box = wrap.getBoundingClientRect();
  if (!ctm) return null;
  const tl = new DOMPoint(target.rect.x, target.rect.y).matrixTransform(ctm);
  const br = new DOMPoint(
    target.rect.x + target.rect.w,
    target.rect.y + target.rect.h,
  ).matrixTransform(ctm);
  const style: React.CSSProperties = {
    left: tl.x - box.left,
    top: tl.y - box.top,
    width: Math.max(br.x - tl.x, target.options ? 200 : 120),
    height: target.multiline
      ? Math.max(br.y - tl.y, 80)
      : Math.max(br.y - tl.y, 24),
    fontSize: Math.min(Math.max(fontSize(target.cap) * ctm.a, 11), 18),
  };

  function finish(commit: boolean, v = value) {
    if (done.current) return;
    done.current = true;
    const s = useEditor.getState();
    const e = editing;
    const si = s.sheetIndex;
    const changed = v !== target!.value || onlyThis !== !!target!.perChart?.own;
    if (commit && changed && target!.perChart && e.kind === "field") {
      // Typed for this chart only, or for every chart (dropping this chart's own value).
      if (onlyThis) s.commit((t) => setChartField(t, si, e.col!, v, true));
      else if (e.col === "REV")
        s.commit((t) =>
          setCurrentRevision(clearChartField(t, si, "REV"), v.trim()),
        );
      else if (e.col === "SURVEY_DATE")
        s.commit((t) => {
          const tt = clearChartField(t, si, "SURVEY_DATE");
          return {
            ...tt,
            fields: {
              ...tt.fields,
              SURVEY_DATE: v,
              SURVEY_DATE_MANUAL: v.trim() ? "1" : "",
            },
          };
        });
      else s.commit((t) => setChartField(t, si, e.col!, v, false));
    } else if (
      commit &&
      changed &&
      target!.perChart &&
      (e.kind === "panelBody" || e.kind === "panelBody2")
    )
      s.commit((t) =>
        setChartBody(t, si, e.id, v, onlyThis, e.kind === "panelBody2"),
      );
    else if (commit && v !== target!.value) {
      if (e.kind === "text") s.updateText(e.id, { text: v });
      else if (e.kind === "panelTitle") s.updatePanel(e.id, { title: v });
      else if (e.kind === "panelBody") s.updatePanel(e.id, { body: v });
      else if (e.kind === "panelBody2") s.updatePanel(e.id, { body2: v });
      else if (e.kind === "field" && e.col === "REV")
        s.commit((t) => setCurrentRevision(t, v.trim()));
      else if (e.kind === "field" && e.col === "SURVEY_DATE")
        // Clearing the box goes back to the dates of the video timing list.
        s.commit((t) => ({
          ...t,
          fields: {
            ...t.fields,
            SURVEY_DATE: v,
            SURVEY_DATE_MANUAL: v.trim() ? "1" : "",
          },
        }));
      else if (e.kind === "field") s.setField(e.col!, v);
      else if (e.kind === "row") {
        const p = s.template!.panels.find((x) => x.id === e.id)!;
        s.updatePanel(e.id, {
          rows: (p.rows ?? []).map((r) =>
            r.id === e.rowId ? { ...r, label: v } : r,
          ),
        });
      } else if (e.kind === "revision") {
        const p = s.template!.panels.find((x) => x.id === e.id)!;
        s.updatePanel(e.id, {
          revisions: setRevisionCell(
            p.revisions ?? [],
            e.rowId!,
            e.col as RevisionColumn,
            v,
          ),
        });
      }
    }
    s.startEdit(null);
  }

  const keys = (ev: React.KeyboardEvent) => {
    ev.stopPropagation();
    if (ev.key === "Escape") finish(false);
    else if (
      ev.key === "Enter" &&
      (!target.multiline || ev.ctrlKey || ev.metaKey)
    ) {
      ev.preventDefault();
      finish(true);
    }
  };
  const stop = (ev: React.PointerEvent) => ev.stopPropagation();

  if (target.options && !custom) {
    return (
      <select
        ref={ref}
        className="inline-editor"
        style={style}
        value={target.options.includes(value) ? value : ""}
        onPointerDown={stop}
        onKeyDown={keys}
        onBlur={() => !switching.current && finish(true)}
        onChange={(ev) => {
          if (ev.target.value === "__custom") {
            switching.current = true;
            setCustom(true);
            return;
          }
          setValue(ev.target.value);
          finish(true, ev.target.value);
        }}
      >
        <option value="">(blank)</option>
        {target.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
        <option value="__custom">User defined…</option>
      </select>
    );
  }

  const common = {
    ref,
    className: "inline-editor",
    style,
    value,
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(ev.target.value),
    onBlur: () => finish(true),
    onPointerDown: stop,
    onKeyDown: keys,
  };
  const field = target.multiline ? (
    <textarea {...common} title="Ctrl+Enter to finish, Esc to cancel" />
  ) : (
    <input
      {...common}
      placeholder={custom ? "Type a description" : undefined}
    />
  );
  if (!target.perChart) return field;
  const chartNo = useEditor.getState().sheetIndex + 1;
  return (
    <>
      {field}
      <label
        className="inline-only-chart"
        data-only-chart={onlyThis ? "on" : "off"}
        style={{
          left: style.left,
          top:
            (style.top as number) +
            (typeof style.height === "number" ? style.height : 24) +
            2,
        }}
        // Keep the text box focused: a click here must not finish the edit.
        onPointerDown={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setOnlyThis((x) => !x);
          ref.current?.focus();
        }}
        // The label's own click would focus its checkbox and end the edit.
        onClick={(ev) => ev.preventDefault()}
        title="Tick to use this text on this chart only; untick to use it on every chart"
      >
        <input type="checkbox" checked={onlyThis} readOnly tabIndex={-1} /> Only
        apply for this chart (Chart {chartNo})
      </label>
    </>
  );
}
