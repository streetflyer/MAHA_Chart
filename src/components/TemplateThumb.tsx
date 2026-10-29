import type { ChartTemplate } from '../model/types';

/** Small wireframe preview of a template's panels for the start page. */
export function TemplateThumb({ t }: { t: ChartTemplate }) {
  return (
    <svg className="thumb" viewBox={`0 0 ${t.paper.width} ${t.paper.height}`} preserveAspectRatio="xMidYMid meet">
      <rect className="paper" x={0} y={0} width={t.paper.width} height={t.paper.height} />
      {t.panels
        .filter((p) => p.type !== 'chartInfo')
        .map((p) => (
          <rect key={p.id} className={`thumb-panel type-${p.type}`} x={p.x} y={p.y} width={p.w} height={p.h} style={p.fill ? { fill: p.fill } : undefined} />
        ))}
    </svg>
  );
}
