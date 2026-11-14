import type { Dataset } from "../model/datasets";
import type { ChartTemplate } from "../model/types";
import { useEditor } from "./store";
import { useProject, type FolderNode, type FolderState } from "./project";
import { useSurvey } from "./surveyData";
import { useVideo } from "./video";
import type { VideoRow } from "../model/video";

/**
 * The whole work of a session in one file: the chart (paper, scale, overlap, every panel
 * setting), the imported data with its looks, the project folders with their files and
 * import settings, and the app's saved mapping presets and templates.
 *
 * Layout: "MAHAWS1\n", uint32 header length, header JSON, then the binary parts
 * (typed arrays and files) back to back. The whole thing is gzipped when the browser can.
 */
const MAGIC = "MAHAWS1\n";
const STORE_PREFIXES = ["mahachart.", "maha."];

type Typed =
  | Float64Array
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray;

const TYPED: Record<string, new (b: ArrayBuffer) => Typed> = {
  Float64Array,
  Float32Array,
  Int32Array,
  Uint32Array,
  Int16Array,
  Uint16Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
};

interface Header {
  format: "mahachart-workspace";
  version: 1;
  saved: string;
  parts: number[];
  template: ChartTemplate;
  sheetIndex: number;
  datasets: Dataset[];
  reversed: boolean;
  project: null | {
    name: string | null;
    tree: FolderNode | null;
    folders: Record<string, FolderState>;
    active: string | null;
    selected: string | null;
    expanded: Record<string, boolean>;
  };
  video?: { rows: VideoRow[]; image: { name: string; url: string } | null };
  storage: Record<string, string>;
}

async function gzip(blob: Blob): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return blob;
  return new Response(
    blob.stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u = new Uint8Array(buf);
  if (u[0] !== 0x1f || u[1] !== 0x8b) return buf;
  if (typeof DecompressionStream === "undefined")
    throw new Error("This browser can't open compressed project files.");
  return new Response(
    new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
}

/** Build the project file for the session as it is now. */
export async function workspaceBlob(): Promise<Blob> {
  const ed = useEditor.getState();
  const sv = useSurvey.getState();
  const pr = useProject.getState();
  const parts: Blob[] = [];
  const sizes: number[] = [];
  const add = (b: Blob) => {
    parts.push(b);
    sizes.push(b.size);
    return parts.length - 1;
  };
  const storage: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (STORE_PREFIXES.some((p) => k.startsWith(p)))
        storage[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* storage blocked: the file just carries none */
  }
  const header: Header = {
    format: "mahachart-workspace",
    version: 1,
    saved: new Date().toISOString(),
    parts: [],
    template: ed.template!,
    sheetIndex: ed.sheetIndex,
    datasets: sv.datasets,
    reversed: sv.reversed,
    project: pr.tree
      ? {
          name: pr.name,
          tree: pr.tree,
          folders: pr.folders,
          active: pr.active,
          selected: pr.selected,
          expanded: pr.expanded,
        }
      : null,
    video: { rows: useVideo.getState().rows, image: useVideo.getState().image },
    storage,
  };
  const json = JSON.stringify(header, function (_k, v) {
    if (v instanceof File)
      return {
        $f: add(v),
        name: v.name,
        type: v.type,
        modified: v.lastModified,
      };
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const t = v as Typed;
      return {
        $b: add(new Blob([new Uint8Array(t.buffer, t.byteOffset, t.byteLength)])),
        $t: t.constructor.name,
      };
    }
    if (v instanceof Map) return { $map: [...v.entries()] };
    if (v instanceof Set) return { $set: [...v] };
    return v;
  });
  // The sizes are known only after the walk, so they are patched in.
  const head = new TextEncoder().encode(
    json.replace('"parts":[]', `"parts":${JSON.stringify(sizes)}`),
  );
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.length);
  return gzip(
    new Blob([MAGIC, len, head, ...parts], { type: "application/octet-stream" }),
  );
}

/** Put a project file's contents back: chart, data, project and app settings. */
export async function loadWorkspace(file: File): Promise<string> {
  const buf = await gunzip(await file.arrayBuffer());
  const u8 = new Uint8Array(buf);
  const magic = new TextDecoder().decode(u8.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error("This is not a MAHA Chart project file.");
  const hl = new DataView(buf).getUint32(MAGIC.length);
  const start = MAGIC.length + 4;
  const text = new TextDecoder().decode(u8.subarray(start, start + hl));
  const sizes = (JSON.parse(text) as { parts: number[] }).parts;
  const offs: number[] = [];
  let at = start + hl;
  for (const s of sizes) {
    offs.push(at);
    at += s;
  }
  const bytes = (i: number) => buf.slice(offs[i], offs[i] + sizes[i]);
  const h = JSON.parse(text, (_k, v) => {
    if (v && typeof v === "object") {
      if ("$b" in v) return new TYPED[v.$t](bytes(v.$b));
      if ("$f" in v)
        return new File([bytes(v.$f)], v.name, {
          type: v.type,
          lastModified: v.modified,
        });
      if ("$map" in v) return new Map(v.$map);
      if ("$set" in v) return new Set(v.$set);
    }
    return v;
  }) as Header;
  if (h.format !== "mahachart-workspace")
    throw new Error("This is not a MAHA Chart project file.");
  try {
    for (const [k, v] of Object.entries(h.storage ?? {}))
      localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
  useEditor.getState().open(h.template);
  useEditor.setState({ sheetIndex: h.sheetIndex ?? 0 });
  useSurvey.getState().load(h.datasets, h.reversed);
  useVideo.setState({ rows: h.video?.rows ?? [], image: h.video?.image ?? null });
  if (h.project)
    useProject.setState({
      ...h.project,
      handle: null,
      dirty: false,
    });
  return h.template.name;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
