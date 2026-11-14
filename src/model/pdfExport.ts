/**
 * Save the chart as a PDF, one page per chart, at the paper size. Like the DXF it is
 * written from the drawn sheet itself: every line, curve, filled shape and text on
 * screen goes into the page as vector drawing (text in the standard Helvetica, Times
 * or Courier), clipped to its panel, with logos as pictures.
 */

import { flattenPath } from "./dxfExport";

type Pt = [number, number];
type RGB = [number, number, number];

const PT = 72 / 25.4;
const SKIP = [
  "sel-outline",
  "handle",
  "edge-hit",
  "text-hit",
  "row-hit",
  "guide",
  "marquee",
  "hint",
];

const enc = new TextEncoder();
const num = (v: number) =>
  Math.abs(v) < 1e-6 ? "0" : String(Math.round(v * 1000) / 1000);

function parseColour(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** Base-14 font for a CSS family and style, e.g. Helvetica-BoldOblique. */
function pdfFont(family: string, bold: boolean, italic: boolean): string {
  const f = family.toLowerCase();
  if (/courier|consolas|mono/.test(f))
    return (
      "Courier" +
      (bold || italic
        ? "-" + (bold ? "Bold" : "") + (italic ? "Oblique" : "")
        : "")
    );
  if (/times|georgia|serif|cambria|garamond/.test(f) && !/sans/.test(f))
    return bold || italic
      ? "Times-" + (bold && italic ? "BoldItalic" : bold ? "Bold" : "Italic")
      : "Times-Roman";
  return (
    "Helvetica" +
    (bold || italic
      ? "-" + (bold ? "Bold" : "") + (italic ? "Oblique" : "")
      : "")
  );
}

/** Text as a PDF string in WinAnsi; what it cannot show becomes "?". */
function pdfString(s: string): string {
  let out = "";
  for (const ch of s.replace(/\s+/g, " ")) {
    const c = ch.codePointAt(0)!;
    const win: Record<number, number> = {
      0x20ac: 128,
      0x2018: 145,
      0x2019: 146,
      0x201c: 147,
      0x201d: 148,
      0x2022: 149,
      0x2013: 150,
      0x2014: 151,
      0x2122: 153,
    };
    const code = c < 256 ? c : (win[c] ?? 63);
    out +=
      code === 40 || code === 41 || code === 92
        ? "\\" + ch
        : code < 32 || code > 126
          ? "\\" + code.toString(8).padStart(3, "0")
          : String.fromCharCode(code);
  }
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A logo as JPEG bytes on white, with its pixel size. */
async function imageData(
  src: string,
): Promise<{ jpg: Uint8Array; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const k = Math.min(1, 2000 / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * k));
    cv.height = Math.max(1, Math.round(h * k));
    const cx = cv.getContext("2d")!;
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    const b64 = cv.toDataURL("image/jpeg", 0.92).split(",")[1];
    const bin = atob(b64);
    const jpg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);
    return { jpg, w: cv.width, h: cv.height };
  } catch {
    return null;
  }
}

interface Page {
  content: string[];
  fonts: Set<string>;
  images: Map<string, number>;
  alphas: Map<string, number>;
}

