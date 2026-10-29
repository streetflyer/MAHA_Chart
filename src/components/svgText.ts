/** CAD text height is the cap height; an SVG font-size is the em box. */
export const fontSize = (capHeightMm: number) => capHeightMm / 0.7;

/** Rough average glyph width for wrapping, as a fraction of the font size. */
const CHAR_W = 0.55;

export function wrapLines(text: string, widthMm: number, capHeightMm: number): string[] {
  const maxChars = Math.max(4, Math.floor(widthMm / (fontSize(capHeightMm) * CHAR_W)));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
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
