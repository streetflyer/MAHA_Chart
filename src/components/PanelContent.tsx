import { LEGEND_GROUPS } from '../model/presets';
import { formatScale, niceScaleBar, resolveTokens } from '../model/scale';
import type { ChartTemplate, LegendGroup, LegendItem, Panel, RevisionColumn, RevisionRow, TextStyle } from '../model/types';
import { Keyplan } from './Keyplan';
import { KpPanelData } from './KpPanels';

const sheetOf = (tokens: Record<string, string>) => Math.max(0, (parseInt(tokens.SHEET ?? '1', 10) || 1) - 1);
import { PlanView } from './PlanView';
import { useSurvey } from '../state/surveyData';
import { approxTextWidth, fontSize, wrapLines } from './svgText';

interface Props {
  panel: Panel;
  template: ChartTemplate;
  tokens: Record<string, string>;
  hasImage: boolean;
  onRowDoubleClick?: (panelId: string, rowId: string) => void;
}

export const TITLE_INSIDE_H = 5;
export const TITLE_CAP = 1.76;
const TITLE_LINE = TITLE_CAP * 1.6;

/** Lines of an inside title, wrapped to the panel width. */
export function titleLines(p: Panel, title = p.title): string[] {
  return wrapLines(title, Math.max(p.w - 4, 5), TITLE_CAP, true);
}

/** Space taken by an inside title; grows when a long title wraps. */
export function titleInsideHeight(p: Panel): number {
  if (p.titlePosition !== 'inside') return 0;
  return TITLE_INSIDE_H + (titleLines(p).length - 1) * TITLE_LINE;
}

export function titleLineHeight() {
  return TITLE_LINE;
}
const DEFAULT_BODY: TextStyle = { size: 1.8 };

/** Everything drawn inside a panel's frame. Data drawing arrives in plan step 3; for now each panel shows its layout. */
export function PanelContent({ panel: p, template, tokens, hasImage, onRowDoubleClick }: Props) {
  const top = p.y + titleInsideHeight(p);
  switch (p.type) {
    case 'plan':
      return (
        <PlanSection p={p} northUp={template.kind === 'northUp'} tokens={tokens} template={template} />
      );
    case 'longProfile':
    case 'transProfile':
    case 'cp':
      return (
        <>
          <ProfilePlaceholder p={p} label={dropHint(p)} />
          <KpPanelData p={p} t={template} sheetIndex={sheetOf(tokens)} />
        </>
      );
    case 'events':
      return (
        <>
          <EventRows p={p} onRowDoubleClick={onRowDoubleClick} />
          <KpPanelData p={p} t={template} sheetIndex={sheetOf(tokens)} />
        </>
      );
    case 'scale':
      return <ScaleBars p={p} top={top} template={template} />;
    case 'titleBlock':
      return <TitleBlock p={p} tokens={tokens} />;
    case 'legend':
      return <Legend p={p} tokens={tokens} />;
    case 'keyplan':
      return <Keyplan p={p} top={top} template={template} sheetIndex={Math.max(0, (parseInt(tokens.SHEET ?? '1', 10) || 1) - 1)} />;
    case 'logo':
      return hasImage ? null : <Hint p={p} top={top} text="Drop a logo image here" />;
    case 'chartInfo':
      return null;
    default:
      return <BodyText p={p} top={top} tokens={tokens} />;
  }
}

function dropHint(p: Panel): string {
  switch (p.type) {
    case 'longProfile':
      return 'Drop 5 / 7 / 9 point listing';
    case 'transProfile':
      return 'Drop cross profile (VisualWorks RAW)';
    case 'cp':
      return 'Drop CP file (KP, mV)';
    default:
      return '';
  }
}

function Hint({ p, top, text }: { p: Panel; top: number; text: string }) {
  return (
    <text className="hint" x={p.x + p.w / 2} y={(top + p.y + p.h) / 2} fontSize={fontSize(2.2)} textAnchor="middle" dominantBaseline="middle">
      {text}
    </text>
  );
}

