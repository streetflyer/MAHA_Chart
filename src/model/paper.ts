import type { ChartTemplate, PaperSizeName } from './types';

/** ISO 216 sizes in millimetres, landscape (width >= height). */
export const PAPER_SIZES: Record<Exclude<PaperSizeName, 'Custom'>, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
};

export function paperDimensions(size: PaperSizeName, orientation: 'landscape' | 'portrait', custom?: [number, number]): [number, number] {
  const [a, b] = size === 'Custom' ? (custom ?? [841, 594]) : PAPER_SIZES[size];
  const long = Math.max(a, b);
  const short = Math.min(a, b);
  return orientation === 'landscape' ? [long, short] : [short, long];
}

/**
 * Resize a template to a new paper size. Panels and text keep their relative
 * position; text height follows the smaller of the two ratios so it never overflows.
 */
export function resizePaper(t: ChartTemplate, width: number, height: number): ChartTemplate {
  const sx = width / t.paper.width;
  const sy = height / t.paper.height;
  const st = Math.min(sx, sy);
  return {
    ...t,
    paper: { ...t.paper, width, height, frameInset: t.paper.frameInset * st },
    panels: t.panels.map((p) => ({
      ...p,
      x: p.x * sx,
      y: p.y * sy,
      w: p.w * sx,
      h: p.h * sy,
      labelWidth: p.labelWidth !== undefined ? p.labelWidth * sx : undefined,
    })),
    texts: t.texts.map((tx) => ({
      ...tx,
      x: tx.x * sx,
      y: tx.y * sy,
      size: tx.size * st,
    })),
  };
}
