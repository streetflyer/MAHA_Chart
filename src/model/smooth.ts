/**
 * Local smoothing of a profile's depth, like the Local smooth tool of NaviModel: each
 * node becomes the weighted mean of itself and `n` nodes each side (bell-shaped weights,
 * so near nodes count more). The window shrinks at the ends; gaps (NaN) are skipped.
 */
export function smoothLocal(values: Float64Array, n: number): Float64Array {
  const w = Math.round(n);
  if (!(w > 0)) return values;
  const sigma = Math.max(0.5, w / 2);
  const weight = Array.from({ length: w + 1 }, (_, k) =>
    Math.exp(-(k * k) / (2 * sigma * sigma)),
  );
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      out[i] = values[i];
      continue;
    }
    let sum = 0;
    let wt = 0;
    for (
      let k = Math.max(0, i - w);
      k <= Math.min(values.length - 1, i + w);
      k++
    ) {
      const v = values[k];
      if (!Number.isFinite(v)) continue;
      const g = weight[Math.abs(k - i)];
      sum += v * g;
      wt += g;
    }
    out[i] = sum / wt;
  }
  return out;
}

/**
 * A copy of `values` with nodes a..b (inclusive) smoothed over `n` nodes each side;
 * the rest stays as it was. This is what the helper line of the smooth tool applies.
 */
export function smoothRange(
  values: Float64Array,
  a: number,
  b: number,
  n: number,
): Float64Array {
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(values.length - 1, Math.max(a, b));
  const out = Float64Array.from(values);
  if (!(Math.round(n) > 0)) return out;
  const full = smoothLocal(
    values.subarray(Math.max(0, lo - Math.round(n)), hi + Math.round(n) + 1),
    n,
  );
  const off = lo - Math.max(0, lo - Math.round(n));
  for (let i = lo; i <= hi; i++) out[i] = full[i - lo + off];
  return out;
}