function PlanSection({ p, northUp, tokens, template }: { p: Panel; northUp: boolean; tokens: Record<string, string>; template: ChartTemplate }) {
  const loaded = useSurvey((s) => !!s.route || s.datasets.some((d) => d.kind === 'linework' && d.visible && (d.target === 'plan' || !!d.both)));
  if (loaded) return <PlanView p={p} template={template} tokens={tokens} sheetIndex={Math.max(0, (parseInt(tokens.SHEET ?? '1', 10) || 1) - 1)} />;
  return <PlanPlaceholder p={p} northUp={northUp} tokens={tokens} />;
}

function PlanPlaceholder({ p, northUp, tokens }: { p: Panel; northUp: boolean; tokens: Record<string, string> }) {
  const lines = [];
  const step = 20;
  for (let x = p.x + step; x < p.x + p.w; x += step) lines.push(<line key={`x${x}`} x1={x} y1={p.y} x2={x} y2={p.y + p.h} />);
  for (let y = p.y + step; y < p.y + p.h; y += step) lines.push(<line key={`y${y}`} x1={p.x} y1={y} x2={p.x + p.w} y2={y} />);
  return (
    <g>
      <g className="grid">{lines}</g>
      <Hint p={p} top={p.y} text={northUp ? 'North-Up plan view: drop or import the route and drawings' : 'Plan view: drop or import the route (.dig, .dxf, .csv, .rlx) and drawings'} />
      <text className="hint" x={p.x + 3} y={p.y + p.h - 3} fontSize={fontSize(2)}>
        KP {tokens.KP_START}
      </text>
      <text className="hint" x={p.x + p.w - 3} y={p.y + p.h - 3} fontSize={fontSize(2)} textAnchor="end">
        KP {tokens.KP_END}
      </text>
    </g>
  );
}

function ProfilePlaceholder({ p, label }: { p: Panel; label: string }) {
  const ticks = [];
  const n = 10;
  for (let i = 1; i < n; i++) {
    const x = p.x + (p.w * i) / n;
    ticks.push(<line key={i} x1={x} y1={p.y} x2={x} y2={p.y + p.h} />);
  }
  return (
    <g>
      <g className="grid">{ticks}</g>
      <Hint p={p} top={p.y} text={label} />
    </g>
  );
}