/** Draw one sheet (svg.sheet) into a page's content stream; root units are mm, y down. */
async function drawSheet(
  svg: SVGSVGElement,
  pg: Page,
  imgs: Map<string, { jpg: Uint8Array; w: number; h: number } | null>,
) {
  const rootInv = svg.getScreenCTM()?.inverse();
  if (!rootInv) return;
  const out = pg.content;
  const toRoot = (el: SVGGraphicsElement) =>
    rootInv.multiply(el.getScreenCTM()!);
  const clipCache = new Map<Element, string | null>();
  const clipFor = (el: Element): string | null => {
    const owner = el.closest("[clip-path]");
    if (!owner) return null;
    if (clipCache.has(owner)) return clipCache.get(owner)!;
    const id = owner.getAttribute("clip-path")!.match(/#([^)"']+)/)?.[1];
    const rect = id
      ? (svg.querySelector(`#${CSS.escape(id)} rect`) as SVGRectElement | null)
      : null;
    let c: string | null = null;
    if (rect) {
      const m = toRoot(owner as SVGGraphicsElement);
      const x = rect.x.baseVal.value;
      const y = rect.y.baseVal.value;
      const ps = [
        [x, y],
        [x + rect.width.baseVal.value, y + rect.height.baseVal.value],
      ].map(([px, py]) => new DOMPoint(px, py).matrixTransform(m));
      c = `${num(Math.min(ps[0].x, ps[1].x))} ${num(Math.min(ps[0].y, ps[1].y))} ${num(Math.abs(ps[1].x - ps[0].x))} ${num(Math.abs(ps[1].y - ps[0].y))} re W n`;
    }
    clipCache.set(owner, c);
    return c;
  };
  const colour = (
    cs: CSSStyleDeclaration,
    prop: "stroke" | "fill",
  ): { rgb: RGB; a: number } | null => {
    const v = cs[prop];
    if (!v || v === "none") return null;
    const c = parseColour(v);
    if (!c || c[3] < 0.02) return null;
    const a =
      c[3] *
      parseFloat(cs.opacity || "1") *
      parseFloat((prop === "fill" ? cs.fillOpacity : cs.strokeOpacity) || "1");
    if (a < 0.02) return null;
    return { rgb: [c[0] / 255, c[1] / 255, c[2] / 255], a };
  };
  const alpha = (a: number) => {
    if (a >= 0.995) return "";
    const key = a.toFixed(2);
    if (!pg.alphas.has(key)) pg.alphas.set(key, pg.alphas.size);
    return `/A${pg.alphas.get(key)} gs`;
  };
  const rgbOp = (c: RGB, op: "rg" | "RG") =>
    `${num(c[0])} ${num(c[1])} ${num(c[2])} ${op}`;

  for (const el of svg.querySelectorAll(
    "line, polyline, polygon, rect, circle, ellipse, path, text, image",
  )) {
    if (el.closest("defs, clipPath, mask, pattern, marker")) continue;
    if (
      SKIP.some((c) => el.classList.contains(c)) ||
      el.closest(".sel-outline, .handle, [data-edge], [data-img-handle]")
    )
      continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let hidden = false;
    for (let a: Element | null = el; a && a !== svg; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.display === "none" || parseFloat(as.opacity || "1") < 0.02) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    const g = el as SVGGraphicsElement;
    const m = toRoot(g);
    const P = (x: number, y: number): Pt => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return [p.x, p.y];
    };
    const scale = Math.hypot(m.a, m.b);
    const clip = clipFor(el);
    const stroke = colour(cs, "stroke");
    const fill = colour(cs, "fill");
    const ops: string[] = [];

    if (el.tagName === "image") {
      const href = el.getAttribute("href") ?? "";
      const im = imgs.get(href);
      if (!im) continue;
      if (!pg.images.has(href)) pg.images.set(href, pg.images.size);
      const x = (el as SVGImageElement).x.baseVal.value;
      const y = (el as SVGImageElement).y.baseVal.value;
      const w = (el as SVGImageElement).width.baseVal.value;
      const h = (el as SVGImageElement).height.baseVal.value;
      const fit = Math.min(w / im.w, h / im.h);
      const iw = im.w * fit;
      const ih = im.h * fit;
      const [x0, y0] = [x + (w - iw) / 2, y + (h - ih) / 2];
      const o = P(x0, y0 + ih); // bottom-left of the picture, in root space
      const ex = P(x0 + iw, y0 + ih);
      const up = P(x0, y0);
      out.push(
        `q ${clip ? clip + " " : ""}${num(ex[0] - o[0])} ${num(ex[1] - o[1])} ${num(up[0] - o[0])} ${num(up[1] - o[1])} ${num(o[0])} ${num(o[1])} cm /Im${pg.images.get(href)} Do Q`,
      );
      continue;
    }

    if (el.tagName === "text") {
      if (!fill) continue;
      const parts: SVGTextContentElement[] = (() => {
        const ts = [...el.querySelectorAll("tspan")].filter(
          (t) =>
            t.hasAttribute("x") || t.hasAttribute("dy") || t.hasAttribute("y"),
        );
        return ts.length ? ts : [el as SVGTextContentElement];
      })();
      const th = Math.atan2(m.b, m.a);
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      for (const t of parts) {
        const s = (t.textContent ?? "").trim();
        if (!s || !t.getNumberOfChars()) continue;
        let p0: DOMPoint;
        try {
          p0 = t.getStartPositionOfChar(0);
        } catch {
          continue;
        }
        const p = new DOMPoint(p0.x, p0.y).matrixTransform(m);
        const ts = getComputedStyle(t);
        const fs = (parseFloat(ts.fontSize) || 1) * scale;
        const font = pdfFont(
          ts.fontFamily,
          Number(ts.fontWeight) >= 600 || ts.fontWeight === "bold",
          ts.fontStyle === "italic" || ts.fontStyle === "oblique",
        );
        pg.fonts.add(font);
        let adv = 0;
        try {
          adv = t.getComputedTextLength() * scale;
        } catch {
          /* width is only used to fit the text */
        }
        // Helvetica is metric-compatible with Arial; other faces get squeezed to the width the browser gave.
        let sq = "";
        if (adv > 0) {
          const w = approxWidth(s, font, fs);
          if (w > 0 && Math.abs(adv / w - 1) > 0.04)
            sq = `${num(Math.min(150, Math.max(60, (adv / w) * 100)))} Tz `;
        }
        ops.push(
          `q${clip ? " " + clip : ""} ${alpha(fill.a)} ${rgbOp(fill.rgb, "rg")} BT /${fontKey(font)} ${num(fs)} Tf ${sq}${num(cos)} ${num(sin)} ${num(sin)} ${num(-cos)} ${num(p.x)} ${num(p.y)} Tm (${pdfString(s)}) Tj ET Q`,
        );
      }
      out.push(...ops);
      continue;
    }

    const shapes: { pts: Pt[]; closed: boolean }[] = [];
    switch (el.tagName) {
      case "line": {
        const l = el as SVGLineElement;
        shapes.push({
          pts: [
            P(l.x1.baseVal.value, l.y1.baseVal.value),
            P(l.x2.baseVal.value, l.y2.baseVal.value),
          ],
          closed: false,
        });
        break;
      }
      case "polyline":
      case "polygon": {
        const pl = el as SVGPolylineElement;
        shapes.push({
          pts: [...pl.points].map((p) => P(p.x, p.y)),
          closed: el.tagName === "polygon",
        });
        break;
      }
      case "rect": {
        const r = el as SVGRectElement;
        const x = r.x.baseVal.value;
        const y = r.y.baseVal.value;
        const rw = r.width.baseVal.value;
        const rh = r.height.baseVal.value;
        if (!rw || !rh) continue;
        shapes.push({
          pts: [P(x, y), P(x + rw, y), P(x + rw, y + rh), P(x, y + rh)],
          closed: true,
        });
        break;
      }
      case "circle":
      case "ellipse": {
        const c = el as SVGCircleElement & SVGEllipseElement;
        const rx =
          el.tagName === "circle" ? c.r.baseVal.value : c.rx.baseVal.value;
        const ry =
          el.tagName === "circle" ? c.r.baseVal.value : c.ry.baseVal.value;
        if (!rx || !ry) continue;
        const pts: Pt[] = [];
        for (let k = 0; k < 48; k++)
          pts.push(
            P(
              c.cx.baseVal.value + rx * Math.cos((k / 48) * 2 * Math.PI),
              c.cy.baseVal.value + ry * Math.sin((k / 48) * 2 * Math.PI),
            ),
          );
        shapes.push({ pts, closed: true });
        break;
      }
      case "path": {
        const d = el.getAttribute("d");
        if (!d) continue;
        for (const sp of flattenPath(d))
          shapes.push({
            pts: sp.pts.map(([x, y]) => P(x, y)),
            closed: sp.closed,
          });
        break;
      }
    }
    if (!stroke && !fill) continue;
    const sw = (parseFloat(cs.strokeWidth) || 0) * scale;
    // Drawn as open lines, a path's fill would still close it; only closed shapes are filled.
    const dash =
      cs.strokeDasharray && cs.strokeDasharray !== "none"
        ? cs.strokeDasharray
            .split(/[,\s]+/)
            .map((v) => parseFloat(v) * scale)
            .filter((v) => v >= 0 && Number.isFinite(v))
        : [];
    const head = [
      clip ?? "",
      stroke ? rgbOp(stroke.rgb, "RG") : "",
      fill ? rgbOp(fill.rgb, "rg") : "",
      stroke ? `${num(Math.max(sw, 0.02))} w` : "",
      cs.strokeLinecap === "round"
        ? "1 J"
        : cs.strokeLinecap === "square"
          ? "2 J"
          : "0 J",
      cs.strokeLinejoin === "round" ? "1 j" : "0 j",
      dash.length ? `[${dash.map(num).join(" ")}] 0 d` : "",
      alpha(Math.min(stroke?.a ?? 1, fill?.a ?? 1)),
    ]
      .filter(Boolean)
      .join(" ");
    const body: string[] = [];
    for (const s of shapes) {
      if (s.pts.length < 2) continue;
      const path = s.pts
        .map(([x, y], i) => `${num(x)} ${num(y)} ${i ? "l" : "m"}`)
        .join(" ");
      const closed =
        s.closed ||
        (s.pts.length > 2 &&
          Math.hypot(
            s.pts[0][0] - s.pts[s.pts.length - 1][0],
            s.pts[0][1] - s.pts[s.pts.length - 1][1],
          ) < 1e-6);
      const doFill = !!fill && closed;
      // A zero-length round-capped stroke is a dot: PDF draws it when the cap is round.
      body.push(
        `${path}${closed ? " h" : ""} ${doFill && stroke ? "B" : doFill ? "f" : stroke ? "S" : "n"}`,
      );
    }
    if (body.length) out.push(`q ${head} ${body.join(" ")} Q`);
  }
}

