import type { Dataset } from "./datasets";
import { smoothLocal } from "./smooth";
import { dropComments, parseDelimited, patchXlsx } from "./tables";

type Long = Extract<Dataset, { kind: "long" }>;

/** True when the profile still knows the file it was read from and which columns held TOP / BOP. */
export const canWriteBack = (d: Long) =>
  !!d.srcFile &&
  !!d.srcRows &&
  d.srcTopCol !== undefined &&
  d.top !== undefined;

/**
 * The imported file again, with TOP smoothed over `n` nodes each side and BOP moved
 * by the same amount (so the pipe keeps its diameter). Excel files keep everything else
 * as it was; text listings come back as a CSV of the same rows.
 */
export async function smoothedFile(
  d: Long,
  n: number,
): Promise<{ blob: Blob; name: string; changed: number }> {
  if (!canWriteBack(d))
    throw new Error(
      "This profile was not read from a file that is still known. Import the file again.",
    );
  const file = d.srcFile!;
  const rows = d.srcRows!;
  const raw = d.series[d.top!].values;
  const top = smoothLocal(raw, n);
  const bopRaw = d.bop !== undefined ? d.series[d.bop].values : undefined;
  const edits = new Map<number, Map<number, number>>();
  rows.forEach((r, i) => {
    const e = new Map<number, number>();
    e.set(d.srcTopCol!, top[i]);
    if (bopRaw && d.srcBopCol !== undefined)
      e.set(d.srcBopCol, bopRaw[i] + (top[i] - raw[i]));
    edits.set(r, e);
  });
  const base = file.name.replace(/\.[^.]+$/, "");
  if (/\.xlsx$/i.test(file.name)) {
    const { blob, changed } = await patchXlsx(
      await file.arrayBuffer(),
      d.srcSheet ?? 0,
      edits,
    );
    return { blob, name: `${base}_smoothed.xlsx`, changed };
  }
  const table = parseDelimited(dropComments(await file.text()), file.name);
  let changed = 0;
  for (const [r, e] of edits)
    for (const [c, v] of e) {
      if (!table.rows[r] || !Number.isFinite(v)) continue;
      table.rows[r][c] = String(Number(v.toFixed(6)));
      changed++;
    }
  const q = (x: string) =>
    /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  const csv = table.rows.map((r) => r.map(q).join(",")).join("\r\n");
  return {
    blob: new Blob([csv], { type: "text/csv" }),
    name: `${base}_smoothed.csv`,
    changed,
  };
}
