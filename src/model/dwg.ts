import type { LibreDwgModule } from "libredwg-glue";

/**
 * DWG reading with LibreDWG (GPL-3.0), compiled to wasm and built into the app.
 * A DWG is converted to DXF text, which the DXF reader then imports, so DWG text
 * comes through as real text.
 */
let mod: Promise<LibreDwgModule> | null = null;

async function gunzipBase64(b64: string): Promise<ArrayBuffer> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function load(): Promise<LibreDwgModule> {
  mod ??= (async () => {
    const [{ default: b64 }, { default: createModule }] = await Promise.all([
      import("virtual:libredwg-wasm"),
      import("libredwg-glue"),
    ]);
    return createModule({
      wasmBinary: await gunzipBase64(b64),
      print: () => {},
      printErr: () => {},
    });
  })();
  mod.catch(() => (mod = null));
  return mod;
}

/** Decode DXF bytes: UTF-8 (R2007+) or the old ANSI code page. */
function decodeDxf(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function dwgToDxfText(buf: ArrayBuffer): Promise<string> {
  try {
    return convert(await load(), buf);
  } catch {
    // LibreDWG's DXF writer stops on some drawings it can still read. A crash
    // leaves the wasm unusable, so read again in a fresh one and write the DXF here.
    mod = null;
  }
  try {
    return await viaObjects(await load(), buf);
  } catch (e) {
    mod = null;
    const msg = (e as Error).message;
    throw new Error(
      /out of bounds|unreachable|RuntimeError|signature/i.test(msg)
        ? `LibreDWG stopped on something in this drawing it doesn’t support (${msg}).`
        : msg,
    );
  }
}

/** Read the DWG into JavaScript objects with LibreDWG, then write DXF text from them. */
async function viaObjects(
  m: LibreDwgModule,
  buf: ArrayBuffer,
): Promise<string> {
  const [{ LibreDwg, Dwg_File_Type }, { dwgDbToDxf }] = await Promise.all([
    import("@mlightcad/libredwg-web"),
    import("./dwgDb"),
  ]);
  const lib = LibreDwg.createByWasmInstance(m as never);
  const data = lib.dwg_read_data(buf, Dwg_File_Type.DWG);
  if (!data) throw new Error("LibreDWG could not read this drawing.");
  try {
    return dwgDbToDxf(lib.convert(data) as never);
  } finally {
    try {
      lib.dwg_free(data);
    } catch {
      // freed with the module
    }
  }
}

function convert(m: LibreDwgModule, buf: ArrayBuffer): string {
  m.FS.writeFile("in.dwg", new Uint8Array(buf));
  try {
    const rc = m.dwg_write_dxf("in.dwg", "out.dxf");
    let out: Uint8Array;
    try {
      out = m.FS.readFile("out.dxf");
    } catch {
      throw new Error(`LibreDWG could not convert this drawing (code ${rc}).`);
    }
    try {
      m.FS.unlink("out.dxf");
    } catch {
      // already gone
    }
    return decodeDxf(out);
  } finally {
    try {
      m.FS.unlink("in.dwg");
    } catch {
      // already gone
    }
  }
}
