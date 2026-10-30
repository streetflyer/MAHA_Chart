import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { TARGETS, extOf, targetInfo, targetsFor, type ImportTarget } from '../model/datasets';
import { parseDxfLinework, type Linework } from '../model/dxf';
import { newId } from '../model/ids';
import { FIELDS, buildDataset, defaultMapping, dxfLayers, type Mapping } from '../model/importers';
import { parseDelimited, readXlsx, type Table } from '../model/tables';
import { useEditor } from '../state/store';
import { useSurvey } from '../state/surveyData';
import { fitInto, readImageFile } from './imageImport';
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
  /** Sheets of a workbook, or the one table of a text file. */
  tables?: Table[];
  lw?: Linework;
  mapping: Mapping;
  /** Logo panel to place an image in. */
  panelId?: string;
  error?: string;
  loading: boolean;
}

const IMAGE_EXT = TARGETS.find((t) => t.key === 'logo')!.exts;

/** The panel types a drop target maps onto. */
function guessTarget(name: string, panelType: string | undefined, hasRoute: boolean, firstRow?: string[]): ImportTarget {
  const options = targetsFor(name);
  const byPanel = options.find((t) => t.panelType === panelType && (t.key !== 'route' || !hasRoute));
  if (byPanel) return byPanel.key;
  const ext = extOf(name);
  if (IMAGE_EXT.includes(ext)) return 'logo';
  if (ext === 'dxf') return panelType === 'keyplan' ? 'siteplan' : hasRoute ? 'plan' : 'route';
  if (ext === 'dig' || ext === 'xyz' || ext === 'rlx' || ext === 'rlxp') return hasRoute ? 'plan' : 'route';
  if (ext === 'long') return 'long';
  if (ext === 'xlsx' || ext === 'xls') return 'events';
  const h = (firstRow ?? []).join(' ').toUpperCase();
  if (/\bCODE\b|EVENT/.test(h)) return 'events';
  if (/\bMV\b|\bCP\b/.test(h)) return 'cp';
  if (/TOP|BOP|SEABED/.test(h)) return 'long';
  if (/^\d{14,}/.test(firstRow?.[0] ?? '')) return 'trans';
  return options[0]?.key ?? 'plan';
}

/** RLX / RLXP route exports: pull easting/northing pairs out of the XML. */
function rlxTable(text: string): Table | null {
  const pairs: string[][] = [];
  const re = /<(?:[\w:]*?)(?:Easting|X)>\s*([-\d.eE+]+)\s*<\/[\w:]*?(?:Easting|X)>\s*<(?:[\w:]*?)(?:Northing|Y)>\s*([-\d.eE+]+)/g;
  for (const m of text.matchAll(re)) pairs.push([m[1], m[2]]);
  if (!pairs.length) {
    for (const m of text.matchAll(/\b(?:x|easting)="([-\d.eE+]+)"[^>]*?\b(?:y|northing)="([-\d.eE+]+)"/gi)) pairs.push([m[1], m[2]]);
  }
  return pairs.length ? { name: 'route', rows: [['EASTING', 'NORTHING'], ...pairs] } : null;
}

