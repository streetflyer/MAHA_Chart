import { dwgToDxfText } from '../model/dwg';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { profileFromRow, VW_RAW, type CrossProfile } from '../model/crossProfile';
import { TARGETS, extOf, targetInfo, targetsFor, type DataStyle, type Dataset, type EventRecord, type ImportTarget } from '../model/datasets';
import { parseDxfLinework, type Linework } from '../model/dxf';
import { newId } from '../model/ids';
import {
  DEFAULT_COLOURS,
  buildDataset,
  dataRows,
  defaultMapping,
  dxfLayers,
  fieldsFor,
  fromPreset,
  headerOf,
  MEAN_LINES,
  routeFromSurveyLine,
  loadPresets,
  savePresets,
  toPreset,
  transDataset,
  type Mapping,
  type MappingPreset,
} from '../model/importers';
import { makeRoute } from '../model/route';
import { parseRlx, parseRlxp, splitAtKp0, type Runline } from '../model/runline';
import { dropComments, fileHead, fileLines, lineSplitter, parseDelimited, readXlsx, type Table } from '../model/tables';
import { useEditor } from '../state/store';
import { useProject, type ImportRecipe } from '../state/project';
import { useSurvey } from '../state/surveyData';
import { StyleControls, LinksEditor, applyStyle, defaultStyle } from './DataStyleControls';
import { fitInto, readImageFile } from './imageImport';
import { ImportPreview } from './ImportPreview';
import { titleInsideHeight } from './PanelContent';

/** Opening the import window from anywhere (toolbar, drop on the sheet, a panel's data list). */
export const useImport = create<{ open: boolean; files: File[]; panelType?: string; request(files?: File[], panelType?: string): void; close(): void }>((set) => ({
  open: false,
  files: [],
  request: (files = [], panelType) => set({ open: true, files, panelType }),
  close: () => set({ open: false, files: [], panelType: undefined }),
}));

interface Item {
  id: string;
  file: File;
  target: ImportTarget;
  /** Sheets of a workbook, or the one table of a text file (only its start when `big`). */
  tables?: Table[];
  /** Text file too big to hold as a table: read again line by line on import. */
  big?: boolean;
  lw?: Linework;
  runlines?: Runline[];
  mapping: Mapping;
  /** Colours, widths and fonts chosen before import. */
  style: DataStyle;
  /** Logo panel to place an image in. */
  panelId?: string;
  error?: string;
  loading: boolean;
}

const IMAGE_EXT = TARGETS.find((t) => t.key === 'logo')!.exts;
/** Text files over this are previewed from their start and streamed on import. */
const BIG_FILE = 24 * 1024 * 1024;

/** A guess at where a file dropped on the window (not on a row) belongs. */
function guessTarget(name: string, panelType: string | undefined, hasRoute: boolean, firstRows?: string[][]): ImportTarget {
  const ext = extOf(name);
  if (IMAGE_EXT.includes(ext)) return 'logo';
  if (ext === 'rlx' || ext === 'rlxp') return 'route';
  if (ext === 'dxf' || ext === 'dwg') return panelType === 'keyplan' ? 'siteplan' : !hasRoute && panelType === undefined ? 'route' : 'plan';
  if (ext === 'dig' || ext === 'xyz') return 'asbuilt';
  if (ext === 'long') return 'long';
  const byPanel = targetsFor(name).find((t) => t.panelType === panelType && t.key !== 'route' && t.key !== 'asbuilt');
  if (byPanel) return byPanel.key;
  const h = (firstRows ?? []).slice(0, 8).flat().join(' ').toUpperCase();
  if (/^\d{14,}/.test(firstRows?.[0]?.[0] ?? '')) return 'trans';
  if (/\bCODE\b|EVENT/.test(h)) return 'events';
  if (/\bMV\b|\bCP\b|POTENTIAL/.test(h)) return 'cp';
  if (/\bTOP\b|\bBOP\b|SEABED/.test(h)) return 'long';
  if (ext === 'xlsx' || ext === 'xls') return 'events';
  return 'asbuilt';
}

