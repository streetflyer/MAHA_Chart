import { create } from 'zustand';
import type { DataStyle, ImportTarget } from '../model/datasets';
import type { Mapping } from '../model/importers';
import type { ChartTemplate } from '../model/types';

/**
 * A project is a folder on disk holding one sub-folder per line (FL1, FJ1, HFL1...),
 * each with that line's survey files. The project remembers, for every folder, the
 * chart template it uses and how each of its files was imported, so opening a
 * folder again charts it the same way.
 */

export interface FolderNode {
  name: string;
  /** Path from the root, '/' separated; '' for the root itself. */
  path: string;
  children: FolderNode[];
  /** Files directly in this folder (not in sub-folders). */
  files: File[];
}

/** How one file was imported: enough to import it again without the wizard. */
export interface ImportRecipe {
  file: string;
  target: ImportTarget;
  mapping: Mapping;
  style: DataStyle;
}

export interface FolderState {
  template?: ChartTemplate;
  recipes: ImportRecipe[];
}

export interface ProjectFile {
  format: 'mahachart-project';
  version: 1;
  name: string;
  saved: string;
  folders: Record<string, FolderState>;
}

export const PROJECT_FILE = 'MAHA_project.json';

interface ProjectState {
  name: string | null;
  tree: FolderNode | null;
  /** Writable folder handle (Chrome / Edge); null when the folder was read with a plain folder picker. */
  handle: FileSystemDirectoryHandle | null;
  folders: Record<string, FolderState>;
  /** Folder whose data is on the chart now. */
  active: string | null;
  /** Folder picked in the tree. */
  selected: string | null;
  expanded: Record<string, boolean>;
  dirty: boolean;
  set(patch: Partial<ProjectState>): void;
  folder(path: string): FolderState;
  recordImports(path: string, recipes: ImportRecipe[]): void;
  setTemplate(path: string, t: ChartTemplate): void;
}

export const useProject = create<ProjectState>((set, get) => ({
  name: null,
  tree: null,
  handle: null,
  folders: {},
  active: null,
  selected: null,
  expanded: { '': true },
  dirty: false,
  set: (patch) => set(patch),
  folder: (path) => get().folders[path] ?? { recipes: [] },
  recordImports: (path, recipes) => {
    const f = get().folder(path);
    // A file imported again replaces its old recipe (all its sheets).
    const names = new Set(recipes.map((r) => r.file));
    set({ folders: { ...get().folders, [path]: { ...f, recipes: [...f.recipes.filter((r) => !names.has(r.file)), ...recipes] } }, dirty: true });
  },
  setTemplate: (path, t) => set({ folders: { ...get().folders, [path]: { ...get().folder(path), template: structuredClone(t) } }, dirty: true }),
}));

export function findNode(tree: FolderNode | null, path: string): FolderNode | null {
  if (!tree) return null;
  if (tree.path === path) return tree;
  for (const c of tree.children) {
    const hit = findNode(c, path);
    if (hit) return hit;
  }
  return null;
}

const SKIP = /^(\.|~\$|Thumbs\.db$|desktop\.ini$)/i;

/** Read a folder handle into a tree (sub-folders up to `depth` deep). */
export async function readHandle(h: FileSystemDirectoryHandle, path = '', depth = 8): Promise<FolderNode> {
  const node: FolderNode = { name: h.name, path, children: [], files: [] };
  // entries() is in every browser that has showDirectoryPicker.
  for await (const [name, entry] of (h as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (SKIP.test(name)) continue;
    if (entry.kind === 'directory') {
      if (depth > 0) node.children.push(await readHandle(entry as FileSystemDirectoryHandle, path ? `${path}/${name}` : name, depth - 1));
    } else if (name !== PROJECT_FILE) node.files.push(await (entry as FileSystemFileHandle).getFile());
  }
  sortTree(node);
  return node;
}

/** A tree from the files of an <input webkitdirectory> pick (read-only). */
export function treeFromFiles(files: File[]): { tree: FolderNode; projectFile?: File } {
  const rootName = files[0]?.webkitRelativePath.split('/')[0] ?? 'Project';
  const root: FolderNode = { name: rootName, path: '', children: [], files: [] };
  let projectFile: File | undefined;
  for (const f of files) {
    const parts = f.webkitRelativePath.split('/').slice(1);
    const name = parts.pop()!;
    if (parts.some((p) => SKIP.test(p)) || SKIP.test(name)) continue;
    let node = root;
    for (const p of parts) {
      const path = node.path ? `${node.path}/${p}` : p;
      let next = node.children.find((c) => c.name === p);
      if (!next) {
        next = { name: p, path, children: [], files: [] };
        node.children.push(next);
      }
      node = next;
    }
    if (node === root && name === PROJECT_FILE) projectFile = f;
    else node.files.push(f);
  }
  sortTree(root);
  return { tree: root, projectFile };
}

function sortTree(n: FolderNode) {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
  n.children.sort(byName);
  n.files.sort(byName);
  n.children.forEach(sortTree);
}

/** The handle of a sub-folder by path. */
export async function subHandle(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  let h = root;
  for (const p of path.split('/').filter(Boolean)) h = await h.getDirectoryHandle(p);
  return h;
}

/** Ask for write access to a folder handle (needs a click to have just happened). */
export async function canWrite(h: FileSystemDirectoryHandle): Promise<boolean> {
  const x = h as unknown as { queryPermission?(o: object): Promise<string>; requestPermission?(o: object): Promise<string> };
  try {
    if ((await x.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
    return (await x.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export function projectJson(): ProjectFile {
  const s = useProject.getState();
  return { format: 'mahachart-project', version: 1, name: s.name ?? 'Project', saved: new Date().toISOString(), folders: s.folders };
}

export function parseProject(text: string): ProjectFile {
  const p = JSON.parse(text) as ProjectFile;
  if (p?.format !== 'mahachart-project' || typeof p.folders !== 'object') throw new Error('Not a MAHA Chart project file.');
  return p;
}
