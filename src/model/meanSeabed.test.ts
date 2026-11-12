import { describe, expect, it } from 'vitest';
import { buildDataset, defaultMapping } from './importers';
import type { Table } from './tables';

const listing: Table = {
  name: 'listing.csv',
  rows: [
    ['KP', 'TOP', 'BOP', 'PORT ADJ', 'STB ADJ', 'PORT MSBL', 'STBD MSBL', 'MEAN ADJ', 'MEAN SEABED'],
    ['0.000', '-50.0', '-50.3', '-50.4', '-50.6', '-50.8', '-51.0', '-50.5', '-50.9'],
    ['0.001', '-50.1', '-50.4', '-50.2', '', '-51.0', '-51.2', '-50.2', '-51.1'],
  ],
};

describe('mean seabed lines from two columns', () => {
  it('finds the port and starboard pairs and averages them', () => {
    const m = defaultMapping('long', listing);
    expect([m.cols.adj, m.cols.adj2, m.cols.far, m.cols.far2]).toEqual([3, 4, 5, 6]);
    // The listing's own means aren't drawn twice.
    expect(m.series).toEqual([]);
    const d = buildDataset('long', 'listing.csv', listing, m);
    if (typeof d === 'string' || d.kind !== 'long') throw new Error(String(d));
    const names = d.series.map((s) => s.name);
    expect(names).toEqual(['TOP', 'BOP', 'Mean Adjacent Seabed', 'Mean Far Seabed']);
    expect(d.series[2].values[0]).toBeCloseTo(-50.5);
    // A blank column falls back to the other one.
    expect(d.series[2].values[1]).toBeCloseTo(-50.2);
    expect(d.series[3].values[1]).toBeCloseTo(-51.1);
    expect([d.top, d.bop]).toEqual([0, 1]);
  });
});
