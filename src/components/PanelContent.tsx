import { formatScale, niceScaleBar, resolveTokens } from '../model/scale';
import type { ChartTemplate, Panel } from '../model/types';
import { fontSize, wrapLines } from './svgText';

interface Props {
  panel: Panel;
  template: ChartTemplate;
  tokens: Record<string, string>;
  onRowDoubleClick?: (panelId: string, rowId: string) => void;
  onRowContextMenu?: (e: React.MouseEvent, panelId: string, rowId: string) => void;
}

const TITLE_INSIDE_H = 5;

/** Everything drawn inside a panel's frame. Data drawing arrives in plan step 3; for now each panel shows its layout. */
export function PanelContent({ panel: p, template, tokens, onRowDoubleClick, onRowContextMenu }: Props) {
  const top = p.titlePosition === 'inside' ? p.y + TITLE_INSIDE_H : p.y;
  switch (p.type) {
    case 'plan':
      return <PlanPlaceholder p={p} northUp={template.kind === 'northUp'} />;
    case 'longProfile':
    case 'transProfile':
    case 'cp':
      return <ProfilePlaceholder p={p} label={dropHint(p)} />;
    case 'events':
      return <EventRows p={p} onRowDoubleClick={onRowDoubleClick} onRowContextMenu={onRowContextMenu} />;
    case 'scale':
      return <ScaleBars p={p} top={top} template={template} />;
    case 'titleBlock':
      return <TitleBlock p={p} tokens={tokens} />;
    case 'keyplan':
      return <Hint p={p} top={top} text="Key plan: route + background DXF" />;
    case 'logo':
      return <Hint p={p} top={top} text="Drop logo image" />;
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

function PlanPlaceholder({ p, northUp }: { p: Panel; northUp: boolean }) {
  const lines = [];
  const step = 20;
  for (let x = p.x + step; x < p.x + p.w; x += step) lines.push(<line key={`x${x}`} x1={x} y1={p.y} x2={x} y2={p.y + p.h} />);
  for (let y = p.y + step; y < p.y + p.h; y += step) lines.push(<line key={`y${y}`} x1={p.x} y1={y} x2={p.x + p.w} y2={y} />);
  return (
    <g>
      <g className="grid">{lines}</g>
      <Hint p={p} top={p.y} text={northUp ? 'North-Up plan view: drop route (.dig, .dxf, .csv)' : 'Plan view: drop route (.dig, .dxf, .xyz, .csv) and background DXF'} />
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

function EventRows({ p, onRowDoubleClick, onRowContextMenu }: Pick<Props, 'onRowDoubleClick' | 'onRowContextMenu'> & { p: Panel }) {
  const rows = p.rows ?? [];
  if (!rows.length) return <Hint p={p} top={p.y} text="No rows: right-click to add one" />;
  const rh = p.h / rows.length;
  const lw = p.labelWidth ?? 30;
  return (
    <g>
      <line className="frame-line" x1={p.x + lw} y1={p.y} x2={p.x + lw} y2={p.y + p.h} />
      {rows.map((r, i) => {
        const y = p.y + i * rh;
        const lines = wrapLines(r.label, lw - 2, Math.min(1.8, rh / 4));
        const cap = Math.min(1.8, rh / 4);
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
            onContextMenu={(e) => onRowContextMenu?.(e, p.id, r.id)}
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

function BodyText({ p, top, tokens }: { p: Panel; top: number; tokens: Record<string, string> }) {
  const text = resolveTokens(p.body ?? '', tokens);
  if (!text) return null;
  const centered = p.type === 'text' && p.titlePosition === 'none';
  const cap = centered ? Math.min(2.5, (p.h - 2) / 2) : 1.8;
  const lines = wrapLines(text, p.w - 4, cap);
  const lh = fontSize(cap) * 1.25;
  const available = p.y + p.h - top - 1;
  const shown = lines.slice(0, Math.max(1, Math.floor(available / lh)));
  if (centered) {
    const y0 = top + (p.y + p.h - top) / 2 - ((shown.length - 1) * lh) / 2;
    return (
      <text className={p.fill ? 'on-fill' : undefined} x={p.x + p.w / 2} y={y0} fontSize={fontSize(cap)} textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
        {shown.map((l, i) => (
          <tspan key={i} x={p.x + p.w / 2} dy={i === 0 ? 0 : lh}>
            {l}
          </tspan>
        ))}
      </text>
    );
  }
  return (
    <text x={p.x + 2} y={top + lh} fontSize={fontSize(cap)}>
      {shown.map((l, i) => (
        <tspan key={i} x={p.x + 2} dy={i === 0 ? 0 : lh}>
          {l || ' '}
        </tspan>
      ))}
    </text>
  );
}

/** Horizontal and vertical scale bars, recomputed from the template's scales so they always match the panels. */
function ScaleBars({ p, top, template }: { p: Panel; top: number; template: ChartTemplate }) {
  const avail = p.w - 50;
  const rows = [
    { label: `HORIZONTAL SCALE ${formatScale(template.scale.horizontal)}`, scale: template.scale.horizontal },
    { label: `VERTICAL SCALE ${formatScale(template.scale.verticalLong)}`, scale: template.scale.verticalLong },
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

function TitleBlock({ p, tokens }: { p: Panel; tokens: Record<string, string> }) {
  const cols = [
    { k: 'REV', w: 0.1 },
    { k: 'DATE', w: 0.16 },
    { k: 'DESCRIPTION', w: 0.38 },
    { k: 'DRN', w: 0.12 },
    { k: 'CHKD', w: 0.12 },
    { k: 'APPR', w: 0.12 },
  ];
  const header = p.h * 0.18;
  const footer = p.h * 0.22;
  const bodyRows = 3;
  const rowH = (p.h - header - footer) / (bodyRows + 1);
  let cx = p.x;
  const values: Record<string, string> = {
    REV: tokens.REV ?? '',
    DATE: tokens.DATE ?? '',
    DESCRIPTION: tokens.STATUS ?? '',
    DRN: tokens.DRN_BY ?? '',
    CHKD: tokens.CHKD_BY ?? '',
    APPR: tokens.APPR_BY ?? '',
  };
  const fy = p.y + p.h - footer;
  return (
    <g>
      <line className="frame-line" x1={p.x} y1={p.y + header} x2={p.x + p.w} y2={p.y + header} />
      <text x={p.x + 2} y={p.y + header * 0.65} fontSize={fontSize(1.6)} fontWeight="bold">
        KP {tokens.KP_START} to KP {tokens.KP_END}
      </text>
      {cols.map((c) => {
        const x = cx;
        const w = c.w * p.w;
        cx += w;
        return (
          <g key={c.k}>
            {x > p.x && <line className="frame-line" x1={x} y1={p.y + header} x2={x} y2={fy} />}
            <text x={x + w / 2} y={fy - rowH * 0.35} fontSize={fontSize(1.2)} textAnchor="middle" fontWeight="bold">
              {c.k}
            </text>
            <text x={x + w / 2} y={fy - rowH * 1.35} fontSize={fontSize(1.2)} textAnchor="middle">
              {values[c.k]}
            </text>
          </g>
        );
      })}
      {Array.from({ length: bodyRows }, (_, i) => (
        <line key={i} className="frame-line thin" x1={p.x} y1={p.y + header + (i + 1) * rowH} x2={p.x + p.w} y2={p.y + header + (i + 1) * rowH} />
      ))}
      <line className="frame-line" x1={p.x} y1={fy} x2={p.x + p.w} y2={fy} />
      <line className="frame-line" x1={p.x + p.w * 0.6} y1={fy} x2={p.x + p.w * 0.6} y2={p.y + p.h} />
      <line className="frame-line" x1={p.x + p.w * 0.75} y1={fy} x2={p.x + p.w * 0.75} y2={p.y + p.h} />
      <text x={p.x + 2} y={fy + footer * 0.62} fontSize={fontSize(1.5)}>
        {tokens.CHART_NO}
      </text>
      <text x={p.x + p.w * 0.675} y={fy + footer * 0.62} fontSize={fontSize(1.5)} textAnchor="middle">
        {tokens.REV}
      </text>
      <text x={p.x + p.w * 0.875} y={fy + footer * 0.62} fontSize={fontSize(1.5)} textAnchor="middle">
        {tokens.SHEET} of {tokens.NUM_CHARTS}
      </text>
    </g>
  );
}
