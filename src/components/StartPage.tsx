import { useMemo, useRef, useState } from 'react';
import { BUILTIN_TEMPLATES } from '../model/builtinTemplates';
import { newId } from '../model/ids';
import { paperDimensions, resizePaper } from '../model/paper';
import { syncScaleToPlan } from '../model/scale';
import { deleteUserTemplate, importTemplateFile, listUserTemplates } from '../model/storage';
import type { ChartTemplate, PaperSizeName } from '../model/types';
import { askConfirm } from './Dialog';
import { TemplateThumb } from './TemplateThumb';

export function StartPage({ onOpen }: { onOpen(t: ChartTemplate): void }) {
  const builtins = useMemo(() => BUILTIN_TEMPLATES.map((f) => f()), []);
  const [users, setUsers] = useState(() => listUserTemplates());
  const all = [...builtins, ...users];
  const [selectedId, setSelectedId] = useState(all[0].id);
  const [paper, setPaper] = useState<PaperSizeName | 'template'>('template');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = all.find((t) => t.id === selectedId) ?? all[0];

  function open(t: ChartTemplate) {
    if (paper === 'template' || paper === t.paper.size) return onOpen(t);
    const [w, h] = paperDimensions(paper, t.paper.orientation);
    const r = resizePaper(t, w, h);
    onOpen(syncScaleToPlan({ ...r, paper: { ...r.paper, size: paper } }));
  }

  async function importFile(f: File) {
    try {
      const t = await importTemplateFile(f);
      onOpen({ ...t, id: newId('tpl') });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="start">
      <header>
        <h1>MAHA Chart</h1>
        <p>Survey alignment and North-Up chart maker</p>
      </header>
      <section className="start-open">
        <label className="field">
          <span>Chart template</span>
          <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
            <optgroup label="Built-in">
              {builtins.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {users.length > 0 && (
              <optgroup label="My templates">
                {users.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="field">
          <span>Paper</span>
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperSizeName | 'template')}>
            <option value="template">As template ({selected.paper.size})</option>
            {(['A0', 'A1', 'A2', 'A3', 'A4'] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => open(selected)}>
          Open template
        </button>
        <button onClick={() => fileRef.current?.click()}>Import template file…</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
        {!selected.builtIn && (
          <button
            className="danger"
            onClick={async () => {
              if (!(await askConfirm('Delete template?', `"${selected.name}" will be removed from your template library.`, 'Delete', true))) return;
              deleteUserTemplate(selected.id);
              const next = listUserTemplates();
              setUsers(next);
              setSelectedId(builtins[0].id);
            }}
          >
            Delete template
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </section>
      <section className="gallery">
        {all.map((t) => (
          <button key={t.id} className={`card${t.id === selected.id ? ' active' : ''}`} onClick={() => setSelectedId(t.id)} onDoubleClick={() => open(t)}>
            <TemplateThumb t={t} />
            <span className="card-name">{t.name}</span>
            <span className="card-meta">
              {t.builtIn ? 'Built-in' : 'My template'} · {t.paper.size} · 1:{t.scale.horizontal.toLocaleString('en-US')}
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
