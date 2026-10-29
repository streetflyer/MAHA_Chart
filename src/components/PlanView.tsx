import { useMemo } from 'react';
import { chartGeometry, gridToPlan, type Bounds } from '../model/route';
import type { ChartTemplate, Panel } from '../model/types';
import { useSurvey } from '../state/surveyData';
import { linesPath, routePath } from './linework';
import { fontSize } from './svgText';

/**
 * The plan view for one chart: background DXF and the survey line, turned so the
 * line runs left to right (alignment sheets) or kept north-up.
 */
export function PlanView({ p, template, sheetIndex, tokens }: { p: Panel; template: ChartTemplate; sheetIndex: number; tokens: Record<string, string> }) {
  const route = useSurvey((s) => s.route);
  const background = useSurvey((s) => s.background);
  const geo = useMemo(() => (route ? chartGeometry(template, route, sheetIndex) : null), [route, template, sheetIndex]);

  const paths = useMemo(() => {
    const rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    if (!geo) {
      // No route yet: show the background around its middle at the chart scale.
      if (!background) return null;
      const b = background.bounds;
      const along = (p.w * template.scale.horizontal) / 1000;
      const g = { origin: [(b.minE + b.maxE) / 2 - along / 2, (b.minN + b.maxN) / 2] as [number, number], u: [1, 0] as [number, number], along, across: (p.h * template.scale.horizontal) / 1000, northUp: true };
      const project = gridToPlan(g, rect);
      return { bg: linesPath(background.lines, frameBounds(g), project, 0.05), route: '' };
    }
    const project = gridToPlan(geo, rect);
    return {
      bg: background ? linesPath(background.lines, frameBounds(geo), project, 0.05) : '',
      route: route ? routePath(route, project, 0.05) : '',
    };
  }, [geo, background, route, p.x, p.y, p.w, p.h, template.scale.horizontal]);

  if (!paths) return null;
  const clipId = `plan-clip-${p.id}`;
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {paths.bg && <path d={paths.bg} fill="none" stroke="#8a8a8a" strokeWidth={0.18} />}
        {paths.route && <path d={paths.route} fill="none" stroke="#e00000" strokeWidth={0.5} strokeLinejoin="round" />}
      </g>
      <text className="hint" x={p.x + 3} y={p.y + p.h - 3} fontSize={fontSize(2)}>
        KP {tokens.KP_START}
      </text>
      <text className="hint" x={p.x + p.w - 3} y={p.y + p.h - 3} fontSize={fontSize(2)} textAnchor="end">
        KP {tokens.KP_END}
      </text>
    </g>
  );
}

/** Grid box around a chart's frame, for skipping background lines that can't show. */
function frameBounds(g: { origin: [number, number]; u: [number, number]; along: number; across: number }): Bounds {
  const [ox, oy] = g.origin;
  const [ux, uy] = g.u;
  const h = g.across / 2;
  const xs = [ox - uy * h, ox + uy * h, ox + ux * g.along - uy * h, ox + ux * g.along + uy * h];
  const ys = [oy + ux * h, oy - ux * h, oy + uy * g.along + ux * h, oy + uy * g.along - ux * h];
  return { minE: Math.min(...xs), maxE: Math.max(...xs), minN: Math.min(...ys), maxN: Math.max(...ys) };
}
