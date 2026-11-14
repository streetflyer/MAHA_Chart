/** AutoCAD colour index (ACI) to RGB, and the DXF colour rules the readers share. */
export const ACI: [number, number, number][] = (() => {
  const t: [number, number, number][] = [[0, 0, 0]];
  const base: [number, number, number][] = [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
    [255, 255, 255],
    [128, 128, 128],
    [192, 192, 192],
  ];
  t.push(...base);
  const levels = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
  for (let i = 10; i < 250; i++) {
    const hue = ((i - 10) / 10) | 0; // 24 hues, 15° apart
    const v = (i - 10) % 10;
    const h = hue * 15;
    const f = (n: number) => {
      const k = (n + h / 60) % 6;
      return 1 - Math.max(0, Math.min(k, 4 - k, 1));
    };
    let rgb = [f(5), f(3), f(1)];
    if (v % 2 === 1) rgb = rgb.map((c) => c + (1 - c) * 0.5);
    t.push(rgb.map((c) => Math.round(c * 255 * levels[v])) as [number, number, number]);
  }
  for (const g of [51, 80, 105, 130, 190, 255]) t.push([g, g, g]);
  return t;
})();

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
export const rgbHex = (r: number, g: number, b: number) => '#' + hex2(r) + hex2(g) + hex2(b);

/** '#rrggbb' of an ACI number. 7 (white/black) is black: sheets are white. */
export function aciHex(i: number): string {
  if (i === 7) return '#000000';
  const c = ACI[i];
  return c ? rgbHex(c[0], c[1], c[2]) : '';
}

/** '#rrggbb' of a 24-bit true colour (DXF group 420: 0xRRGGBB). */
export const trueHex = (v: number) => rgbHex((v >> 16) & 255, (v >> 8) & 255, v & 255);