async function readItem(file: File, target: ImportTarget): Promise<Partial<Item>> {
  const ext = extOf(file.name);
  if (IMAGE_EXT.includes(ext)) return {};
  if (ext === 'dxf' || ext === 'dwg') {
    let text: string;
    if (ext === 'dwg') {
      try {
        text = await dwgToDxfText(await file.arrayBuffer());
      } catch (e) {
        return { error: `Couldn’t read this DWG: ${(e as Error).message} Try Save As → DXF in AutoCAD instead.` };
      }
    } else text = await file.text();
    const lw = parseDxfLinework(text, file.name);
    if (!lw) return { error: 'No lines, polylines, arcs or text found (binary DXF is not supported; save as ASCII DXF).' };
    const layer = target === 'route' ? dxfLayers(lw)[0]?.layer : undefined;
    return { lw, mapping: { ...defaultMapping(target, null), layer } };
  }
  if (ext === 'rlx' || ext === 'rlxp') {
    const text = await file.text();
    const runlines = ext === 'rlxp' ? parseRlxp(text) : [parseRlx(text, file.name.replace(/\.rlx$/i, ''))].filter((r): r is Runline => !!r);
    if (!runlines.length) return { error: 'No runline segments found in this file.' };
    return { runlines, mapping: { ...defaultMapping('route', null), layer: runlines[0].name } };
  }
  if (ext === 'xls') return { error: 'Old .xls workbooks can’t be read in the browser. Save it as .xlsx or .csv and import that.' };
  if (ext === 'xlsx') {
    const tables = await readXlsx(await file.arrayBuffer());
    const sheet = Math.max(0, tables.findIndex((t) => t.rows.length > 1));
    return { tables, mapping: { ...defaultMapping(target, tables[sheet] ?? null), sheet } };
  }
  const big = file.size > BIG_FILE;
  const text = big ? await fileHead(file) : await file.text();
  const table = parseDelimited(dropComments(text), file.name);
  if (!table.rows.length) return { error: 'The file is empty.' };
  return { tables: [table], big, mapping: defaultMapping(target, table) };
}

/** The rows the window offers: the template's data panels, plus the lines drawn in the plan view. */
function rowTargets(panelTypes: Set<string>): ImportTarget[] {
  return TARGETS.filter((t) => t.key !== 'logo' && t.panelType && panelTypes.has(t.panelType)).map((t) => t.key);
}