const FONT_KEYS = new Map<string, string>();
const fontKey = (f: string) => {
  if (!FONT_KEYS.has(f)) FONT_KEYS.set(f, `F${FONT_KEYS.size}`);
  return FONT_KEYS.get(f)!;
};

/** Rough advance width of a string in a base-14 face, for squeezing text to the width the browser gave it. */
function approxWidth(s: string, font: string, size: number): number {
  const mono = font.startsWith("Courier");
  let w = 0;
  for (const ch of s) {
    if (mono) w += 0.6;
    else if ("iljI.,:;'|!".includes(ch)) w += 0.28;
    else if ("mwMW@".includes(ch)) w += 0.82;
    else if (ch === " " || "frt()[]-".includes(ch)) w += 0.33;
    else if (/[A-Z0-9]/.test(ch)) w += 0.66;
    else w += 0.54;
  }
  return w * size * (font.includes("Bold") ? 1.05 : 1);
}

/** The PDF of the chart(s) drawn by `draw`, called once per chart and resolving with that chart's svg. */
export async function chartsToPdf(
  paperW: number,
  paperH: number,
  sheets: number[],
  draw: (i: number) => Promise<SVGSVGElement | null>,
): Promise<Uint8Array> {
  const pages: Page[] = [];
  const imgs = new Map<
    string,
    { jpg: Uint8Array; w: number; h: number } | null
  >();
  for (const i of sheets) {
    const svg = await draw(i);
    if (!svg) continue;
    for (const im of svg.querySelectorAll("image")) {
      const href = im.getAttribute("href") ?? "";
      if (href && !imgs.has(href)) imgs.set(href, await imageData(href));
    }
    const pg: Page = {
      content: [],
      fonts: new Set(),
      images: new Map(),
      alphas: new Map(),
    };
    await drawSheet(svg, pg, imgs);
    pages.push(pg);
  }

  // Objects are numbered as they are added; an object is a list of byte chunks.
  const objs: Uint8Array[][] = [];
  const add = (chunks: (string | Uint8Array)[]) => {
    objs.push(chunks.map((c) => (typeof c === "string" ? enc.encode(c) : c)));
    return objs.length; // object number
  };
  const reserve = () => {
    objs.push([]);
    return objs.length;
  };
  const set = (n: number, chunks: (string | Uint8Array)[]) => {
    objs[n - 1] = chunks.map((c) =>
      typeof c === "string" ? enc.encode(c) : c,
    );
  };
  const stream = async (dict: string, data: Uint8Array, compress: boolean) => {
    const z = compress ? await deflate(data) : null;
    const body = z ?? data;
    return add([
      `<< ${dict} /Length ${body.length}${z ? " /Filter /FlateDecode" : ""} >>\nstream\n`,
      body,
      "\nendstream",
    ]);
  };

  const catalog = reserve();
  const tree = reserve();
  const fontObj = new Map<string, number>();
  const imgObj = new Map<string, number>();
  const pageObjs: number[] = [];
  for (const pg of pages) {
    for (const f of pg.fonts)
      if (!fontObj.has(f))
        fontObj.set(
          f,
          add([
            `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`,
          ]),
        );
    for (const href of pg.images.keys()) {
      const im = imgs.get(href);
      if (im && !imgObj.has(href))
        imgObj.set(
          href,
          await stream(
            `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
            im.jpg,
            false,
          ),
        );
    }
  }
  for (const pg of pages) {
    const flip = `${num(PT)} 0 0 ${num(-PT)} 0 ${num(paperH * PT)} cm`;
    const text = `${flip}\n${pg.content.join("\n")}\n`;
    const content = await stream("", enc.encode(text), true);
    const res = [
      `/Font << ${[...pg.fonts].map((f) => `/${fontKey(f)} ${fontObj.get(f)} 0 R`).join(" ")} >>`,
      pg.images.size
        ? `/XObject << ${[...pg.images].map(([h, k]) => `/Im${k} ${imgObj.get(h)} 0 R`).join(" ")} >>`
        : "",
      pg.alphas.size
        ? `/ExtGState << ${[...pg.alphas].map(([a, k]) => `/A${k} << /ca ${a} /CA ${a} >>`).join(" ")} >>`
        : "",
    ].join(" ");
    pageObjs.push(
      add([
        `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${num(paperW * PT)} ${num(paperH * PT)}] /Resources << ${res} >> /Contents ${content} 0 R >>`,
      ]),
    );
  }
  set(tree, [
    `<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjs.length} >>`,
  ]);
  set(catalog, [`<< /Type /Catalog /Pages ${tree} 0 R >>`]);
  const info = add([`<< /Producer (MAHA Chart) /Creator (MAHA Chart) >>`]);

  const parts: Uint8Array[] = [enc.encode("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n")];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objs.forEach((chunks, i) => {
    offsets.push(pos);
    const all = [
      enc.encode(`${i + 1} 0 obj\n`),
      ...chunks,
      enc.encode("\nendobj\n"),
    ];
    for (const c of all) {
      parts.push(c);
      pos += c.length;
    }
  });
  const xref = [
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
  ].join("");
  parts.push(
    enc.encode(
      `${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`,
    ),
  );
  return concat(parts);
}
