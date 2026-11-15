import type { Dataset } from "../model/datasets";
import type { ChartTemplate } from "../model/types";
import { useEditor } from "./store";
import { useProject, type FolderNode, type FolderState } from "./project";
import { settingsOf } from "../model/datasetSettings";
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
  /** "full": chart, data and project; "settings": only the settings (no data). Older files have none and are full. */
  mode?: "full" | "settings";
  carry?: FolderState | null;
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
  video?: {
    rows: VideoRow[];
    joinHours?: number;
    image: { name: string; url: string } | null;
  };
  storage: Record<string, string>;
}

async function gzip(
  blob: Blob,
  onProgress?: (f: number) => void,
): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return blob;
  let done = 0;
  const count = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      done += chunk.byteLength;
      onProgress?.(done / Math.max(1, blob.size));
      c.enqueue(chunk);
    },
  });
  return new Response(
    blob.stream().pipeThrough(count).pipeThrough(new CompressionStream("gzip")),
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

function withoutFiles(n: FolderNode): FolderNode {
  return {
    ...n,
    files: [],
    names: n.files.length ? n.files.map((f) => f.name) : n.names,
    children: n.children.map(withoutFiles),
  };
}

/** Build the project file for the session as it is now. */
export type SaveMode = "full" | "settings";

export async function workspaceBlob(
  mode: SaveMode = "full",
  /** Called with 0..1 as the file is built. */
  onProgress?: (f: number) => void,
): Promise<Blob> {
  onProgress?.(0.02);
  await new Promise((r) => setTimeout(r, 40));
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
    mode,
    parts: [],
    template: ed.template!,
    sheetIndex: ed.sheetIndex,
    datasets: mode === "full" ? sv.datasets : [],
    reversed: sv.reversed,
    carry:
      mode === "settings"
        ? {
            ...(pr.active !== null
              ? pr.folder(pr.active)
              : (pr.carry ?? { recipes: [] })),
            template: ed.template!,
            settings: sv.datasets.length
              ? sv.datasets.map(settingsOf)
              : pr.active !== null
                ? pr.folder(pr.active).settings
                : pr.carry?.settings,
          }
        : null,
    project:
      mode === "settings"
        ? null
        : pr.tree
          ? {
              name: pr.name,
              // The raw files are not embedded: the project folder on disk still holds them.
              tree: withoutFiles(pr.tree),
              folders: pr.folders,
              active: pr.active,
              selected: pr.selected,
              expanded: pr.expanded,
            }
          : null,
    video: {
      rows: useVideo.getState().rows,
      joinHours: useVideo.getState().joinHours,
      image: useVideo.getState().image,
    },
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
        $b: add(
          new Blob([new Uint8Array(t.buffer, t.byteOffset, t.byteLength)]),
        ),
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
  onProgress?.(0.3);
  const out = await gzip(
    new Blob([MAGIC, len, head, ...parts], {
      type: "application/octet-stream",
    }),
    (f) => onProgress?.(0.3 + 0.65 * f),
  );
  onProgress?.(0.97);
  return out;
}

/** Put a project file's contents back: chart, data, project and app settings. */
export async function loadWorkspace(file: File): Promise<string> {
  const buf = await gunzip(await file.arrayBuffer());
  const u8 = new Uint8Array(buf);
  const magic = new TextDecoder().decode(u8.subarray(0, MAGIC.length));
  if (magic !== MAGIC)
    throw new Error("This is not a MAHA Chart project file.");
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
  const settingsOnly = h.mode === "settings";
  useEditor.getState().open(h.template);
  useEditor.setState({ sheetIndex: h.sheetIndex ?? 0 });
  if (settingsOnly) {
    useSurvey.getState().clear();
    const c = h.carry ?? null;
    useProject.setState({ carry: c, active: null });
    useVideo.setState({
      rows: h.video?.rows ?? [],
      joinHours: h.video?.joinHours ?? 12,
      image: h.video?.image ?? null,
    });
    return h.template.name;
  }
  useSurvey.getState().load(h.datasets, h.reversed);
  useVideo.setState({
    rows: h.video?.rows ?? [],
    joinHours: h.video?.joinHours ?? 12,
    image: h.video?.image ?? null,
  });
  if (h.project) {
    // Files saved before the folder was marked as charted: find the folder by its import settings.
    let active = h.project.active;
    if (active === null && h.datasets.length) {
      let best = 0;
      for (const [path, f] of Object.entries(h.project.folders)) {
        const hits = h.datasets.filter((d) =>
          f.recipes.some(
            (r) => d.name === r.file || d.name.startsWith(`${r.file} `),
          ),
        ).length;
        if (path && hits > best) [best, active] = [hits, path];
      }
    }
    useProject.setState({
      ...h.project,
      active,
      selected: active ?? h.project.selected,
      expanded: active
        ? {
            ...h.project.expanded,
            ...Object.fromEntries(
              active
                .split("/")
                .map((_, i, a) => [a.slice(0, i).join("/"), true]),
            ),
          }
        : h.project.expanded,
      handle: null,
      dirty: false,
    });
  }
  return h.template.name;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
