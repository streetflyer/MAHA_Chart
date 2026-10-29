const MAX_PX = 900;

/**
 * Read an image file into a data URL, scaled down so a logo doesn't bloat the
 * saved template. Returns the pixel size so the caller can keep the aspect ratio.
 */
export async function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  const original = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(`${file.name} is not an image the browser can open.`));
    i.src = original;
  });
  const w = img.naturalWidth || 300;
  const h = img.naturalHeight || 150;
  // SVG logos stay vector; raster images are reduced to MAX_PX on the long side.
  if (file.type === 'image/svg+xml' || Math.max(w, h) <= MAX_PX) return { src: original, width: w, height: h };
  const k = MAX_PX / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return { src: canvas.toDataURL(type, 0.9), width: canvas.width, height: canvas.height };
}

/** Fit a w x h image inside a box, centred, keeping its aspect ratio. */
export function fitInto(w: number, h: number, box: { x: number; y: number; w: number; h: number }) {
  const k = Math.min(box.w / w, box.h / h);
  const fw = w * k;
  const fh = h * k;
  return { x: box.x + (box.w - fw) / 2, y: box.y + (box.h - fh) / 2, w: fw, h: fh };
}