export function ImportDialog({ initial, dropPanelType, onClose, onNotice }: { initial: File[]; dropPanelType?: string; onClose(): void; onNotice(m: string): void }) {
  const template = useEditor((s) => s.template)!;
  const datasets = useSurvey((s) => s.datasets);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [presets, setPresets] = useState<MappingPreset[]>(loadPresets);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFor = useRef<ImportTarget | undefined>(undefined);
  const [overRow, setOverRow] = useState<ImportTarget | null>(null);
  const [sameAsSurvey, setSameAsSurvey] = useState(false);
  const [keyPlanUsesPlan, setKeyPlanUsesPlan] = useState(() => useSurvey.getState().datasets.some((d) => d.target === 'plan' && d.kind === 'linework' && d.both));
  const logoPanels = template.panels.filter((p) => p.type === 'logo');
  const rows = rowTargets(new Set(template.panels.map((p) => p.type)));

  /** Saved import settings for a file of the project folder on the chart, if any. */
  function recipesFor(name: string, sheets = 1): ImportRecipe[] {
    const pr = useProject.getState();
    if (pr.active === null) return [];
    return pr.folder(pr.active).recipes.filter((r) => r.file === name && r.mapping.sheet < Math.max(1, sheets));
  }

  async function add(files: File[], forced?: ImportTarget) {
    const hasRoute = !!useSurvey.getState().route || items.some((i) => i.target === 'route');
    const fresh: Item[] = files.map((file) => ({
      id: newId(),
      file,
      target: forced ?? guessTarget(file.name, dropPanelType, hasRoute),
      mapping: defaultMapping('plan', null),
      style: {},
      panelId: logoPanels[0]?.id,
      loading: true,
    }));
    setItems((xs) => [...xs, ...fresh]);
    setCurrent(fresh[0]?.id ?? null);
    for (const it of fresh) {
      try {
        const got = await readItem(it.file, it.target);
        // Content can sharpen the guess (e.g. a CSV whose header says CODE).
        const t0 = got.tables?.[got.mapping?.sheet ?? 0];
        const target = !forced && t0 ? guessTarget(it.file.name, dropPanelType, hasRoute, t0.rows) : it.target;
        const mapping = target !== it.target ? { ...defaultMapping(target, t0 ?? null), sheet: got.mapping?.sheet ?? 0 } : (got.mapping ?? it.mapping);
        // A file this project folder imported before comes back the way it was imported (every sheet of it).
        const recipes = recipesFor(it.file.name, got.tables?.length);
        if (recipes.length) {
          const [first, ...rest] = recipes;
          const copies: Item[] = rest.map((r) => ({ ...it, ...got, id: newId(), target: r.target, mapping: r.mapping, style: r.style, loading: false }));
          setItems((xs) => [...xs.map((x) => (x.id === it.id ? { ...x, ...got, target: first.target, mapping: first.mapping, style: first.style, loading: false } : x)), ...copies]);
          continue;
        }
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...got, target, mapping, style: defaultStyle(target), loading: false } : x)));
      } catch (e) {
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, loading: false, error: (e as Error).message } : x)));
      }
    }
  }

  useEffect(() => {
    if (initial.length) void add(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const it = items.find((x) => x.id === current) ?? null;
  const table = it?.tables?.[it.mapping.sheet] ?? null;
  const update = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const setMapping = (patch: Partial<Mapping>) => it && update(it.id, { mapping: { ...it.mapping, ...patch } });

  /** Send a file to another import row: fresh column guesses and look for that kind of data. */
  function retarget(id: string, target: ImportTarget) {
    const x = items.find((y) => y.id === id);
    if (!x || x.target === target) return;
    const t = x.tables?.[x.mapping.sheet] ?? null;
    const mapping = { ...defaultMapping(target, t), sheet: x.mapping.sheet, layer: target === 'route' && x.lw ? dxfLayers(x.lw)[0]?.layer : x.mapping.layer };
    update(id, { target, mapping, style: defaultStyle(target) });
    setCurrent(id);
  }

  function changeTarget(target: ImportTarget) {
    if (it) retarget(it.id, target);
  }

  const ITEM_MIME = 'application/x-maha-import-item';
  const draggedItem = (e: React.DragEvent) => e.dataTransfer.types.includes(ITEM_MIME);

  /** Another sheet of the same workbook, as its own item with its own columns. */
  function toggleSheet(sheet: number, on: boolean) {
    if (!it?.tables) return;
    const same = items.filter((x) => x.file === it.file);
    const has = same.find((x) => x.mapping.sheet === sheet);
    if (on && !has) {
      const t = it.tables[sheet];
      const copy: Item = { ...it, id: newId(), mapping: { ...defaultMapping(it.target, t), sheet }, style: { ...it.style } };
      setItems((xs) => [...xs, copy]);
      setCurrent(copy.id);
    } else if (!on && has && same.length > 1) {
      setItems((xs) => xs.filter((x) => x.id !== has.id));
      if (current === has.id) setCurrent(same.find((x) => x.id !== has.id)!.id);
    }
  }

  function openPicker(target?: ImportTarget) {
    pickFor.current = target;
    fileRef.current?.click();
  }

  async function importOne(x: Item): Promise<string | null> {
    const s = useEditor.getState();
    if (x.target === 'logo') {
      const panel = template.panels.find((p) => p.id === x.panelId);
      if (!panel) return 'pick a logo panel';
      const img = await readImageFile(x.file);
      const top = titleInsideHeight(panel) || 1;
      const r = fitInto(img.width, img.height, { x: 1.5, y: top, w: panel.w - 3, h: panel.h - top - 1.5 });
      s.addImage({ panelId: panel.id, ...r, src: img.src, name: x.file.name });
      return null;
    }
    let d: Dataset | string;
    if (x.runlines) {
      const rl = x.runlines.find((r) => r.name === x.mapping.layer) ?? x.runlines[0];
      const { line, before } = splitAtKp0(rl);
      d = {
        id: newId(),
        name: x.runlines.length > 1 ? `${x.file.name} – ${rl.name}` : x.file.name,
        target: 'route',
        visible: true,
        color: DEFAULT_COLOURS.route!,
        kind: 'route',
        route: makeRoute(rl.name, line),
        width: 0.35,
        before: before ? new Float64Array(before) : undefined,
      };
      // A runline that starts past KP 0 carries its own start KP.
      s.setField('START_KP', (Math.max(0, rl.kp[0]) / 1000).toFixed(3));
    } else if (x.big && x.target === 'trans') {
      d = await streamTrans(x);
    } else {
      d = buildDataset(x.target, x.file.name, x.tables?.[x.mapping.sheet] ?? null, x.mapping, x.lw);
    }
    if (typeof d === 'string') return d;
    d = applyStyle(d, x.style);
    useSurvey.getState().addDataset(d);
    if (d.kind === 'route') s.setScale({ routeLength: Math.round(d.route.length * 1000) / 1000, sheets: undefined });
    return null;
  }

  async function streamTrans(x: Item): Promise<Dataset | string> {
    const c = { ...VW_RAW, ...x.mapping.cols };
    const kpScale = x.mapping.kpUnit === 'km' ? 1000 : 1;
    const split = lineSplitter(await fileHead(x.file, 64 * 1024));
    const profiles: CrossProfile[] = [];
    let n = 0;
    const skip = x.mapping.skip + (x.mapping.header ? 1 : 0);
    for await (const line of fileLines(x.file)) {
      if (n++ < skip || !line.trim()) continue;
      const p = profileFromRow(split(line), c, kpScale);
      if (p) profiles.push(p);
      if (n % 2000 === 0) setBusy(`Reading ${x.file.name}: ${n.toLocaleString()} profiles…`);
    }
    return transDataset({ id: newId(), name: x.file.name, target: 'trans', visible: true, color: DEFAULT_COLOURS.trans! }, profiles);
  }

  async function runImport() {
    setBusy('Importing…');
    const done: string[] = [];
    const failed: { id: string; msg: string }[] = [];
    for (const x of items) {
      if (x.error || x.loading) continue;
      try {
        const err = await importOne(x);
        if (err) failed.push({ id: x.id, msg: `${x.file.name}: ${err}` });
        else done.push(`${x.file.name} → ${targetInfo(x.target).label}`);
      } catch (e) {
        failed.push({ id: x.id, msg: `${x.file.name}: ${(e as Error).message}` });
      }
    }
    // The key plan draws the plan view's drawings too (or stops doing so).
    for (const d of useSurvey.getState().datasets) if (d.target === 'plan' && d.kind === 'linework' && !!d.both !== keyPlanUsesPlan) useSurvey.getState().updateDataset(d.id, { both: keyPlanUsesPlan });
    if (keyPlanUsesPlan && !useSurvey.getState().datasets.some((d) => d.target === 'plan')) failed.push({ id: '', msg: 'Key plan: there is no plan view DXF to use. Add one in the Plan view row.' });
    if (sameAsSurvey) {
      // The runline follows the as-built survey line (the newest one loaded).
      const line = [...useSurvey.getState().datasets].reverse().find((d) => d.target === 'asbuilt' && d.kind === 'linework');
      const r = line && routeFromSurveyLine(line, newId());
      if (r && r.kind === 'route') {
        useSurvey.getState().addDataset(r);
        useEditor.getState().setScale({ routeLength: Math.round(r.route.length * 1000) / 1000, sheets: undefined });
        done.push(`${line!.name} → Runline (same as the survey line)`);
      } else failed.push({ id: '', msg: 'Runline: no As Built survey line to copy. Add one in the As Built survey line row.' });
    }
    setBusy(null);
    if (failed.length) {
      onNotice(`Not imported: ${failed.map((f) => f.msg).join('; ')}`);
      setItems((xs) => xs.filter((x) => failed.some((f) => f.id === x.id)));
      setCurrent(failed.find((f) => f.id)?.id ?? null);
      return;
    }
    if (done.length) onNotice(`Imported ${done.join('; ')}.`);
    // Remember how this folder's files were imported, for the next time it is opened.
    const pr = useProject.getState();
    if (pr.active !== null) {
      const ok = items.filter((x) => !x.error && !x.loading && x.target !== 'logo');
      pr.recordImports(
        pr.active,
        ok.map((x) => ({ file: x.file.name, target: x.target, mapping: x.mapping, style: x.style })),
      );
    }
    onClose();
  }

  const ready = items.filter((x) => !x.error && !x.loading);
  const canImport = ready.length > 0 || keyPlanUsesPlan !== datasets.some((d) => d.target === 'plan' && d.kind === 'linework' && d.both) || (sameAsSurvey && (items.some((x) => x.target === 'asbuilt') || datasets.some((d) => d.target === 'asbuilt')));
  const allCodes = [
    ...new Set([
      ...items.filter((x) => x.target === 'events' && x.tables).flatMap((x) => [...eventCodes(x.tables![x.mapping.sheet] ?? null, x.mapping), ...x.mapping.extra.map((e) => e.code.toUpperCase())]),
      ...datasets.flatMap((d) => (d.kind === 'events' ? d.records.map((r) => r.code.toUpperCase()) : [])),
    ]),
  ].filter(Boolean);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void add([...e.dataTransfer.files]);
        }}
      >
        <h3 id="import-title">Import data</h3>
        <div className="import-body">
          <div className="import-rows">
            {rows.map((target) => {
              const info = targetInfo(target);
              const pending = items.filter((x) => x.target === target);
              const loaded = datasets.filter((d) => d.target === target);
              return (
                <div
                  key={target}
                  className={`import-row${it?.target === target ? ' active' : ''}${overRow === target ? ' over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = draggedItem(e) ? 'move' : 'copy';
                    setOverRow(target);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverRow(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOverRow(null);
                    const moved = e.dataTransfer.getData(ITEM_MIME);
                    if (moved) retarget(moved, target);
                    else void add([...e.dataTransfer.files], target);
                  }}
                >
                  <button type="button" className={`drop-box${overRow === target ? ' over' : ''}`} onClick={() => openPicker(target)}>
                    Drag and drop or click to open file
                  </button>
                  <div className="row-info">
                    <div className="row-label">
                      {info.label} <span className="exts">{info.exts.filter((x) => x !== 'xls').map((x) => '.' + x).join(' ')}</span>
                    </div>
                    <ul>
                      {loaded.map((d) => (
                        <li key={d.id} className="loaded" title="Already imported">
                          ✓ {d.name}
                        </li>
                      ))}
                      {pending.map((x) => (
                        <li
                          key={x.id}
                          className={`movable${x.id === current ? ' active' : ''}`}
                          onClick={() => setCurrent(x.id)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(ITEM_MIME, x.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          title={`${x.file.name}: drag onto another row to import it there`}
                        >
                          <span className="drag-grip" aria-hidden>⠿</span>
                          <span className="fname">
                            {x.file.name}
                            {x.tables && x.tables.length > 1 ? ` › ${x.tables[x.mapping.sheet]?.name}` : ''}
                          </span>
                          <span className={x.error ? 'status error' : 'status'}>{x.loading ? 'Reading…' : x.error ? 'Can’t read' : 'Ready'}</span>
                          <button
                            type="button"
                            className="link"
                            title="Remove from the list"
                            onClick={(e) => {
                              e.stopPropagation();
                              setItems((xs) => xs.filter((y) => y.id !== x.id));
                              if (current === x.id) setCurrent(null);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    {target === 'siteplan' && (
                      <label className="check same-line" title="Draw the plan view DXF in the key plan as well">
                        <input type="checkbox" checked={keyPlanUsesPlan} onChange={(e) => setKeyPlanUsesPlan(e.target.checked)} />
                        Use the same DXF as the plan view
                      </label>
                    )}
                    {target === 'route' && (
                      <label className="check same-line" title="Use the As Built survey line as the runline; KP runs from 0 along it">
                        <input type="checkbox" checked={sameAsSurvey} onChange={(e) => setSameAsSurvey(e.target.checked)} />
                        Use the same line as the survey line
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
            {items.some((x) => !rows.includes(x.target)) && (
              <div className="import-row">
                <div className="row-info">
                  <div className="row-label">Other</div>
                  <ul>
                    {items
                      .filter((x) => !rows.includes(x.target))
                      .map((x) => (
                        <li key={x.id} className={x.id === current ? 'active' : ''} onClick={() => setCurrent(x.id)}>
                          <span className="fname">{x.file.name}</span>
                          <span className="status">{targetInfo(x.target).label}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void add([...(e.target.files ?? [])], pickFor.current);
                e.target.value = '';
              }}
            />
          </div>

          <div className="import-map">
            {!it && <p className="hint">Drop a file on a row, or click a row to choose one. Its columns can then be set here.</p>}
            {it && (
              <h4 className="map-title" title={it.file.name}>
                {it.file.name}
              </h4>
            )}
            {it?.error && <p className="error">{it.error}</p>}
            {it && !it.error && !it.loading && (
              <Wizard
                it={it}
                table={table}
                presets={presets}
                logoPanels={logoPanels}
                setMapping={setMapping}
                update={(patch) => update(it.id, patch)}
                changeTarget={changeTarget}
                sheetsChosen={items.filter((x) => x.file === it.file).map((x) => x.mapping.sheet)}
                toggleSheet={toggleSheet}
                allCodes={allCodes}
                savePreset={(name) => {
                  const next = [...presets.filter((p) => !(p.name === name && p.target === it.target)), toPreset(name, it.target, table, it.mapping)];
                  setPresets(next);
                  savePresets(next);
                }}
                deletePreset={(name) => {
                  const next = presets.filter((p) => !(p.name === name && p.target === it.target));
                  setPresets(next);
                  savePresets(next);
                }}
              />
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <span className="push-left hint">{busy ?? 'Files stay on this computer; nothing is uploaded.'}</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!!busy || !canImport} onClick={() => void runImport()}>
            Import {ready.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function Wizard({
  it,
  table,
  presets,
  logoPanels,
  setMapping,
  update,
  changeTarget,
  sheetsChosen,
  toggleSheet,
  allCodes,
  savePreset,
  deletePreset,
}: {
  it: Item;
  table: Table | null;
  presets: MappingPreset[];
  logoPanels: { id: string; title: string }[];
  setMapping(patch: Partial<Mapping>): void;
  update(patch: Partial<Item>): void;
  changeTarget(t: ImportTarget): void;
  sheetsChosen: number[];
  toggleSheet(sheet: number, on: boolean): void;
  /** Event codes read from every events file and sheet in the window, and from loaded data. */
  allCodes: string[];
  savePreset(name: string): void;
  deletePreset(name: string): void;
}) {
  const m = it.mapping;
  const fields = fieldsFor(it.target, m);
  const header = columnNames(it.target, table, m);
  const nCols = table ? Math.min(60, Math.max(...table.rows.slice(0, 30).map((r) => r.length))) : 0;
  const colName = (i: number) => (header[i] ? `${i + 1}: ${header[i].replace(/\s+/g, ' ')}` : `Column ${i + 1}`);
  const mapped = new Set([...Object.values(m.cols), ...m.series]);
  // What each column is used for, shown under its name in the preview.
  const usedFor = new Map<number, string>();
  for (const f of fields) {
    if (m.cols[f.key] !== undefined) usedFor.set(m.cols[f.key], f.pair ? `${f.label} (1)` : f.label);
    if (f.pair && m.cols[f.key + '2'] !== undefined) usedFor.set(m.cols[f.key + '2'], `${f.label} (2)`);
  }
  for (const c of m.series) if (!usedFor.has(c)) usedFor.set(c, 'Seabed line');
  const mine = presets.filter((p) => p.target === it.target);
  const [presetName, setPresetName] = useState('');
  const [shown, setShown] = useState(200);
  const [zoom, setZoom] = useState(100);
  const allRows = dataRows(table, m);
  const preview = allRows.slice(0, shown);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const firstRow = m.skip + (m.header ? 1 : 0);
  function setSpan(start: string, end: string) {
    const old = m.span!;
    const links = m.links.map((l) => (l.start === old.start && l.end === old.end ? { ...l, start, end } : l));
    setMapping({ span: { start, end }, links });
  }

  return (
    <>
      <div className="row2">
        <label className="field">
          <span>Import into</span>
          <select value={it.target} onChange={(e) => changeTarget(e.target.value as ImportTarget)}>
            {targetsFor(it.file.name).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {it.tables && it.tables.length > 1 && (it.target === 'events' || it.target === 'cp') && (
          <div className="field sheet-picks">
            <span>Sheets to import (each gets its own columns)</span>
            <div className="checks">
              {it.tables.map((t, i) => (
                <label key={i} className="check">
                  <input type="checkbox" checked={sheetsChosen.includes(i)} disabled={sheetsChosen.length === 1 && sheetsChosen[0] === i} onChange={(e) => toggleSheet(i, e.target.checked)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {it.tables && it.tables.length > 1 && (
          <label className="field">
            <span>Sheet</span>
            <select value={m.sheet} onChange={(e) => update({ mapping: { ...defaultMapping(it.target, it.tables![Number(e.target.value)]), sheet: Number(e.target.value), extra: m.extra } })}>
              {it.tables.map((t, i) => (
                <option key={i} value={i}>
                  {t.name} ({t.rows.length.toLocaleString()} rows)
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="hint">{targetInfo(it.target).hint}</p>

      {it.target === 'logo' && (
        <label className="field">
          <span>Logo panel</span>
          <select value={it.panelId ?? ''} onChange={(e) => update({ panelId: e.target.value })}>
            {logoPanels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {it.runlines && (
        <>
          {it.runlines.length > 1 && (
            <label className="field">
              <span>Runline</span>
              <select value={m.layer} onChange={(e) => setMapping({ layer: e.target.value })}>
                {it.runlines.map((r) => (
                  <option key={r.name}>{r.name}</option>
                ))}
              </select>
            </label>
          )}
          {(() => {
            const r = it.runlines.find((x) => x.name === m.layer) ?? it.runlines[0];
            return (
              <p className="hint">
                {r.name}: KP {(r.kp[0] / 1000).toFixed(3)} to {(r.kp[r.kp.length - 1] / 1000).toFixed(3)}
                {r.kp[0] < 0 ? '. The part before KP 0 is drawn but charts start at KP 0.' : '.'}
              </p>
            );
          })()}
        </>
      )}

      {it.lw && (
        <p className="hint">
          {it.lw.lines.length} lines and {it.lw.texts.length} texts on {new Set(it.lw.layers).size} layers.
        </p>
      )}
      {it.lw && it.target === 'route' && (
        <label className="field">
          <span>Layer with the runline (the longest line on it is used)</span>
          <select value={m.layer ?? ''} onChange={(e) => setMapping({ layer: e.target.value })}>
            {dxfLayers(it.lw).map((l) => (
              <option key={l.layer} value={l.layer}>
                {l.layer} — longest line {(l.longest / 1000).toFixed(3)} km
              </option>
            ))}
          </select>
        </label>
      )}

      {table && (
        <>
          <div className="preset-bar">
            <label className="field">
              <span>Mapping template</span>
              <select
                value=""
                onChange={(e) => {
                  const p = mine.find((x) => x.name === e.target.value);
                  if (p) update({ mapping: fromPreset(p, it.tables, m) });
                }}
              >
                <option value="">{mine.length ? 'Load a saved mapping…' : 'None saved yet'}</option>
                {mine.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
            <input placeholder="Name to save as" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            <button type="button" disabled={!presetName.trim()} onClick={() => savePreset(presetName.trim())}>
              Save
            </button>
            {mine.some((p) => p.name === presetName.trim()) && (
              <button type="button" onClick={() => deletePreset(presetName.trim())}>
                Delete
              </button>
            )}
          </div>

          <div className="checks">
            <label className="check">
              Column names on row
              <input
                type="number"
                min={0}
                max={50}
                className="small-num"
                value={m.header ? m.skip + 1 : 0}
                onChange={(e) => {
                  const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  setMapping({ header: v > 0, skip: Math.max(0, v - 1) });
                }}
              />
              <span className="hint">(0 = none)</span>
            </label>
            {fields.some((f) => f.key === 'kp') && (
              <label className="check">
                KP in
                <select value={m.kpUnit} onChange={(e) => setMapping({ kpUnit: e.target.value as Mapping['kpUnit'] })}>
                  <option value="km">km</option>
                  <option value="m">metres</option>
                </select>
              </label>
            )}
          </div>
          <div className="map-fields">
            {fields.map((f) => {
              const pick = (key: string) => (
                <select
                  key={key}
                  value={m.cols[key] ?? ''}
                  onChange={(e) => {
                    const cols = { ...m.cols };
                    if (e.target.value === '') delete cols[key];
                    else cols[key] = Number(e.target.value);
                    setMapping({ cols });
                  }}
                >
                  <option value="">—</option>
                  {Array.from({ length: nCols }, (_, i) => (
                    <option key={i} value={i}>
                      {colName(i)}
                    </option>
                  ))}
                </select>
              );
              return (
                <label key={f.key} className={f.pair ? 'field pair' : 'field'} title={f.pair?.hint}>
                  <span>
                    {f.label}
                    {f.required ? '' : ' (optional)'}
                  </span>
                  {f.pair ? (
                    <span className="pair-selects">
                      {pick(f.key)}
                      <span className="pair-plus">+</span>
                      {pick(f.key + '2')}
                      <span className="pair-plus">÷ 2</span>
                    </span>
                  ) : (
                    pick(f.key)
                  )}
                </label>
              );
            })}
            {it.target === 'cp' && (
              <label className="field">
                <span>Draw as</span>
                <select value={m.cpStyle} onChange={(e) => setMapping({ cpStyle: e.target.value as Mapping['cpStyle'] })}>
                  <option value="ticks">Ticks with readings (like events)</option>
                  <option value="line">Line (gradient CP)</option>
                </select>
              </label>
            )}
          </div>
          {it.target === 'events' && (
            <div className="span-opt">
              {m.span && <p className="hint">This sheet lists spans (start KP, end KP, length, height per row). Each row becomes a start and an end event with these codes, drawn as a linked event.</p>}
              {m.span && (
                <div className="row2">
                  <label className="field">
                    <span>Code for the start</span>
                    <input value={m.span.start} onChange={(e) => setSpan(e.target.value.toUpperCase(), m.span!.end)} />
                  </label>
                  <label className="field">
                    <span>Code for the end</span>
                    <input value={m.span.end} onChange={(e) => setSpan(m.span!.start, e.target.value.toUpperCase())} />
                  </label>
                </div>
              )}
            </div>
          )}
          {it.target === 'long' && (
            <div className="checks">
              <span>Seabed lines:</span>
              {Array.from({ length: nCols }, (_, i) => i)
                .filter((i) => !Object.values(m.cols).includes(i))
                .map((i) => (
                  <label key={i} className="check">
                    <input
                      type="checkbox"
                      checked={m.series.includes(i)}
                      onChange={(e) => setMapping({ series: e.target.checked ? [...m.series, i].sort((a, b) => a - b) : m.series.filter((c) => c !== i) })}
                    />
                    {header[i] || `Column ${i + 1}`}
                  </label>
                ))}
            </div>
          )}
          {it.target === 'trans' && <p className="hint">Defaults follow the VisualWorks Cross-Profile RAW v10.1 layout; raw points are dx, dz pairs from the first raw point column.</p>}
          {it.big && <p className="hint">Large file: showing its first lines. All of it is read when you import.</p>}

          <div className="pz-tools">
            <button type="button" title="Smaller text" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
              −
            </button>
            <span className="pz-zoom">{zoom}%</span>
            <button type="button" title="Larger text" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
              +
            </button>
            <span className="hint">
              Showing {preview.length.toLocaleString()} of {allRows.length.toLocaleString()} rows{it.big ? ' read so far' : ''}. Scroll or drag to pan; drag the corner to resize.
            </span>
            {preview.length < allRows.length && (
              <button type="button" onClick={() => setShown((n) => n * 5)}>
                Show more rows
              </button>
            )}
          </div>
          <div
            className="preview-wrap"
            style={{ fontSize: `${(12 * zoom) / 100}px` }}
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as HTMLElement).closest('input,select,button')) return;
              const el = e.currentTarget;
              // Leave the resize corner alone.
              const r = el.getBoundingClientRect();
              if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) return;
              pan.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
              el.classList.add('panning');
            }}
            onPointerMove={(e) => {
              const p = pan.current;
              if (!p) return;
              e.currentTarget.scrollLeft = p.l - (e.clientX - p.x);
              e.currentTarget.scrollTop = p.t - (e.clientY - p.y);
            }}
            onPointerUp={(e) => {
              pan.current = null;
              e.currentTarget.classList.remove('panning');
            }}
            onPointerLeave={(e) => {
              pan.current = null;
              e.currentTarget.classList.remove('panning');
            }}
          >
            <table className="preview">
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  {Array.from({ length: nCols }, (_, i) => (
                    <th key={i} className={mapped.has(i) ? 'mapped' : ''}>
                      {i + 1}
                    </th>
                  ))}
                </tr>
                <tr className="head-names">
                  <th className="rownum" title="Column names">{m.header ? m.skip + 1 : ''}</th>
                  {Array.from({ length: nCols }, (_, i) => (
                    <th key={i} className={mapped.has(i) ? 'mapped' : ''} title={header[i]}>
                      {header[i] ? header[i].replace(/\s+/g, ' ').slice(0, 28) : '—'}
                      {usedFor.has(i) && usedFor.get(i)!.toUpperCase() !== (header[i] ?? "").trim().toUpperCase() && <span className="used-for">{usedFor.get(i)}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri}>
                    <td className="rownum">{firstRow + ri + 1}</td>
                    {Array.from({ length: nCols }, (_, i) => (
                      <td key={i} className={mapped.has(i) ? 'mapped' : ''}>
                        {String(r[i] ?? '').slice(0, 24)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {it.target === 'events' && <ExtraEvents list={m.extra} onChange={(extra) => setMapping({ extra })} />}
      {it.target === 'events' && (
        <LinksEditor
          links={m.links}
          onChange={(links) => {
            // A span sheet's own pair follows the codes typed for it.
            setMapping({ links });
          }}
          codes={[...new Set([...eventCodes(table, m), ...allCodes])].sort()}
        />
      )}
      {it.target !== 'logo' && (
        <>
          <h4>Look</h4>
          <StyleControls
            target={it.target}
            style={it.style}
            seriesNames={[...MEAN_LINES.filter((l) => m.cols[l.key] !== undefined).map((l) => l.name), ...m.series.map((c) => header[c] || `Column ${c + 1}`)]}
            onChange={(patch) => update({ style: { ...it.style, ...patch } })}
          />
          <h4>Preview</h4>
          <ImportPreview it={it} table={table} />
        </>
      )}
    </>
  );
}

/** VisualWorks raw cross profiles have no header row; these are the names from its format sheet. */
const VW_RAW_NAMES = ['Time', 'Profile no.', 'KP', 'Easting', 'Northing', 'Depth', 'Heading', 'Pipe diameter', 'Distance to pipe', 'Delta depth to pipe', 'Mean seabed', 'Distance below seabed', 'No. of raw points', 'First raw point dx', 'First raw point dz'];

/** Column names from the file's header row, or the known layout when it has none. */
function columnNames(target: ImportTarget, t: Table | null, m: Mapping): string[] {
  const h = headerOf(t, m);
  if (h.length || target !== 'trans') return h;
  return VW_RAW_NAMES;
}

/** Events typed in by hand: pipe spec, weights, coating, anodes, survey dates. */
function ExtraEvents({ list, onChange }: { list: EventRecord[]; onChange(l: EventRecord[]): void }) {
  const set = (i: number, patch: Partial<EventRecord>) => onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="extra-events">
      <h4>Add events by hand</h4>
      <p className="hint">For codes the file doesn’t have, e.g. PP.SN pipe size at KP 0 with its description. Start codes (PP.S…) run to their end code or the end of the line.</p>
      {list.length > 0 && (
        <table className="preview">
          <thead>
            <tr>
              <th>Code</th>
              <th>KP (km)</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={i}>
                <td>
                  <input value={e.code} onChange={(ev) => set(i, { code: ev.target.value.toUpperCase() })} placeholder="PP.SN" />
                </td>
                <td>
                  <input type="number" step={0.001} value={e.kp / 1000} onChange={(ev) => set(i, { kp: Number(ev.target.value) * 1000 })} />
                </td>
                <td>
                  <input value={e.value} onChange={(ev) => set(i, { value: ev.target.value })} />
                </td>
                <td>
                  <button type="button" className="link" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => onChange([...list, { code: '', kp: 0, value: '' }])}>
        + Add event
      </button>
    </div>
  );
}


/** Codes in the mapped column, for picking linked event codes. */
function eventCodes(t: Table | null, m: Mapping): string[] {
  const c = m.cols.code;
  const set = new Set<string>(m.span ? [m.span.start, m.span.end] : []);
  if (t && c !== undefined) for (const r of dataRows(t, m)) if (r[c]) set.add(r[c].trim().toUpperCase());
  return [...set].filter(Boolean).sort();
}
