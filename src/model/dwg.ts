import type { LibreDwgModule } from 'libredwg-glue';

/**
 * DWG reading with LibreDWG (GPL-3.0), compiled to wasm and built into the app.
 * A DWG is converted to DXF text, which the DXF reader then imports, so DWG text
 * comes through as real text.
 */
let mod: Promise<LibreDwgModule> | null = null;

async function gunzipBase64(b64: string): Promise<ArrayBuffer> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function load(): Promise<LibreDwgModule> {
  mod ??= (async () => {
    const [{ default: b64 }, { default: createModule }] = await Promise.all([import('virtual:libredwg-wasm'), import('libredwg-glue')]);
    return createModule({ wasmBinary: await gunzipBase64(b64), print: () => {}, printErr: () => {} });
  })();
  mod.catch(() => (mod = null));
  return mod;
}

/** Decode DXF bytes: UTF-8 (R2007+) or the old ANSI code page. */
function decodeDxf(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function dwgToDxfText(buf: ArrayBuffer): Promise<string> {
  try {
    return await convert(await load(), buf);
  } catch (e) {
    // A crash inside the wasm leaves it unusable: start a fresh one for the next file.
    mod = null;
    const msg = (e as Error).message;
    throw new Error(/out of bounds|unreachable|RuntimeError/i.test(msg) ? `LibreDWG stopped on something in this drawing it doesn’t support (${msg}).` : msg);
  }
}

function convert(m: LibreDwgModule, buf: ArrayBuffer): string {
  m.FS.writeFile('in.dwg', new Uint8Array(buf));
  try {
    const rc = m.dwg_write_dxf('in.dwg', 'out.dxf');
    let out: Uint8Array;
    try {
      out = m.FS.readFile('out.dxf');
    } catch {
      throw new Error(`LibreDWG could not convert this drawing (code ${rc}).`);
    }
    try {
      m.FS.unlink('out.dxf');
    } catch {
      // already gone
    }
    return decodeDxf(out);
  } finally {
    try {
      m.FS.unlink('in.dwg');
    } catch {
      // already gone
    }
  }
}