function EventRows({ p, onRowDoubleClick }: Pick<Props, 'onRowDoubleClick'> & { p: Panel }) {
  const rows = p.rows ?? [];
  if (!rows.length) return <Hint p={p} top={p.y} text="No rows: right-click to add one" />;
  const rh = p.h / rows.length;
  const lw = p.labelWidth ?? 30;
  return (
    <g>
      <line className="frame-line" x1={p.x + lw} y1={p.y} x2={p.x + lw} y2={p.y + p.h} />
      {rows.map((r, i) => {
        const y = p.y + i * rh;
        const cap = Math.min(1.8, rh / 4);
        const lines = wrapLines(r.label, lw - 2, cap);
        const lh = fontSize(cap) * 1.15;
        return (
          <g
            key={r.id}
            className="event-row"
            data-row={r.id}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRowDoubleClick?.(p.id, r.id);
            }}
          >
            <rect className="row-hit" x={p.x} y={y} width={lw} height={rh} />
            {i > 0 && <line className="frame-line" x1={p.x} y1={y} x2={p.x + p.w} y2={y} />}
            <line className="row-axis" x1={p.x + lw + 2} y1={y + rh / 2} x2={p.x + p.w - 2} y2={y + rh / 2} />
            <text x={p.x + lw / 2} y={y + rh / 2 - ((lines.length - 1) * lh) / 2} fontSize={fontSize(cap)} textAnchor="middle" dominantBaseline="middle">
              {lines.map((l, j) => (
                <tspan key={j} x={p.x + lw / 2} dy={j === 0 ? 0 : lh}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Lays out a text column. Lines with a tab are "label<TAB>value" pairs and line up
 * on a shared tab stop, as in the geodetic parameters box; other lines wrap.
 */
function TextColumn({
  text,
  x,
  y,
  w,
  h,
  style,
  color,
  className,
}: {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: TextStyle;
  color?: string;
  className?: string;
}) {
  const cap = style.size;
  const fs = fontSize(cap);
  const lh = fs * 1.25;
  const align = style.align ?? 'start';
  const raw = text.split('\n');
  const labels = raw.filter((l) => l.includes('\t')).map((l) => l.split('\t')[0]);
  const tabX = labels.length ? Math.min(Math.max(...labels.map((l) => approxTextWidth(l, cap))) + 2, w * 0.6) : 0;
  const lines: Array<{ a: string; b?: string }> = [];
  for (const l of raw) {
    if (l.includes('\t')) {
      const [a, ...rest] = l.split('\t');
      lines.push({ a, b: rest.join(' ') });
    } else for (const wl of wrapLines(l, w, cap, !!style.bold)) lines.push({ a: wl });
  }
  const shown = lines.slice(0, Math.max(1, Math.floor(h / lh)));
  const blockH = shown.length * lh;
  const y0 = style.vcenter ? y + (h - blockH) / 2 + lh * 0.78 : y + lh * 0.9;
  const ax = align === 'middle' ? x + w / 2 : align === 'end' ? x + w : x;
  const textStyle = { fill: color, fontStyle: style.italic ? 'italic' : undefined } as React.CSSProperties;
  return (
    <text className={className} x={ax} y={y0} fontSize={fs} textAnchor={align} fontWeight={style.bold ? 'bold' : undefined} style={textStyle}>
      {shown.map((l, i) => (
        <tspan key={i}>
          <tspan x={l.b !== undefined ? x : ax} y={y0 + i * lh} textAnchor={l.b !== undefined ? 'start' : align}>
            {l.a || ' '}
          </tspan>
          {l.b !== undefined && (
            <tspan x={x + tabX} y={y0 + i * lh} textAnchor="start">
              {l.b}
            </tspan>
          )}
        </tspan>
      ))}
    </text>
  );
}

function BodyText({ p, top, tokens }: { p: Panel; top: number; tokens: Record<string, string> }) {
  const style = p.font ?? DEFAULT_BODY;
  const text = resolveTokens(p.body ?? '', tokens);
  const text2 = p.body2 !== undefined ? resolveTokens(p.body2, tokens) : undefined;
  const pad = 2;
  const colW = text2 !== undefined ? (p.w - 3 * pad) / 2 : p.w - 2 * pad;
  const h = p.y + p.h - top - 0.5;
  return (
    <g>
      {text && <TextColumn text={text} x={p.x + pad} y={top} w={colW} h={h} style={style} color={p.textColor} />}
      {text2 !== undefined && (
        <g data-body2="1">
          <rect className="row-hit" x={p.x + p.w / 2} y={top} width={p.w / 2} height={h} />
          {text2 ? (
            <TextColumn text={text2} x={p.x + 2 * pad + colW} y={top} w={colW} h={h} style={style} color={p.textColor} />
          ) : (
            <text className="hint" x={p.x + p.w * 0.75} y={top + h / 2} fontSize={fontSize(1.6)} textAnchor="middle">
              Double-click to add text
            </text>
          )}
        </g>
      )}
    </g>
  );
}

/** Horizontal and vertical scale bars, recomputed from the template's scales so they always match the panels. */
function ScaleBars({ p, top, template }: { p: Panel; top: number; template: ChartTemplate }) {
  const avail = p.w - 50;
  const rows = [
    { label: `VERTICAL SCALE ${formatScale(template.scale.verticalLong)}`, scale: template.scale.verticalLong },
    { label: `HORIZONTAL SCALE ${formatScale(template.scale.horizontal)}`, scale: template.scale.horizontal },
  ];
  const rowH = (p.y + p.h - top) / rows.length;
  return (
    <g>
      {rows.map((r, i) => {
        const bar = niceScaleBar(r.scale, avail);
        const x0 = p.x + (p.w - bar.paperMm) / 2;
        const yb = top + i * rowH + rowH * 0.62;
        const seg = bar.paperMm / bar.divisions;
        return (
          <g key={i}>
            <text x={p.x + p.w / 2} y={top + i * rowH + rowH * 0.3} fontSize={fontSize(1.6)} textAnchor="middle" fontWeight="bold">
              {r.label}
            </text>
            {Array.from({ length: bar.divisions }, (_, k) => (
              <rect key={k} className={k % 2 ? 'bar-light' : 'bar-dark'} x={x0 + k * seg} y={yb - 0.6} width={seg} height={1.2} />
            ))}
            {Array.from({ length: bar.divisions + 1 }, (_, k) => (
              <text key={`l${k}`} x={x0 + k * seg} y={yb + 3} fontSize={fontSize(1.3)} textAnchor="middle">
                {trim((bar.metres / bar.divisions) * k)}
              </text>
            ))}
            <text x={x0 + bar.paperMm + 3} y={yb + 0.6} fontSize={fontSize(1.3)}>
              Metres
            </text>
          </g>
        );
      })}
    </g>
  );
}

function trim(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/* ---------------- Legend ---------------- */

const LEFT_GROUPS: LegendGroup[] = ['plan'];
const RIGHT_GROUPS: LegendGroup[] = ['long', 'trans', 'cp'];

function Legend({ p, tokens }: { p: Panel; tokens: Record<string, string> }) {
  const items = p.legend ?? [];
  const pad = 2;
  const colW = (p.w - 3 * pad) / 2;
  const symW = Math.min(16, colW * 0.3);
  const labelCap = 1.45;
  const headCap = 1.9;

  function column(groups: LegendGroup[], x: number, y0: number) {
    const out: React.ReactNode[] = [];
    let y = y0;
    for (const g of groups) {
      const gi = items.filter((i) => i.group === g);
      if (!gi.length) continue;
      if (g !== 'status') {
        y += fontSize(headCap) * 1.2;
        out.push(
          <text key={`h${g}`} x={x} y={y} fontSize={fontSize(headCap)}>
            {LEGEND_GROUPS[g]}
          </text>,
        );
        y += 2;
      }
      for (const it of gi) {
        const lines = wrapLines(resolveTokens(it.label, tokens), colW - symW - 2, labelCap);
        const lh = fontSize(labelCap) * 1.15;
        const rowH = Math.max(it.symbol === 'kpMarker' || it.symbol === 'assetBlob' ? 7 : it.symbol === 'burial' || it.symbol === 'freespan' ? 6 : 4, lines.length * lh + 1);
        const cy = y + rowH / 2;
        out.push(
          <g key={it.id} data-legend={it.id}>
            <LegendSymbolView it={it} x={x} cy={cy} w={symW} tokens={tokens} />
            <text x={x + symW + 2} y={cy - ((lines.length - 1) * lh) / 2} fontSize={fontSize(labelCap)} dominantBaseline="middle">
              {lines.map((l, j) => (
                <tspan key={j} x={x + symW + 2} dy={j === 0 ? 0 : lh}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>,
        );
        y += rowH + 0.6;
      }
      y += 1.5;
    }
    return { nodes: out, bottom: y };
  }

  const left = column(LEFT_GROUPS, p.x + pad, p.y + 1);
  const right = column(RIGHT_GROUPS, p.x + 2 * pad + colW, p.y + 1);
  const codes = (p.eventCodes ?? '').trim();
  const codesTop = left.bottom + 1;
  const status = column(['status'], p.x + 2 * pad + colW, Math.max(right.bottom, codesTop + 4));
  return (
    <g>
      {left.nodes}
      {right.nodes}
      {codes && (
        <g data-codes="1">
          <text x={p.x + pad} y={codesTop + fontSize(headCap)} fontSize={fontSize(headCap)}>
            EVENT CODE DEFINITIONS:
          </text>
          <TextColumn text={codes} x={p.x + pad} y={codesTop + fontSize(headCap) + 0.5} w={colW + 10} h={p.y + p.h - codesTop - 4} style={{ size: 1.4 }} />
        </g>
      )}
      {status.nodes}
      {!items.length && !codes && <Hint p={p} top={p.y} text="Legend: add presets or your own items in Properties" />}
    </g>
  );
}

function LegendSymbolView({ it, x, cy, w, tokens }: { it: LegendItem; x: number; cy: number; w: number; tokens: Record<string, string> }) {
  const c = it.color;
  const st = (sw: number, dash?: string) => ({ stroke: c, strokeWidth: sw, strokeDasharray: dash, fill: 'none' });
  switch (it.symbol) {
    case 'kpMarker': {
      const cx = x + w / 2;
      const d = 2.2;
      return (
        <g>
          <line x1={x} y1={cy + 2.6} x2={x + w} y2={cy + 2.6} style={st(0.6)} />
          <line x1={cx} y1={cy + 0.6} x2={cx} y2={cy + 2.6} style={st(0.3)} />
          <path d={`M${cx} ${cy - 1 - d} L${cx + d} ${cy - 1} L${cx} ${cy - 1 + d} L${cx - d} ${cy - 1} Z`} style={st(0.35)} />
          <text x={cx} y={cy - 0.6} fontSize={fontSize(0.7)} textAnchor="middle" style={{ fill: c }}>
            {it.symbolText}
          </text>
        </g>
      );
    }
    case 'line':
      return <line x1={x} y1={cy} x2={x + w} y2={cy} style={st(0.6)} />;
    case 'thinLine':
      return <line x1={x} y1={cy} x2={x + w} y2={cy} style={st(0.2)} />;
    case 'dashed':
      return <line x1={x} y1={cy} x2={x + w} y2={cy} style={st(0.5, '2 1')} />;
    case 'dashedThick':
      return <line x1={x} y1={cy} x2={x + w} y2={cy} style={st(0.8, '2.4 1')} />;
    case 'doubleLine':
      return (
        <g>
          <line x1={x} y1={cy - 0.6} x2={x + w} y2={cy - 0.6} style={st(0.4)} />
          <line x1={x} y1={cy + 0.6} x2={x + w} y2={cy + 0.6} style={st(0.4)} />
        </g>
      );
    case 'matchline':
      return (
        <g>
          <line x1={x} y1={cy + 0.6} x2={x + w} y2={cy + 0.6} style={st(0.7, '1.6 0.8')} />
          <text x={x} y={cy - 0.3} fontSize={fontSize(0.6)} style={{ fill: c }}>
            {resolveTokens(it.symbolText ?? '', tokens)}
          </text>
        </g>
      );
    case 'assetBlob':
      return (
        <g>
          <line x1={x} y1={cy - 2.6} x2={x + w} y2={cy - 2.6} style={st(0.5)} />
          <circle cx={x + w * 0.3} cy={cy + 0.5} r={2} style={{ fill: c }} />
          <rect x={x + w * 0.55} y={cy - 1} width={3} height={3} transform={`rotate(-45 ${x + w * 0.55 + 1.5} ${cy + 0.5})`} style={{ fill: 'none', stroke: c, strokeWidth: 0.4 }} />
        </g>
      );
    case 'seabedProfile': {
      const pts = Array.from({ length: 9 }, (_, i) => `${x + (w * i) / 8},${cy + (i % 2 ? 0.25 : -0.25)}`).join(' ');
      return (
        <g>
          <polyline points={pts} style={st(0.35)} />
          <circle cx={x + w / 2} cy={cy} r={0.7} style={{ fill: 'none', stroke: '#e00000', strokeWidth: 0.35 }} />
        </g>
      );
    }
    case 'cpStab':
      return (
        <g>
          <circle cx={x + 1.2} cy={cy} r={0.9} style={{ fill: 'none', stroke: c, strokeWidth: 0.45 }} />
          <text x={x + 3} y={cy + 0.6} fontSize={fontSize(1.3)}>
            {it.symbolText}
          </text>
        </g>
      );
    case 'burial':
    case 'freespan': {
      const cx = x + w / 2;
      return (
        <g>
          <text x={cx} y={cy - 1.6} fontSize={fontSize(0.9)} textAnchor="middle" style={{ fill: c }}>
            {it.symbolText}
          </text>
          <path d={`M${cx - 1.2} ${cy - 1} L${cx - 1.2} ${cy + 1.6} M${cx + 1.2} ${cy - 1} L${cx + 1.2} ${cy + 1.6} M${cx - 1.2} ${cy + 0.3} L${cx + 1.2} ${cy + 0.3}`} style={st(it.symbol === 'burial' ? 0.7 : 0.5)} />
        </g>
      );
    }
    case 'box':
      return <rect x={x + w / 2 - 2} y={cy - 1.2} width={4} height={2.4} style={{ fill: c }} />;
    case 'circle':
      return <circle cx={x + w / 2} cy={cy} r={1.3} style={{ fill: 'none', stroke: c, strokeWidth: 0.4 }} />;
  }
}

/* ---------------- Title block ---------------- */

export const REV_COLUMNS: Array<{ key: RevisionColumn; label: string; w: number }> = [
  { key: 'rev', label: 'Rev', w: 0.1 },
  { key: 'date', label: 'Date', w: 0.14 },
  { key: 'desc', label: 'Description', w: 0.41 },
  { key: 'drawn', label: 'Drawn', w: 0.12 },
  { key: 'checked', label: 'Checked', w: 0.11 },
  { key: 'approved', label: 'Approved', w: 0.12 },
];

const UNITS = { rows: 10, header: 1.6, survey: 1.1, bottom: 2.4 };

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Revision rows in display order: blank rows on top, then the history newest first, as on the sample sheet. */
export function displayRevisions(rows: RevisionRow[]): RevisionRow[] {
  const filled = rows.filter((r) => !isBlank(r));
  const blank = rows.filter(isBlank);
  return [...blank, ...filled];
}

export const isBlank = (r: RevisionRow) => !(r.rev || r.date || r.desc || r.drawn || r.checked || r.approved);

/** Geometry shared by the drawing and the inline cell editor. */
export function titleBlockLayout(p: Panel) {
  const rows = displayRevisions(p.revisions ?? []);
  const total = Math.max(rows.length, 1) + UNITS.header + UNITS.survey + UNITS.bottom;
  const u = p.h / total;
  const colX: number[] = [];
  let cx = p.x;
  for (const c of REV_COLUMNS) {
    colX.push(cx);
    cx += c.w * p.w;
  }
  const cell = (rowIdx: number, col: number): CellRect => ({ x: colX[col], y: p.y + rowIdx * u, w: REV_COLUMNS[col].w * p.w, h: u });
  const headerY = p.y + rows.length * u;
  const surveyY = headerY + UNITS.header * u;
  const bottomY = surveyY + UNITS.survey * u;
  const surveySplit = p.x + p.w * 0.6;
  const bottomCols = [
    { key: 'CHART_NO', label: 'Drawing No.:', x: p.x, w: p.w * 0.5, editable: true },
    { key: 'REV', label: 'Rev:', x: p.x + p.w * 0.5, w: p.w * 0.1, editable: false },
    { key: 'PLOT_SIZE', label: 'Plot Size:', x: p.x + p.w * 0.6, w: p.w * 0.18, editable: true },
    { key: 'SHEET_NO', label: 'Sheet No:', x: p.x + p.w * 0.78, w: p.w * 0.22, editable: false },
  ];
  return {
    rows,
    u,
    cell,
    colX,
    headerY,
    surveyY,
    bottomY,
    surveySplit,
    bottomCols,
    surveyCells: [
      { key: 'SURVEY_DATE', label: 'Survey Date:', x: p.x, w: surveySplit - p.x },
      { key: 'SURVEY_VESSEL', label: 'Survey Vessel:', x: surveySplit, w: p.x + p.w - surveySplit },
    ],
  };
}

function TitleBlock({ p, tokens }: { p: Panel; tokens: Record<string, string> }) {
  const L = titleBlockLayout(p);
  const cap = Math.min(1.5, L.u * 0.45);
  const fs = fontSize(cap);
  const small = fontSize(Math.min(1.25, L.u * 0.38));
  const end = p.x + p.w;
  const bottomH = UNITS.bottom * L.u;
  return (
    <g>
      {L.rows.map((r, i) => (
        <g key={r.id}>
          <line className="frame-line thick" x1={p.x} y1={p.y + (i + 1) * L.u} x2={end} y2={p.y + (i + 1) * L.u} />
          {REV_COLUMNS.map((c, ci) => {
            const cr = L.cell(i, ci);
            return (
              <g key={c.key} data-rev={r.id} data-col={c.key} className="cell">
                <rect className="row-hit" x={cr.x} y={cr.y} width={cr.w} height={cr.h} />
                <text x={cr.x + cr.w / 2} y={cr.y + cr.h * 0.72} fontSize={fs} textAnchor="middle">
                  {r[c.key]}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {L.colX.slice(1).map((x, i) => (
        <line key={i} className="frame-line thick" x1={x} y1={p.y} x2={x} y2={L.surveyY} />
      ))}
      {REV_COLUMNS.map((c, ci) => (
        <text key={c.key} x={L.colX[ci] + (c.w * p.w) / 2} y={L.headerY + UNITS.header * L.u * 0.62} fontSize={fs} textAnchor="middle">
          {c.label}
        </text>
      ))}
      <line className="frame-line thick" x1={p.x} y1={L.surveyY} x2={end} y2={L.surveyY} />
      {L.surveyCells.map((c) => (
        <g key={c.key} data-field={c.key} className="cell">
          <rect className="row-hit" x={c.x} y={L.surveyY} width={c.w} height={UNITS.survey * L.u} />
          <text x={c.x + 1.5} y={L.surveyY + UNITS.survey * L.u * 0.68} fontSize={fs}>
            {c.label} {tokens[c.key] ?? ''}
          </text>
        </g>
      ))}
      <line className="frame-line thick" x1={L.surveySplit} y1={L.surveyY} x2={L.surveySplit} y2={L.bottomY} />
      <line className="frame-line thick" x1={p.x} y1={L.bottomY} x2={end} y2={L.bottomY} />
      {L.bottomCols.map((c, i) => {
        const value = c.key === 'SHEET_NO' ? `${tokens.SHEET} of ${tokens.NUM_CHARTS}` : (tokens[c.key] ?? '');
        const big = fontSize(Math.min(c.key === 'CHART_NO' ? 2.3 : 3, bottomH * 0.32));
        return (
          <g key={c.key} data-field={c.editable ? c.key : undefined} className={c.editable ? 'cell' : undefined}>
            {c.editable && <rect className="row-hit" x={c.x} y={L.bottomY} width={c.w} height={bottomH} />}
            {i > 0 && <line className="frame-line thick" x1={c.x} y1={L.bottomY} x2={c.x} y2={p.y + p.h} />}
            <text x={c.x + 1.5} y={L.bottomY + small + 0.6} fontSize={small}>
              {c.label}
            </text>
            <text
              x={c.key === 'SHEET_NO' ? c.x + c.w - 2 : c.key === 'CHART_NO' ? c.x + 2 : c.x + c.w / 2}
              y={L.bottomY + bottomH * 0.82}
              fontSize={big}
              textAnchor={c.key === 'SHEET_NO' ? 'end' : c.key === 'CHART_NO' ? 'start' : 'middle'}
            >
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
}
