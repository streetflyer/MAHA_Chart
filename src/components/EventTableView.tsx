import { useMemo, useState } from "react";
import type { Dataset } from "../model/datasets";
import {
  asNumber,
  eventTable,
  passes,
  type ColFilter,
} from "../model/pointSets";
import { usePointSetDialog } from "./PointSetDialog";

type Events = Extract<Dataset, { kind: "events" }>;
const MAX_ROWS = 5000;

/**
 * An events listing as charted, Excel style: a ▾ filter on every column, a tick box on every
 * row (and one to tick all), and "Add to plan view…" for the ticked rows.
 */
export function EventTableView({ d, onAdded }: { d: Events; onAdded(): void }) {
  const t = useMemo(() => eventTable(d), [d]);
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => {
    const rows = t.rows.filter((r) => passes(r.cells, t.cols, filters));
    if (sort) {
      const i = sort.col;
      rows.sort((a, b) => {
        const x = asNumber(a.cells[i] ?? "");
        const y = asNumber(b.cells[i] ?? "");
        const c =
          x !== null && y !== null
            ? x - y
            : (a.cells[i] ?? "").localeCompare(b.cells[i] ?? "");
        return c * sort.dir;
      });
    }
    return rows;
  }, [t, filters, sort]);
  const ticked = shown.filter((r) => !off.has(r.key));
  const allOn = ticked.length === shown.length && shown.length > 0;
  const tickAll = (on: boolean) =>
    setOff((o) => {
      const n = new Set(o);
      for (const r of shown) {
        if (on) n.delete(r.key);
        else n.add(r.key);
      }
      return n;
    });
  const add = () => {
    usePointSetDialog.getState().openNew(
      d.name,
      filters,
      shown.filter((r) => off.has(r.key)).map((r) => r.key),
      t.cols,
    );
    onAdded();
  };
  return (
    <>
      <div className="dv-table">
        <table>
          <thead>
            <tr className="head">
              <td className="dv-tick">
                <input
                  type="checkbox"
                  aria-label="Tick all rows"
                  data-tick-all
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = !allOn && ticked.length > 0;
                  }}
                  onChange={(e) => tickAll(e.target.checked)}
                />
              </td>
              <td className="dv-n" />
              {t.cols.map((c, j) => (
                <td key={j} className="dv-col">
                  <span>{c}</span>
                  <button
                    type="button"
                    className={`dv-filter-btn${filters[c] || sort?.col === j ? " on" : ""}`}
                    data-filter-col={j}
                    title="Sort and filter"
                    onClick={() => setOpen(open === j ? null : j)}
                  >
                    ▾
                  </button>
                  {open === j && (
                    <FilterPop
                      values={t.rows.map((r) => (r.cells[j] ?? "").trim())}
                      filter={filters[c]}
                      onSort={(dir) => {
                        setSort({ col: j, dir });
                        setOpen(null);
                      }}
                      onApply={(f) => {
                        setFilters((all) => {
                          const n = { ...all };
                          if (f) n[c] = f;
                          else delete n[c];
                          return n;
                        });
                        setOpen(null);
                      }}
                      onClose={() => setOpen(null)}
                    />
                  )}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, MAX_ROWS).map((r, i) => (
              <tr key={r.key} className={off.has(r.key) ? "off" : ""}>
                <td className="dv-tick">
                  <input
                    type="checkbox"
                    data-row-tick={r.key}
                    checked={!off.has(r.key)}
                    onChange={(e) =>
                      setOff((o) => {
                        const n = new Set(o);
                        if (e.target.checked) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="dv-n">{i + 1}</td>
                {r.cells.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dv-foot">
        <span className="hint" data-dv-count>
          {ticked.length} of {t.rows.length} rows ticked
          {shown.length < t.rows.length
            ? ` (${t.rows.length - shown.length} hidden by filters)`
            : ""}
          {shown.length > MAX_ROWS ? `, first ${MAX_ROWS} shown` : ""}.
        </span>
        {Object.keys(filters).length > 0 && (
          <button type="button" onClick={() => setFilters({})}>
            Clear all filters
          </button>
        )}
        <button
          type="button"
          className="primary"
          data-add-plan
          disabled={!ticked.length}
          onClick={add}
        >
          Add to plan view…
        </button>
      </div>
    </>
  );
}

/** The ▾ window of one column: sort, search, tick the values to keep, a number range. */
function FilterPop({
  values,
  filter,
  onSort,
  onApply,
  onClose,
}: {
  values: string[];
  filter?: ColFilter;
  onSort(dir: 1 | -1): void;
  onApply(f: ColFilter | null): void;
  onClose(): void;
}) {
  const distinct = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    const list = [...m.keys()];
    const num = list.every((v) => v === "" || asNumber(v) !== null);
    list.sort((a, b) =>
      num
        ? (asNumber(a) ?? -Infinity) - (asNumber(b) ?? -Infinity)
        : a.localeCompare(b),
    );
    return { list, num, count: m };
  }, [values]);
  const [q, setQ] = useState("");
  const [keep, setKeep] = useState<Set<string>>(
    new Set(filter?.values ?? distinct.list),
  );
  const [min, setMin] = useState(filter?.min?.toString() ?? "");
  const [max, setMax] = useState(filter?.max?.toString() ?? "");
  const list = distinct.list.filter((v) =>
    v.toLowerCase().includes(q.toLowerCase()),
  );
  const apply = () => {
    const f: ColFilter = {};
    if (keep.size < distinct.list.length) f.values = [...keep];
    const a = asNumber(min);
    const b = asNumber(max);
    if (a !== null) f.min = a;
    if (b !== null) f.max = b;
    onApply(Object.keys(f).length ? f : null);
  };
  const allOn = list.every((v) => keep.has(v));
  return (
    <div
      className="dv-filter-pop"
      data-filter-pop
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        if (e.key === "Enter") apply();
      }}
    >
      <button type="button" onClick={() => onSort(1)}>
        Sort {distinct.num ? "smallest to largest" : "A to Z"}
      </button>
      <button type="button" onClick={() => onSort(-1)}>
        Sort {distinct.num ? "largest to smallest" : "Z to A"}
      </button>
      {distinct.num && (
        <div className="dv-range">
          <label>
            From <input value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label>
            To <input value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
      )}
      <input
        type="search"
        placeholder="Search"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="dv-values">
        <label>
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) =>
              setKeep((k) => {
                const n = new Set(k);
                for (const v of list) {
                  if (e.target.checked) n.add(v);
                  else n.delete(v);
                }
                return n;
              })
            }
          />
          (Select all{q ? " shown" : ""})
        </label>
        {list.slice(0, 1000).map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              data-filter-value={v}
              checked={keep.has(v)}
              onChange={(e) =>
                setKeep((k) => {
                  const n = new Set(k);
                  if (e.target.checked) n.add(v);
                  else n.delete(v);
                  return n;
                })
              }
            />
            {v === "" ? "(Blanks)" : v}{" "}
            <span className="hint">{distinct.count.get(v)}</span>
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={() => onApply(null)}>
          Clear filter
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          data-filter-ok
          onClick={apply}
        >
          OK
        </button>
      </div>
    </div>
  );
}
