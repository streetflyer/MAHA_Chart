import { useRef, useState } from 'react';
import { useEditor } from '../state/store';
import { useSurvey } from '../state/surveyData';
import {
  PROJECT_FILE,
  canWrite,
  findNode,
  parseProject,
  projectJson,
  readHandle,
  subHandle,
  treeFromFiles,
  useProject,
  type FolderNode,
} from '../state/project';
import { askConfirm } from './Dialog';
import { useImport } from './ImportDialog';

const COLLAPSE_KEY = 'maha.projectPanel';

type DirPicker = (o?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
const dirPicker = (): DirPicker | undefined => (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;

/**
 * The project tree on the left: pick the project's root folder, see its folders
 * (one per line: FL1, FJ1, HFL1...), drop files on a folder, and chart a folder.
 * Each folder keeps its own template and import settings in the project file.
 */
export function ProjectPanel({ onNotice }: { onNotice(m: string): void }) {
  const pr = useProject();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const folderInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // Not remembered; fine.
      }
      return !c;
    });
  };

  async function openRoot() {
    const pick = dirPicker();
    if (!pick) {
      folderInput.current?.click();
      return;
    }
    let h: FileSystemDirectoryHandle;
    try {
      h = await pick({ mode: 'readwrite' });
    } catch {
      return; // cancelled
    }
    onNotice(`Reading ${h.name}…`);
    const tree = await readHandle(h);
    let folders = {};
    try {
      const f = await (await h.getFileHandle(PROJECT_FILE)).getFile();
      folders = parseProject(await f.text()).folders;
    } catch {
      // A new project: no project file yet.
    }
    useProject.setState({ name: h.name, tree, handle: h, folders, active: null, selected: '', expanded: { '': true }, dirty: false });
    onNotice(`Opened project ${h.name}: ${countFolders(tree)} folders.`);
  }

  function openFromFiles(files: File[]) {
    if (!files.length) return;
    const { tree, projectFile } = treeFromFiles(files);
    useProject.setState({ name: tree.name, tree, handle: null, folders: {}, active: null, selected: '', expanded: { '': true }, dirty: false });
    if (projectFile)
      void projectFile.text().then((t) => {
        try {
          useProject.setState({ folders: parseProject(t).folders });
        } catch {
          // ignore a broken project file
        }
      });
    onNotice(`Opened project ${tree.name}: ${countFolders(tree)} folders (read only in this browser: new files are kept until the page closes).`);
  }

  /** Put the current chart's template into the folder now on the chart. */
  function keepActiveTemplate() {
    const s = useProject.getState();
    const t = useEditor.getState().template;
    if (s.active !== null && t) s.setTemplate(s.active, t);
  }

  async function chartFolder(path: string) {
    const s = useProject.getState();
    const node = findNode(s.tree, path);
    if (!node) return;
    if (s.active === path) {
      if (node.files.length) useImport.getState().request(node.files);
      return;
    }
    if (useSurvey.getState().datasets.length && s.active === null) {
      if (!(await askConfirm('Chart this folder?', 'The data on the chart now is cleared and this folder’s files are loaded instead.', 'Chart folder'))) return;
    }
    keepActiveTemplate();
    useSurvey.getState().clear();
    const saved = s.folder(path).template;
    if (saved) useEditor.getState().open(saved);
    useProject.setState({ active: path, selected: path });
    if (!saved && useEditor.getState().template) useProject.getState().setTemplate(path, useEditor.getState().template!);
    if (node.files.length) useImport.getState().request(node.files);
    else onNotice(`${node.name} has no files yet: drop survey files on it.`);
  }

  async function addFiles(path: string, files: File[]) {
    const s = useProject.getState();
    const node = findNode(s.tree, path);
    if (!node || !files.length) return;
    let written = false;
    if (s.handle && (await canWrite(s.handle))) {
      try {
        const dir = await subHandle(s.handle, path);
        for (const f of files) {
          const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
          await w.write(f);
          await w.close();
        }
        written = true;
      } catch (e) {
        onNotice(`Couldn’t copy into the folder: ${(e as Error).message}`);
      }
    }
    // Same name replaces the old file in the list.
    node.files = [...node.files.filter((x) => !files.some((f) => f.name === x.name)), ...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    useProject.setState({ tree: { ...s.tree! }, dirty: true });
    onNotice(`${files.length} file${files.length > 1 ? 's' : ''} ${written ? 'copied into' : 'added to'} ${node.name || s.name}.`);
    if (s.active === path) useImport.getState().request(files);
  }

  async function saveProject() {
    keepActiveTemplate();
    const s = useProject.getState();
    if (!s.tree) return;
    const text = JSON.stringify(projectJson(), null, 1);
    if (s.handle && (await canWrite(s.handle))) {
      try {
        const w = await (await s.handle.getFileHandle(PROJECT_FILE, { create: true })).createWritable();
        await w.write(text);
        await w.close();
        useProject.setState({ dirty: false });
        onNotice(`Project saved to ${s.name}/${PROJECT_FILE}.`);
        return;
      } catch {
        // fall back to a download
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${(s.name ?? 'project').replace(/[^\w.-]+/g, '_')}.${PROJECT_FILE}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    useProject.setState({ dirty: false });
    onNotice(`Project downloaded as ${a.download}. Keep it in the project folder as ${PROJECT_FILE}.`);
  }

  async function loadProject(file: File) {
    try {
      const p = parseProject(await file.text());
      useProject.setState({ folders: p.folders, name: useProject.getState().name ?? p.name, dirty: false });
      onNotice(useProject.getState().tree ? `Loaded project settings for ${Object.keys(p.folders).length} folders.` : `Loaded ${p.name}. Now open its folder with “Open folder…”.`);
    } catch (e) {
      onNotice((e as Error).message);
    }
  }

  if (collapsed)
    return (
      <aside className="project-panel collapsed">
        <button type="button" className="link" title="Show the project" onClick={toggle}>
          ▸
        </button>
        <span className="vertical-label">Project</span>
      </aside>
    );

  const sel = pr.selected !== null ? findNode(pr.tree, pr.selected) : null;
  const recipes = sel ? pr.folder(sel.path).recipes : [];

  return (
    <aside className="project-panel">
      <div className="project-head">
        <h4>Project{pr.dirty ? ' •' : ''}</h4>
        <button type="button" className="link" title="Hide the project" onClick={toggle}>
          ◂
        </button>
      </div>
      <div className="project-actions">
        <button type="button" onClick={() => void openRoot()} title="Choose the project's root folder; its folders become the project tree">
          Open folder…
        </button>
        <button type="button" disabled={!pr.tree} onClick={() => void saveProject()} title={`Save the project (${PROJECT_FILE} in the root folder)`}>
          Save
        </button>
        <button type="button" onClick={() => projectInput.current?.click()} title="Load a saved project file">
          Load…
        </button>
      </div>
      {!pr.tree && <p className="hint">Open the project’s root folder (e.g. 01_Listing). Each folder in it gets its own charts; drop survey files on a folder to add them.</p>}
      {pr.tree && (
        <div className="project-tree" role="tree">
          <TreeNode
            n={pr.tree}
            depth={0}
            over={over}
            setOver={setOver}
            onDropFiles={(path, files) => void addFiles(path, files)}
            onOpen={(path) => void chartFolder(path)}
          />
        </div>
      )}
      {sel && (
        <div className="project-folder">
          <div className="pf-title">
            <b>{sel.name || pr.name}</b>
            {pr.active === sel.path && <span className="pf-badge">on the chart</span>}
          </div>
          <ul className="pf-files">
            {sel.files.map((f) => (
              <li key={f.name} title={f.name}>
                {recipes.some((r) => r.file === f.name) ? '✓ ' : ''}
                {f.name}
              </li>
            ))}
            {!sel.files.length && <li className="hint">No files. Drop files here or on the folder.</li>}
          </ul>
          <div className="project-actions">
            <button type="button" className="primary" onClick={() => void chartFolder(sel.path)} title="Load this folder's files into the chart (its own template and import settings)">
              {pr.active === sel.path ? 'Import its files again' : 'Chart this folder'}
            </button>
            <button type="button" onClick={() => addInput.current?.click()}>
              Add files…
            </button>
          </div>
        </div>
      )}
      <input
        ref={folderInput}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          openFromFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        type="file"
        hidden
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadProject(f);
          e.target.value = '';
        }}
      />
      <input
        ref={addInput}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          if (sel) void addFiles(sel.path, [...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </aside>
  );
}

function countFolders(n: FolderNode): number {
  return n.children.reduce((s, c) => s + 1 + countFolders(c), 0);
}

function TreeNode({
  n,
  depth,
  over,
  setOver,
  onDropFiles,
  onOpen,
}: {
  n: FolderNode;
  depth: number;
  over: string | null;
  setOver(p: string | null): void;
  onDropFiles(path: string, files: File[]): void;
  onOpen(path: string): void;
}) {
  const pr = useProject();
  const open = pr.expanded[n.path] ?? depth < 2;
  const fileCount = n.files.length;
  return (
    <div role="treeitem" aria-expanded={n.children.length ? open : undefined}>
      <div
        className={`tree-row${pr.selected === n.path ? ' selected' : ''}${pr.active === n.path ? ' active' : ''}${over === n.path ? ' over' : ''}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => useProject.setState({ selected: n.path })}
        onDoubleClick={() => onOpen(n.path)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(n.path);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(null);
          onDropFiles(n.path, [...e.dataTransfer.files]);
        }}
        title={`${n.path || n.name}: double-click to chart this folder; drop files to add them`}
      >
        <button
          type="button"
          className="tree-caret"
          style={{ visibility: n.children.length ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation();
            useProject.setState({ expanded: { ...pr.expanded, [n.path]: !open } });
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="tree-icon">📁</span>
        <span className="tree-name">{n.name}</span>
        {fileCount > 0 && <span className="tree-count">{fileCount}</span>}
      </div>
      {open && n.children.map((c) => <TreeNode key={c.path} n={c} depth={depth + 1} over={over} setOver={setOver} onDropFiles={onDropFiles} onOpen={onOpen} />)}
    </div>
  );
}
