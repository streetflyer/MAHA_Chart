import { useEffect, useState } from "react";
import { create } from "zustand";
import type { ImageItem } from "../model/types";

/** The image being cropped (its handles crop instead of resize), like Word's Crop button. */
export const useImageCrop = create<{ id: string | null }>(() => ({ id: null }));

export const DEFAULT_TRANSPARENT = { tolerance: 12 };

const cache = new Map<string, string>();

function keyOf(im: ImageItem) {
  const c = im.crop;
  const t = im.transparent;
  return `${im.src.length}:${im.src.slice(-40)}|${c ? [c.l, c.t, c.r, c.b].join(",") : ""}|${t ? `${t.color ?? "auto"},${t.tolerance}` : ""}`;
}

/** Hex colour of the picture's top-left pixel: what "auto" makes see-through. */
function hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The picture as shown: cropped, and with its background colour made see-through. */
export async function processImage(im: ImageItem): Promise<string> {
  if (!im.crop && !im.transparent) return im.src;
  const key = keyOf(im);
  const hit = cache.get(key);
  if (hit) return hit;
  const img = new Image();
  img.src = im.src;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = im.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const sx = Math.round(W * c.l);
  const sy = Math.round(H * c.t);
  const sw = Math.max(1, Math.round(W * (1 - c.l - c.r)));
  const sh = Math.max(1, Math.round(H * (1 - c.t - c.b)));
  const cv = document.createElement("canvas");
  cv.width = sw;
  cv.height = sh;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (im.transparent) {
    const data = ctx.getImageData(0, 0, sw, sh);
    const p = data.data;
    let tr: number, tg: number, tb: number;
    const col = im.transparent.color;
    if (col && /^#[0-9a-f]{6}$/i.test(col)) {
      tr = parseInt(col.slice(1, 3), 16);
      tg = parseInt(col.slice(3, 5), 16);
      tb = parseInt(col.slice(5, 7), 16);
    } else [tr, tg, tb] = [p[0], p[1], p[2]];
    const tol =
      (Math.max(0, Math.min(100, im.transparent.tolerance)) / 100) * 441;
    for (let i = 0; i < p.length; i += 4) {
      const d = Math.hypot(p[i] - tr, p[i + 1] - tg, p[i + 2] - tb);
      if (d <= tol) p[i + 3] = 0;
      // A soft edge just outside the tolerance, so the outline isn't jagged.
      else if (d <= tol * 1.5 && tol > 0)
        p[i + 3] = Math.min(
          p[i + 3],
          Math.round((255 * (d - tol)) / (tol * 0.5)),
        );
    }
    ctx.putImageData(data, 0, 0);
  }
  const url = cv.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** The colour "auto" would make see-through (the picture's corner). */
export async function cornerColour(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return hex(r, g, b);
}

/** The data URL to draw for an image (the original until the cropped one is ready). */
export function useShownSrc(im: ImageItem): string {
  const [src, setSrc] = useState(() => cache.get(keyOf(im)) ?? im.src);
  const key = keyOf(im);
  useEffect(() => {
    let live = true;
    processImage(im).then(
      (u) => live && setSrc(u),
      () => live && setSrc(im.src),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return src;
}
