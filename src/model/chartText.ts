import type { ChartTemplate, ChartText, Panel } from "./types";

/**
 * Text set for one chart only, over the text of all charts. Fields ({TITLE}, {PROJECT}…)
 * and the text of panels (title box, notes) can each be given for a single chart.
 */
const of = (t: ChartTemplate, i: number): ChartText =>
  t.chartText?.[String(i)] ?? {};

const bodyKey = (panelId: string, second = false) =>
  second ? `${panelId}#2` : panelId;

/** This chart's own value of a field, if it has one. */
export const chartField = (t: ChartTemplate, i: number, key: string) =>
  of(t, i).fields?.[key];

/** Every field this chart sets for itself. */
export const chartFields = (t: ChartTemplate, i: number) =>
  of(t, i).fields ?? {};

/** The text of a panel on chart i (its own, else the one of all charts). */
export function chartBody(
  t: ChartTemplate,
  i: number,
  p: Panel,
  second = false,
): string | undefined {
  return (
    of(t, i).bodies?.[bodyKey(p.id, second)] ?? (second ? p.body2 : p.body)
  );
}

export const hasChartBody = (
  t: ChartTemplate,
  i: number,
  panelId: string,
  second = false,
) => of(t, i).bodies?.[bodyKey(panelId, second)] !== undefined;

function withChart(
  t: ChartTemplate,
  i: number,
  fn: (c: ChartText) => ChartText,
): ChartTemplate {
  const all = { ...(t.chartText ?? {}) };
  const c = fn({
    fields: { ...(of(t, i).fields ?? {}) },
    bodies: { ...(of(t, i).bodies ?? {}) },
  });
  const empty =
    !Object.keys(c.fields ?? {}).length && !Object.keys(c.bodies ?? {}).length;
  if (empty) delete all[String(i)];
  else all[String(i)] = c;
  return { ...t, chartText: Object.keys(all).length ? all : undefined };
}

/**
 * Set a field: for chart i only, or for every chart (which also drops chart i's own
 * value, so the chart shows what was just typed).
 */
export function setChartField(
  t: ChartTemplate,
  i: number,
  key: string,
  value: string,
  onlyThis: boolean,
): ChartTemplate {
  if (onlyThis)
    return withChart(t, i, (c) => ({
      ...c,
      fields: { ...c.fields, [key]: value },
    }));
  const out = withChart(t, i, (c) => {
    const fields = { ...c.fields };
    delete fields[key];
    return { ...c, fields };
  });
  return { ...out, fields: { ...out.fields, [key]: value } };
}

/** Drop chart i's own value of a field. */
export const clearChartField = (t: ChartTemplate, i: number, key: string) =>
  withChart(t, i, (c) => {
    const fields = { ...c.fields };
    delete fields[key];
    return { ...c, fields };
  });

/** Set a panel's text: for chart i only, or for every chart. */
export function setChartBody(
  t: ChartTemplate,
  i: number,
  panelId: string,
  value: string,
  onlyThis: boolean,
  second = false,
): ChartTemplate {
  const k = bodyKey(panelId, second);
  if (onlyThis)
    return withChart(t, i, (c) => ({
      ...c,
      bodies: { ...c.bodies, [k]: value },
    }));
  const out = withChart(t, i, (c) => {
    const bodies = { ...c.bodies };
    delete bodies[k];
    return { ...c, bodies };
  });
  return {
    ...out,
    panels: out.panels.map((p) =>
      p.id === panelId ? { ...p, [second ? "body2" : "body"]: value } : p,
    ),
  };
}