async function readItem(file: File, target: ImportTarget): Promise<Partial<Item>> {
  const ext = extOf(file.name);
  if (IMAGE_EXT.includes(ext)) return {};
  if (ext === 'dxf') {
    const lw = parseDxfLinework(await file.text(), file.name);
    if (!lw) return { error: 'No lines, polylines, arcs or text found (binary DXF is not supported; save as ASCII DXF).' };
    const layer = target === 'route' ? dxfLayers(lw)[0]?.layer : undefined;
    return { lw, mapping: { ...defaultMapping(target, null), layer } };
  }
  if (ext === 'xls') return { error: 'Old .xls workbooks can’t be read in the browser. Save it as .xlsx or .csv and import that.' };
  if (ext === 'xlsx') {
    const tables = await readXlsx(await file.arrayBuffer());
    const sheet = Math.max(0, tables.findIndex((t) => t.rows.length > 1));
    return { tables, mapping: { ...defaultMapping(target, tables[sheet] ?? null), sheet } };
  }
  const text = await file.text();
  let table: Table | null = null;
  if (ext === 'rlx' || ext === 'rlxp') table = rlxTable(text);
  if (!table) table = parseDelimited(text.split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n'), file.name);
  if (!table.rows.length) return { error: 'The file is empty.' };
  return { tables: [table], mapping: defaultMapping(target, table) };
}

export function ImportDialog({ initial, dropPanelType, onClose, onNotice }: { initial: File[]; dropPanelType?: string; onClose(): void; onNotice(m: string): void }) {
  const template = useEditor((s) => s.template)!;
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoPanels = template.panels.filter((p) => p.type === 'logo');
  const eventsPanel = template.panels.find((p) => p.type === 'events');

  async function add(files: File[]) {
    const hasRoute = !!useSurvey.getState().route || items.some((i) => i.target === 'route');
    const fresh: Item[] = files.map((file) => ({
      id: newId(),
      file,
      target: guessTarget(file.name, dropPanelType, hasRoute),
      mapping: defaultMapping('plan', null),
      panelId: logoPanels[0]?.id,
      loading: true,
    }));
    setItems((xs) => [...xs, ...fresh]);
    setCurrent((c) => c ?? fresh[0]?.id ?? null);
    for (const it of fresh) {
      try {
        const got = await readItem(it.file, it.target);
        // Content can sharpen the guess (e.g. a CSV whose header says CODE).
        const firstRow = got.tables?.[0]?.rows[0];
        const target = targetsFor(it.file.name).length > 1 && firstRow ? guessTarget(it.file.name, dropPanelType, hasRoute, firstRow) : it.target;
        const t = got.tables?.[got.mapping?.sheet ?? 0] ?? null;
        const mapping = target !== it.target ? { ...defaultMapping(target, t), sheet: got.mapping?.sheet ?? 0 } : (got.mapping ?? it.mapping);
        if (target === 'events') mapping.rowId = eventsPanel?.rows?.[0]?.id;
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...got, target, mapping, loading: false } : x)));
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

  function changeTarget(target: ImportTarget) {
    if (!it) return;
    const mapping = { ...defaultMapping(target, table), sheet: it.mapping.sheet, layer: target === 'route' && it.lw ? dxfLayers(it.lw)[0]?.layer : undefined };
    if (target === 'events') mapping.rowId = eventsPanel?.rows?.[0]?.id;
    update(it.id, { target, mapping });
  }

  async function runImport() {
    setBusy(true);
    const done: string[] = [];
    const failed: string[] = [];
    const s = useEditor.getState();
    for (const x of items) {
      if (x.error || x.loading) continue;
      if (x.target === 'logo') {
        const panel = template.panels.find((p) => p.id === x.panelId);
        if (!panel) {
          failed.push(`${x.file.name}: pick a logo panel`);
          continue;
        }
        try {
          const img = await readImageFile(x.file);
          const top = titleInsideHeight(panel) || 1;
          const r = fitInto(img.width, img.height, { x: 1.5, y: top, w: panel.w - 3, h: panel.h - top - 1.5 });
          s.addImage({ panelId: panel.id, ...r, src: img.src, name: x.file.name });
          done.push(`${x.file.name} → ${panel.title}`);
        } catch (e) {
          failed.push(`${x.file.name}: ${(e as Error).message}`);
        }
        continue;
      }
      const t = x.tables?.[x.mapping.sheet] ?? null;
      const d = buildDataset(x.target, x.file.name, t, x.mapping, x.lw);
      if (typeof d === 'string') {
        failed.push(`${x.file.name}: ${d}`);
        continue;
      }
      useSurvey.getState().addDataset(d);
      if (d.kind === 'route') s.setScale({ routeLength: Math.round(d.route.length * 1000) / 1000, sheets: undefined });
      done.push(`${x.file.name} → ${targetInfo(x.target).label}`);
    }
    setBusy(false);
    if (failed.length) {
      onNotice(`Not imported: ${failed.join('; ')}`);
      setItems((xs) => xs.filter((x) => failed.some((f) => f.startsWith(x.file.name))));
      return;
    }
    if (done.length) onNotice(`Imported ${done.join('; ')}.`);
    onClose();
  }

  const fields = it ? (FIELDS[it.target] ?? []) : [];
  const header = table && it?.mapping.header ? table.rows[0] : null;
  const preview = table ? table.rows.slice(it!.mapping.header ? 1 : 0, (it!.mapping.header ? 1 : 0) + 8) : [];
  const nCols = table ? Math.min(40, Math.max(...table.rows.slice(0, 20).map((r) => r.length))) : 0;
  const colName = (i: number) => (header?.[i] ? `${i + 1}: ${header[i]}` : `Column ${i + 1}`);
  const mapped = new Set(Object.values(it?.mapping.cols ?? {}));

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
          <div className="import-files">
            {items.length === 0 && (
              <button type="button" className="drop-zone" onClick={() => fileRef.current?.click()}>
                Drop files here or click to choose
              </button>
            )}
            <ul>
              {items.map((x) => (
                <li key={x.id} className={x.id === current ? 'active' : ''} onClick={() => setCurrent(x.id)}>
                  <span className="fname" title={x.file.name}>
                    {x.file.name}
                  </span>
                  <span className={x.error ? 'status error' : 'status'}>{x.loading ? 'Reading…' : x.error ? 'Can’t read' : targetInfo(x.target).label}</span>
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
            <button type="button" onClick={() => fileRef.current?.click()}>
              Add files…
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void add([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </div>

          <div className="import-map">
            {!it && <p>Choose a file on the left to set where it goes and which columns to use.</p>}
            {it?.error && <p className="error">{it.error}</p>}
            {it && !it.error && !it.loading && (
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
                  {it.tables && it.tables.length > 1 && (
                    <label className="field">
                      <span>Sheet</span>
                      <select
                        value={it.mapping.sheet}
                        onChange={(e) => {
                          const sheet = Number(e.target.value);
                          update(it.id, { mapping: { ...defaultMapping(it.target, it.tables![sheet]), sheet, rowId: it.mapping.rowId } });
                        }}
                      >
                        {it.tables.map((t, i) => (
                          <option key={i} value={i}>
                            {t.name}
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
                    <select value={it.panelId ?? ''} onChange={(e) => update(it.id, { panelId: e.target.value })}>
                      {logoPanels.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {it.lw && (
                  <p className="hint">
                    {it.lw.lines.length} lines and {it.lw.texts.length} texts on {new Set(it.lw.layers).size} layers.
                  </p>
                )}
                {it.lw && it.target === 'route' && (
                  <label className="field">
                    <span>Layer with the route line (the longest line on it is used)</span>
                    <select value={it.mapping.layer ?? ''} onChange={(e) => setMapping({ layer: e.target.value })}>
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
                    <div className="checks">
                      <label className="check">
                        <input type="checkbox" checked={it.mapping.header} onChange={(e) => setMapping({ header: e.target.checked })} /> First row is column names
                      </label>
                      {fields.some((f) => f.key === 'kp') && (
                        <label className="check">
                          KP in
                          <select value={it.mapping.kpUnit} onChange={(e) => setMapping({ kpUnit: e.target.value as Mapping['kpUnit'] })}>
                            <option value="km">km</option>
                            <option value="m">metres</option>
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="map-fields">
                      {fields.map((f) => (
                        <label key={f.key} className="field">
                          <span>
                            {f.label}
                            {f.required ? '' : ' (optional)'}
                          </span>
                          <select
                            value={it.mapping.cols[f.key] ?? ''}
                            onChange={(e) => {
                              const cols = { ...it.mapping.cols };
                              if (e.target.value === '') delete cols[f.key];
                              else cols[f.key] = Number(e.target.value);
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
                        </label>
                      ))}
                      {it.target === 'events' && (
                        <label className="field">
                          <span>Row in the events panel</span>
                          <select value={it.mapping.rowId ?? ''} onChange={(e) => setMapping({ rowId: e.target.value })}>
                            {(eventsPanel?.rows ?? []).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {it.target === 'cp' && (
                        <label className="field">
                          <span>Draw as</span>
                          <select value={it.mapping.cpStyle} onChange={(e) => setMapping({ cpStyle: e.target.value as Mapping['cpStyle'] })}>
                            <option value="line">Line (gradient CP)</option>
                            <option value="ticks">Ticks (stab CP)</option>
                          </select>
                        </label>
                      )}
                    </div>
                    {it.target === 'long' && (
                      <div className="checks">
                        <span>Draw:</span>
                        {Array.from({ length: nCols }, (_, i) => i)
                          .filter((i) => i !== it.mapping.cols.kp)
                          .map((i) => (
                            <label key={i} className="check">
                              <input
                                type="checkbox"
                                checked={it.mapping.series.includes(i)}
                                onChange={(e) => setMapping({ series: e.target.checked ? [...it.mapping.series, i].sort((a, b) => a - b) : it.mapping.series.filter((c) => c !== i) })}
                              />
                              {header?.[i] || `Column ${i + 1}`}
                            </label>
                          ))}
                      </div>
                    )}
                    <div className="preview-wrap">
                      <table className="preview">
                        <thead>
                          <tr>
                            {Array.from({ length: nCols }, (_, i) => (
                              <th key={i} className={mapped.has(i) || it.mapping.series.includes(i) ? 'mapped' : ''}>
                                {header?.[i] || i + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((r, ri) => (
                            <tr key={ri}>
                              {Array.from({ length: nCols }, (_, i) => (
                                <td key={i} className={mapped.has(i) || it.mapping.series.includes(i) ? 'mapped' : ''}>
                                  {(r[i] ?? '').slice(0, 24)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="hint">{table.rows.length.toLocaleString()} rows.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <span className="push-left hint">Files stay on this computer; nothing is uploaded.</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy || !items.some((x) => !x.error && !x.loading)} onClick={() => void runImport()}>
            Import {items.filter((x) => !x.error && !x.loading).length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}
