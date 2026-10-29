import type { ChartTemplate } from './types';

const KEY = 'mahachart.templates.v1';

/*
 * Saved user templates. Browser storage for now so the app works fully offline;
 * the team server (plan step 4) will add a shared library behind the same functions.
 */

function readAll(): ChartTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChartTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ChartTemplate[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function listUserTemplates(): ChartTemplate[] {
  return readAll().sort((a, b) => a.name.localeCompare(b.name));
}

/** Save under the template's name, replacing an existing user template with the same name. */
export function saveUserTemplate(t: ChartTemplate): ChartTemplate | null {
  const saved: ChartTemplate = { ...t, builtIn: false, updatedAt: new Date().toISOString() };
  const list = readAll().filter((x) => x.id !== saved.id && x.name !== saved.name);
  list.push(saved);
  return writeAll(list) ? saved : null;
}

export function deleteUserTemplate(id: string): void {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function exportTemplateFile(t: ChartTemplate): void {
  const blob = new Blob([JSON.stringify({ format: 'mahachart-template', version: 1, template: t }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t.name.replace(/[^\w.-]+/g, '_')}.mctemplate.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importTemplateFile(file: File): Promise<ChartTemplate> {
  const data = JSON.parse(await file.text());
  const t = (data?.format === 'mahachart-template' ? data.template : data) as ChartTemplate;
  if (!t || !Array.isArray(t.panels) || !t.paper || !t.scale) throw new Error('Not a MAHA Chart template file.');
  return { ...t, builtIn: false, texts: t.texts ?? [], fields: t.fields ?? {} };
}
