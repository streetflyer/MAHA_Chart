import { useRef, useState } from "react";
import { useEditor } from "../state/store";
import { useSurvey } from "../state/surveyData";
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
} from "../state/project";
import { askCodes, askConfirm } from "./Dialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import {
  copyFolderSettings,
  saveFolderSettings,
} from "../state/folderSettings";
import { useImport } from "./ImportDialog";

const COLLAPSE_KEY = "maha.projectPanel";

type DirPicker = (o?: {
  mode?: "read" | "readwrite";
}) => Promise<FileSystemDirectoryHandle>;
const dirPicker = (): DirPicker | undefined =>
  (window as unknown as { showDirectoryPicker?: DirPicker })
    .showDirectoryPicker;

/**
 * The project tree on the left: pick the project's root folder, see its folders
 * (one per line: FL1, FJ1, HFL1...), drop files on a folder, and chart a folder.
 * Each folder keeps its own template and import settings in the project file.
 */
export function ProjectPanel({ onNotice }: { onNotice(m: string): void }) {
  const pr = useProject();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const folderInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
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
      h = await pick({ mode: "readwrite" });
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
    useProject.setState({
      name: h.name,
      tree,
      handle: h,
      folders,
      active: null,
      selected: "",
      expanded: { "": true },
      dirty: false,
    });
    onNotice(`Opened project ${h.name}: ${countFolders(tree)} folders.`);
  }

  function openFromFiles(files: File[]) {
    if (!files.length) return;
    const { tree, projectFile } = treeFromFiles(files);
    useProject.setState({
      name: tree.name,
      tree,
      handle: null,
      folders: {},
      active: null,
      selected: "",
      expanded: { "": true },
      dirty: false,
    });
    if (projectFile)
      void projectFile.text().then((t) => {
        try {
          useProject.setState({ folders: parseProject(t).folders });
        } catch {
          // ignore a broken project file
        }
      });
    onNotice(
      `Opened project ${tree.name}: ${countFolders(tree)} folders (read only in this browser: new files are kept until the page closes).`,
    );
  }

  /** Put the current chart's template into the folder now on the chart. */
  function keepActiveTemplate() {
    const s = useProject.getState();
    // Template, panel properties and every file's look go with the folder (also when the project is saved).
    if (s.active !== null && useEditor.getState().template)
      saveFolderSettings(s.active);
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
      if (
        !(await askConfirm(
          "Chart this folder?",
          "The data on the chart now is cleared and this folder’s files are loaded instead.",
          "Chart folder",
        ))
      )
        return;
    }
    keepActiveTemplate();
    useSurvey.getState().clear();
    const saved = s.folder(path).template;
    if (saved) useEditor.getState().open(saved);
    useProject.setState({ active: path, selected: path });
    if (!saved && useEditor.getState().template)
      useProject.getState().setTemplate(path, useEditor.getState().template!);
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
          const w = await (
            await dir.getFileHandle(f.name, { create: true })
          ).createWritable();
          await w.write(f);
          await w.close();
        }
        written = true;
      } catch (e) {
        onNotice(`Couldn’t copy into the folder: ${(e as Error).message}`);
      }
    }
    // Same name replaces the old file in the list.
    node.files = [
      ...node.files.filter((x) => !files.some((f) => f.name === x.name)),
      ...files,
    ].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    useProject.setState({ tree: { ...s.tree! }, dirty: true });
    onNotice(
      `${files.length} file${files.length > 1 ? "s" : ""} ${written ? "copied into" : "added to"} ${node.name || s.name}.`,
    );
    if (s.active === path) useImport.getState().request(files);
  }

  /** Take a file out of a folder's list; optionally delete it from the disk folder too. */
  async function removeFile(path: string, name: string, disk: boolean) {
    const s = useProject.getState();
    const node = findNode(s.tree, path);
    if (!node) return;
    if (disk) {
      if (!s.handle || !(await canWrite(s.handle))) {
        onNotice(
          "This browser has no write access to the folder, so the file can only be taken off the list.",
        );
        return;
      }
      if (
        !(await askConfirm(
          "Delete the file from the folder?",
          `${name} is deleted from the folder on the disk. This cannot be undone.`,
          "Delete",
          true,
        ))
      )
        return;
      try {
        await (await subHandle(s.handle, path)).removeEntry(name);
      } catch (e) {
        onNotice(`Couldn’t delete ${name}: ${(e as Error).message}`);
        return;
      }
    }
    node.files = node.files.filter((f) => f.name !== name);
    s.forgetFile(path, name);
    // Data read from it leaves the chart too.
    if (s.active === path)
      for (const d of useSurvey
        .getState()
        .datasets.filter((x) => x.name === name))
        useSurvey.getState().removeDataset(d.id);
    useProject.setState({ tree: { ...s.tree! }, dirty: true });
    onNotice(
      `${name} ${disk ? "deleted from the folder" : "removed from the list"}.`,
    );
  }

  function fileMenu(e: React.MouseEvent, path: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    const s = useProject.getState();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Remove from the project",
          action: () => void removeFile(path, name, false),
        },
        {
          label: "Remove and delete from the folder…",
          disabled: !s.handle,
          action: () => void removeFile(path, name, true),
        },
        "separator",
        {
          label: "Import this file again",
          disabled: s.active !== path,
          action: () => {
            const f = findNode(s.tree, path)?.files.find(
              (x) => x.name === name,
            );
            if (f) useImport.getState().request([f]);
          },
        },
      ],
    });
  }

  function folderMenu(e: React.MouseEvent, path: string) {
    e.preventDefault();
    e.stopPropagation();
    const s = useProject.getState();
    const node = findNode(s.tree, path);
    useProject.setState({ selected: path });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Chart this folder", action: () => void chartFolder(path) },
        {
          label: "Remove all its files from the project",
          disabled: !node?.files.length,
          action: async () => {
            if (
              !node ||
              !(await askConfirm(
                "Remove all files?",
                `All ${node.files.length} files of ${node.name || s.name} leave the project list (the files on the disk stay).`,
                "Remove",
              ))
            )
              return;
            for (const f of [...node.files])
              await removeFile(path, f.name, false);
          },
        },
        "separator",
        {
          label: "Save settings of the chart to this folder",
          disabled: s.active !== path,
          action: () => void saveSettings(path),
        },
        {
          label: "Use settings of another folder…",
          action: () => void useSettingsFrom(path),
        },
      ],
    });
  }

  /** Keep the template, panel properties and every dataset's look with the folder. */
  function saveSettings(path: string) {
    saveFolderSettings(path);
    onNotice(
      `Settings saved to ${path || useProject.getState().name}: template, panel properties and the look of every file. Use Save to write the project file.`,
    );
  }

  async function useSettingsFrom(path: string) {
    const s = useProject.getState();
    const others = Object.entries(s.folders).filter(
      ([p, f]) =>
        p !== path && (f.recipes.length || f.template || f.settings?.length),
    );
    if (!others.length) {
      onNotice(
        "No other folder has saved settings yet: chart a folder, set it up, then save its settings.",
      );
      return;
    }
    const label = (p: string) => p || s.name || "Project";
    const got = await askCodes(
      "Use settings of…",
      `Copy the template, panel properties and file settings of another folder to ${label(path)}. The chart layout of ${label(path)} is replaced.`,
      others.map(([p, f]) => ({
        code: label(p),
        note: `${f.recipes.length} files read${f.template ? ", has a template" : ""}`,
      })),
      "Use",
      true,
    );
    const from = got?.[0]
      ? others.find(([p]) => label(p) === got[0])?.[0]
      : undefined;
    if (from === undefined) return;
    const n = copyFolderSettings(from, path);
    onNotice(
      `${label(path)} now uses the settings of ${label(from)}${n ? ` (${n} files restyled)` : ""}.`,
    );
  }

  async function saveProject() {
    keepActiveTemplate();
    const s = useProject.getState();
    if (!s.tree) return;
    const text = JSON.stringify(projectJson(), null, 1);
    if (s.handle && (await canWrite(s.handle))) {
      try {
        const w = await (
          await s.handle.getFileHandle(PROJECT_FILE, { create: true })
        ).createWritable();
        await w.write(text);
        await w.close();
        useProject.setState({ dirty: false });
        onNotice(`Project saved to ${s.name}/${PROJECT_FILE}.`);
        return;
      } catch {
        // fall back to a download
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    a.download = `${(s.name ?? "project").replace(/[^\w.-]+/g, "_")}.${PROJECT_FILE}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    useProject.setState({ dirty: false });
    onNotice(
      `Project downloaded as ${a.download}. Keep it in the project folder as ${PROJECT_FILE}.`,
    );
  }

  async function loadProject(file: File) {
    try {
      const p = parseProject(await file.text());
      useProject.setState({
        folders: p.folders,
        name: useProject.getState().name ?? p.name,
        dirty: false,
      });
      onNotice(
        useProject.getState().tree
          ? `Loaded project settings for ${Object.keys(p.folders).length} folders.`
          : `Loaded ${p.name}. Now open its folder with “Open folder…”.`,
      );
    } catch (e) {
      onNotice((e as Error).message);
    }
  }

  if (collapsed)
    return (
      <aside className="project-panel collapsed">
        <button
          type="button"
          className="link"
          title="Show the project"
          onClick={toggle}
        >
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
        <h4>Project{pr.dirty ? " •" : ""}</h4>
        <button
          type="button"
          className="link"
          title="Hide the project"
          onClick={toggle}
        >
          ◂
        </button>
      </div>
      <div className="project-actions">
        <button
          type="button"
          onClick={() => void openRoot()}
          title="Choose the project's root folder; its folders become the project tree"
        >
          Open folder…
        </button>
        <button
          type="button"
          disabled={!pr.tree}
          onClick={() => void saveProject()}
          title={`Save the project (${PROJECT_FILE} in the root folder)`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => projectInput.current?.click()}
          title="Load a saved project file"
        >
          Load…
        </button>
      </div>
      {!pr.tree && (
        <p className="hint">
          Open the project’s root folder (e.g. 01_Listing). Each folder in it
          gets its own charts; drop survey files on a folder to add them.
        </p>
      )}
      {pr.tree && (
        <div className="project-tree" role="tree">
          <TreeNode
            n={pr.tree}
            depth={0}
            over={over}
            setOver={setOver}
            onDropFiles={(path, files) => void addFiles(path, files)}
            onOpen={(path) => void chartFolder(path)}
            onMenu={folderMenu}
          />
        </div>
      )}
      {sel && (
        <div className="project-folder">
          <div className="pf-title">
            <b>{sel.name || pr.name}</b>
            {pr.active === sel.path && (
              <span className="pf-badge">on the chart</span>
            )}
          </div>
          <ul className="pf-files">
            {sel.files.map((f) => (
              <li
                key={f.name}
                title={`${f.name}: right-click to remove`}
                onContextMenu={(e) => fileMenu(e, sel.path, f.name)}
              >
                {recipes.some((r) => r.file === f.name) ? "✓ " : ""}
                {f.name}
              </li>
            ))}
            {!sel.files.length && (
              <li className="hint">
                No files. Drop files here or on the folder.
              </li>
            )}
          </ul>
          <div className="project-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void chartFolder(sel.path)}
              title="Load this folder's files into the chart (its own template and import settings)"
            >
              {pr.active === sel.path
                ? "Import its files again"
                : "Chart this folder"}
            </button>
            <button type="button" onClick={() => addInput.current?.click()}>
              Add files…
            </button>
            <button
              type="button"
              disabled={pr.active !== sel.path}
              onClick={() => saveSettings(sel.path)}
              title="Keep the template, panel properties and the look of every file with this folder"
            >
              Save settings
            </button>
            <button
              type="button"
              onClick={() => void useSettingsFrom(sel.path)}
              title="Copy the settings of another folder of the project to this one"
            >
              Use settings of…
            </button>
          </div>
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      <input
        ref={folderInput}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          openFromFiles([...(e.target.files ?? [])]);
          e.target.value = "";
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
          e.target.value = "";
        }}
      />
      <input
        ref={addInput}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          if (sel) void addFiles(sel.path, [...(e.target.files ?? [])]);
          e.target.value = "";
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
  onMenu,
}: {
  n: FolderNode;
  depth: number;
  over: string | null;
  setOver(p: string | null): void;
  onDropFiles(path: string, files: File[]): void;
  onOpen(path: string): void;
  onMenu(e: React.MouseEvent, path: string): void;
}) {
  const pr = useProject();
  const open = pr.expanded[n.path] ?? depth < 2;
  const fileCount = n.files.length;
  return (
    <div role="treeitem" aria-expanded={n.children.length ? open : undefined}>
      <div
        className={`tree-row${pr.selected === n.path ? " selected" : ""}${pr.active === n.path ? " active" : ""}${over === n.path ? " over" : ""}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => useProject.setState({ selected: n.path })}
        onDoubleClick={() => onOpen(n.path)}
        onContextMenu={(e) => onMenu(e, n.path)}
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
          style={{ visibility: n.children.length ? "visible" : "hidden" }}
          onClick={(e) => {
            e.stopPropagation();
            useProject.setState({
              expanded: { ...pr.expanded, [n.path]: !open },
            });
          }}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="tree-icon">📁</span>
        <span className="tree-name">{n.name}</span>
        {fileCount > 0 && <span className="tree-count">{fileCount}</span>}
      </div>
      {open &&
        n.children.map((c) => (
          <TreeNode
            key={c.path}
            n={c}
            depth={depth + 1}
            over={over}
            setOver={setOver}
            onDropFiles={onDropFiles}
            onOpen={onOpen}
            onMenu={onMenu}
          />
        ))}
    </div>
  );
}
