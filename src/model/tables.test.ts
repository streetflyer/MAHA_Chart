import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guessColumns, hasHeader, parseDelimited, readXlsx } from './tables';

describe('tables', () => {
  it('reads every sheet of an .xlsx, with shared strings and blank cells', async () => {
    const buf = readFileSync(new URL('./fixtures/events.xlsx', import.meta.url));
    const sheets = await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(sheets.map((s) => s.name)).toEqual(['Notes', 'Events']);
    const ev = sheets[1].rows;
    expect(ev[0]).toEqual(['KP', 'Code', 'Value']);
    expect(ev[1]).toEqual(['0.5', 'AN.OK', 'Anode & joint']);
    expect(ev[2].slice(0, 2)).toEqual(['1.25', 'FJ.OK']);
    expect(ev[3][2]).toBe('Debris <1m>');
  });

  it('splits quoted CSV and finds header columns', () => {
    const t = parseDelimited('KP,DCC,EASTING,NORTHING,TOP\n0,0.79,333470.08,520040.35,91.95\n0.001,0.8,1,2,"3"', 'l.csv');
    expect(hasHeader(t.rows)).toBe(true);
    expect(guessColumns(t.rows, true, [{ key: 'kp', names: ['KP'] }, { key: 'e', names: ['EAST'] }])).toEqual({ kp: 0, e: 2 });
    expect(t.rows[2][4]).toBe('3');
    expect(parseDelimited('PP.SZ,0,"Wa=146kg/m, Wf=124"').rows[0]).toEqual(['PP.SZ', '0', 'Wa=146kg/m, Wf=124']);
    expect(parseDelimited('1 2 3\n4  5 6').rows[1]).toEqual(['4', '5', '6']);
  });
});
