/** CAD text height is the cap height; an SVG font-size is the em box. */
export const fontSize = (capHeightMm: number) => capHeightMm / 0.7;

/** Rough average glyph width for wrapping, as a fraction of the font size. */
const CHAR_W = 0.55;

let ctx: CanvasRenderingContext2D | null | undefined;

/** Width of a string in mm, measured with a canvas when one is available (bold capitals are much wider than average). */
export function measureText(text: string, capHeightMm: number, bold = false, family = 'Arial'): number {
  if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return approxTextWidth(text, capHeightMm) * (bold ? 1.1 : 1);
  ctx.font = `${bold ? 'bold ' : ''}100px ${family}, Arial, Helvetica, sans-serif`;
  return (ctx.measureText(text).width / 100) * fontSize(capHeightMm);
}

export function wrapLines(text: string, widthMm: number, capHeightMm: number, bold = false): string[] {
  const fits = (s: string) => measureText(s, capHeightMm, bold) <= widthMm;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!line) line = word;
      else if (fits(line + ' ' + word)) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export function approxTextWidth(text: string, capHeightMm: number): number {
  return text.length * fontSize(capHeightMm) * CHAR_W;
}
