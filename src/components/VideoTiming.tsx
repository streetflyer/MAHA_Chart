import { useRef, useState } from "react";
import { parseDelimited, readXlsx } from "../model/tables";
import { parseVideoRows } from "../model/video";
import { useVideo } from "../state/video";
import { askConfirm } from "./Dialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { productKey } from "../model/video";
import { DraftNumber } from "./DataStyleControls";

/**
 * Left-panel list of the products' video start and end. Drop or upload the survey summary
 * (Excel, CSV or a pasted table); every date and time stays editable. The Video row of the
 * Engineering Events panel prints the dates of its product from here.
 */
export function VideoTiming({ onNotice }: { onNotice(m: string): void }) {
  const v = useVideo();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  function rowMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    const r = v.rows.find((x) => x.id === id)!;
    const key = productKey(r.product);
    const same = v.rows.filter((x) => productKey(x.product) === key);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Remove this line", action: () => v.remove(id) },
        {
          label: `Remove all ${same.length} lines of ${key || "this product"}`,
          disabled: same.length < 2,
          action: () =>
            v.setRows(v.rows.filter((x) => productKey(x.product) !== key)),
        },
        "separator",
        { label: "Remove all lines", action: () => v.setRows([]) },
      ],
    });
  }

  async function readFiles(files: File[]) {
    for (const f of files) {
      try {
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)) {
          const url = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(r.error);
            r.readAsDataURL(f);
          });
          v.setImage({ name: f.name, url });
          onNotice(
            `${f.name} is shown below to read from: a picture can't be read automatically, so type the dates in, or drop the Excel file.`,
          );
          continue;
        }
        const tables = /\.xlsx?$/i.test(f.name)
          ? await readXlsx(await f.arrayBuffer())
          : [parseDelimited(await f.text(), f.name)];
        const rows = tables.flatMap((t) => parseVideoRows(t.rows));
        if (!rows.length) {
          onNotice(`No product with a start and end date found in ${f.name}.`);
          continue;
        }
        if (
          v.rows.length &&
          (await askConfirm(
            "Replace the video log?",
            `${f.name} has ${rows.length} lines. OK replaces the ${v.rows.length} lines now listed; Cancel adds these to them.`,
            "Replace",
            false,
          ))
        )
          v.setRows(rows);
        else v.addRows(rows);
        onNotice(`Read ${rows.length} video lines from ${f.name}.`);
      } catch (e) {
        onNotice(`${f.name}: ${(e as Error).message}`);
      }
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const rows = parseVideoRows(parseDelimited(text, "pasted").rows);
      if (!rows.length)
        return onNotice("The clipboard holds no table with dates.");
      v.addRows(rows);
      onNotice(`Added ${rows.length} lines from the clipboard.`);
    } catch {
      onNotice("The browser did not allow reading the clipboard.");
    }
  }

  return (
    <section
      className={`video-timing${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        void readFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="project-head">
        <h4>Video timing</h4>
        <button
          type="button"
          className="link"
          onClick={() => setOpen((o) => !o)}
          title={open ? "Hide" : "Show"}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && (
        <>
          <div className="project-actions">
            <button
              type="button"
              onClick={() => input.current?.click()}
              title="Excel, CSV or a picture of the summary table"
            >
              Import…
            </button>
            <button type="button" onClick={() => void paste()}>
              Paste table
            </button>
            <button type="button" onClick={() => v.add()}>
              Add line
            </button>
          </div>
          {!v.rows.length && (
            <p className="hint">
              Drop the survey summary here (Excel or CSV with product, start and
              end date and time).
            </p>
          )}
          <ul className="video-list">
            {v.rows.map((r) => (
              <li
                key={r.id}
                onContextMenu={(e) => rowMenu(e, r.id)}
                title="Right-click to remove"
              >
                <input
                  className="v-product"
                  placeholder="Product, e.g. Umbilical UMB1"
                  value={r.product}
                  onChange={(e) => v.update(r.id, { product: e.target.value })}
                />
                <label>
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    value={r.start}
                    onChange={(e) => v.update(r.id, { start: e.target.value })}
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    type="datetime-local"
                    value={r.end}
                    onChange={(e) => v.update(r.id, { end: e.target.value })}
                  />
                </label>
                <input
                  className="v-remarks"
                  placeholder="Remarks"
                  value={r.remarks}
                  onChange={(e) => v.update(r.id, { remarks: e.target.value })}
                />
                <button
                  type="button"
                  className="link"
                  title="Remove this line"
                  onClick={() => v.remove(r.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <label
            className="video-join"
            title="Lines of one product closer together than this are printed as one period"
          >
            <span>Join lines closer than</span>
            <DraftNumber
              step={1}
              min={0}
              value={v.joinHours}
              onCommit={(h) => v.setJoin(h)}
            />
            <span>h</span>
          </label>
          {v.image && (
            <figure className="video-image">
              <img src={v.image.url} alt={v.image.name} />
              <figcaption>
                {v.image.name}{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() => v.setImage(null)}
                >
                  remove
                </button>
              </figcaption>
            </figure>
          )}
        </>
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
        ref={input}
        type="file"
        hidden
        multiple
        accept=".xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.bmp"
        onChange={(e) => {
          void readFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
