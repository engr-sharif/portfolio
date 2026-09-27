import { describe, it, expect } from 'vitest';
import { scanText, scanEntry, withTerm, normalise, EMPTY_WATCHLIST } from '../src/studio/confidentiality';

const kinds = (t: string, field = 'body') => scanText(t, field).map((f) => [f.kind, f.match]);

describe('confidentiality rules', () => {
  it('flags precise coordinates, not rounded ones', () => {
    expect(kinds('Boring B-3 at 38.58123, -121.49377.')).toEqual([['coords', '38.58123'], ['coords', '-121.49377']]);
    expect(kinds('Near 38.58, -121.49.')).toEqual([]);
    expect(kinds('At 38°34′52″ N')).toEqual([['coords', '38°34′52″']]);
  });
  it('flags concentrations with units, in any spelling of micro', () => {
    expect(kinds('TCE at 1,250 µg/L and lead at 820 mg/kg; PFOA 12 ng/L; 3.4 ug/L')).toEqual([
      ['result', '1,250 µg/L'], ['result', '820 mg/kg'], ['result', '12 ng/L'], ['result', '3.4 ug/L'],
    ]);
    expect(kinds('Samples were analysed by EPA Method 8260.')).toEqual([]);
  });
  it('flags addresses, parcels and phone numbers', () => {
    expect(kinds('The site at 1420 North Market Blvd. was graded.')).toEqual([['address', '1420 North Market Blvd.']]);
    expect(kinds('APN 012-345-67 and 045-120-11')).toEqual([['parcel', 'APN 012-345-67'], ['parcel', '045-120-11']]);
    expect(kinds('Call (916) 555-0142.')).toEqual([['phone', '(916) 555-0142']]);
  });
  it('ignores link targets, image paths and code in the body', () => {
    expect(kinds('See [the map](https://example.com/?ll=38.581234,-121.493771) and ![a core](/img/38.12345.jpg).')).toEqual([]);
    expect(kinds('```\nx = 38.581234\n```')).toEqual([]);
  });
  it('gives context around each finding', () => {
    const [f] = scanText('Groundwater beneath the facility held 1,250 µg/L of TCE in 2019.', 'body');
    expect(f.before).toContain('facility held ');
    expect(f.after).toContain(' of TCE');
  });
});

describe('watch list', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normalise('  Café-Ltd. ')).toBe('cafe ltd');
  });
  it('stores hashes only, and finds names in any case or spacing', async () => {
    let list = await withTerm(EMPTY_WATCHLIST, 'Acme Metals');
    list = await withTerm(list, 'Riverside');
    expect(JSON.stringify(list)).not.toMatch(/acme|riverside/i);
    expect(list.maxWords).toBe(2);
    const hits = await scanEntry({ title: 'Former ACME  metals yard', lat: 38.58 }, 'Work near riverside homes.', list);
    expect(hits.map((h) => [h.kind, h.field, h.match])).toEqual([['watch', 'title', 'ACME  metals'], ['watch', 'body', 'riverside']]);
  });
  it('adds once and removes cleanly', async () => {
    const a = await withTerm(EMPTY_WATCHLIST, 'Acme');
    expect(await withTerm(a, 'ACME')).toBe(a);
    const b = await withTerm(a, 'acme', true);
    expect(b.hashes).toEqual([]);
  });
  it('skips coordinates the site rounds for itself and file paths', async () => {
    const hits = await scanEntry({ lat: 38.581234, lng: -121.493771, coverImage: '/media/38.123456.jpg', audioPeaks: '1,2,3' }, '', EMPTY_WATCHLIST);
    expect(hits).toEqual([]);
  });
});
