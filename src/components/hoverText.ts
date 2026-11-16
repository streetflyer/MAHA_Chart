import type { Dataset } from "../model/datasets";
import { pointsOf } from "../model/cpEdit";
import { nearestChainage, pointAt, type Route } from "../model/route";

const kmTxt = (m: number) => (m / 1000).toFixed(3);

/** Value of a sampled series at kp (linear between samples), or NaN off its ends. */
export function valueAt(kp: Float64Array, v: Float64Array, at: number): number {
  const n = kp.length;
  if (!n || at < kp[0] || at > kp[n - 1]) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kp[mid] <= at) lo = mid;
    else hi = mid;
  }
  const a = v[lo];
  const b = v[hi];
  if (hi === lo || kp[hi] === kp[lo]) return a;
  const f = (at - kp[lo]) / (kp[hi] - kp[lo]);
  return a + (b - a) * f;
}

/** What hover info says at a KP in a KP panel: the KP, then the data there. */
export function kpPanelLines(
  title: string,
  kp: number,
  sets: Dataset[],
  /** Metres either side counted as "here" for single readings. */
  tol: number,
): string[] {
  const out = [title, `KP ${kmTxt(kp)}`];
  for (const d of sets) {
    if (d.kind === "long") {
      for (const s of d.series.slice(0, 6)) {
        const v = valueAt(d.kp, s.values, kp);
        if (Number.isFinite(v)) out.push(`${s.name}: ${v.toFixed(2)}`);
      }
    } else if (d.kind === "cp") {
      let best: { kp: number; mv: number } | null = null;
      for (const p of pointsOf(d))
        if (
          Math.abs(p.kp - kp) <= tol &&
          (!best || Math.abs(p.kp - kp) < Math.abs(best.kp - kp))
        )
          best = p;
      if (best) out.push(`CP ${best.mv} mV at KP ${kmTxt(best.kp)}`);
    } else if (d.kind === "events") {
      const near = d.records.filter((r) => Math.abs(r.kp - kp) <= tol);
      for (const r of near.slice(0, 4))
        out.push(
          `${r.code}${r.value ? ` ${r.value}` : ""} at KP ${kmTxt(r.kp)}`,
        );
    } else if (d.kind === "trans") {
      let best: number | null = null;
      for (const p of d.profiles)
        if (
          Math.abs(p.kp - kp) <= tol * 4 &&
          (best === null || Math.abs(p.kp - kp) < Math.abs(best - kp))
        )
          best = p.kp;
      if (best !== null) out.push(`Cross profile at KP ${kmTxt(best)}`);
    }
  }
  return out;
}

/** Hover info in the plan view: grid coordinates, then the KP and offset from the line. */
export function planLines(
  e: number,
  n: number,
  route: Route | null,
  k0: number,
): string[] {
  const out = ["Plan view", `E ${e.toFixed(2)}`, `N ${n.toFixed(2)}`];
  if (route) {
    const c = nearestChainage(route, e, n);
    const [pe, pn] = pointAt(route, c);
    const [qe, qn] = pointAt(route, Math.min(route.length, c + 0.5));
    const [re, rn] = pointAt(route, Math.max(0, c - 0.5));
    const side = (qe - re) * (n - rn) - (qn - rn) * (e - re);
    const off = Math.hypot(e - pe, n - pn);
    out.push(`KP ${kmTxt(k0 + c)}`);
    out.push(
      `Offset ${off.toFixed(2)} m${off < 0.005 ? "" : side > 0 ? " left" : " right"}`,
    );
  }
  return out;
}
