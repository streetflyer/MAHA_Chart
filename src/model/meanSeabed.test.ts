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

describe('9-point listing with a # header', () => {
  it('keeps the header and maps pipe and seabed columns', async () => {
    const { dropComments, parseDelimited, findHeaderRow } = await import('./tables');
    const text = [
      '#Pipe - Time (YYYYMMDD);Pipe - KP;Pipe - Easting;Pipe - Northing;Pipe - Latitude DD:MM:SS.SSSS;Pipe - Longitude DDD:MM:SS.SSSS;Pipe - Bottom of pipe;Pipe - Diameter;Pipe - Depth;LeftSeabedInner - Depth;SBL_1 - Depth;SBL_2 - Depth;LeftSeabedOuter - Depth;RightSeabedInner - Depth;SBR_1 - Depth;SBR_2 - Depth;RightSeabedOuter - Depth',
      '01/11/2026 01:58:50;0.000;583568.839;9852007.571;01:20:19.7364;117:45:04.2988;805.7;0.186;805.523;805.6;805.6;805.7;805.8;805.6;805.6;805.7;805.9',
      '01/11/2026 01:58:51;0.001;583568.9;9852007.6;01:20:19.7364;117:45:04.2988;805.7;0.186;805.523;805.6;805.6;805.7;805.8;805.6;805.6;805.7;805.9',
    ].join('\n');
    const t = parseDelimited(dropComments(text), 'x.txt');
    expect(t.rows[0][1]).toBe('Pipe - KP');
    expect(findHeaderRow(t.rows)).toBe(0);
    const m = defaultMapping('long', t);
    expect(m.cols).toMatchObject({ kp: 1, top: 8, bop: 6, adj: 9, adj2: 13, far: 12, far2: 16 });
  });
  it('still drops plain comments', async () => {
    const { dropComments } = await import('./tables');
    expect(dropComments('#unit=m\n#Type=Pipe\n1 2 3')).toBe('1 2 3');
  });
});
