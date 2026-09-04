import { describe, it, expect } from 'vitest';
import { parse, stringify, cleanForSchema } from '../src/studio/frontmatter';

/**
 * The Studio's parser/serializer must round-trip every shape our content uses
 * without loss. The hand-rolled predecessor truncated multiline values and
 * turned "07430" into 7430 — these tests pin the behaviour that replaced it.
 */
const roundTrip = (data: Record<string, unknown>, body = '') => parse(stringify({ data, body }));

describe('frontmatter round-trip', () => {
  it('preserves multiline strings (code snippets)', () => {
    const codeSnippet = 'const x = 1;\nconst y = 2;\n\nprint(x + y)';
    expect(roundTrip({ codeSnippet }).data.codeSnippet).toBe(codeSnippet);
  });

  it('keeps numeric-looking strings as strings', () => {
    const { data } = roundTrip({ zip: '07430', version: '1.10', title: '2024' });
    expect(data.zip).toBe('07430');
    expect(data.version).toBe('1.10');
    expect(data.title).toBe('2024');
  });

  it('keeps real numbers, booleans and dates-as-strings', () => {
    const { data } = roundTrip({ order: 3, lat: 38.58, published: false, featured: true, startDate: '2023-06', pubDate: '2024-05-01' });
    expect(data.order).toBe(3);
    expect(data.lat).toBe(38.58);
    expect(data.published).toBe(false);
    expect(data.featured).toBe(true);
    expect(data.startDate).toBe('2023-06');
    expect(data.pubDate).toBe('2024-05-01');
  });

  it('handles strings with YAML-significant characters', () => {
    const cases = ['Client: Site A', 'Title with #hash', '[bracketed]', 'quote "inside"', "it's", 'a: b: c', '- leading dash', '  padded  ', '@handle', 'yes', 'null', '~'];
    for (const s of cases) expect(roundTrip({ s }).data.s).toBe(s);
  });

  it('round-trips lists of strings and lists of objects', () => {
    const techniques = ['XRF scanning', 'Groundwater sampling: low-flow', 'Title 27 CQA'];
    const photos = [{ image: '/src/assets/gallery/a.jpg', alt: 'Well, sampled', caption: '', lat: 38.58, lng: -121.49 }];
    const { data } = roundTrip({ techniques, photos });
    expect(data.techniques).toEqual(techniques);
    expect(data.photos).toEqual(photos);
  });

  it('preserves the markdown body exactly, including fences and blank lines', () => {
    const body = '## Heading\n\nParagraph with --- dashes inside.\n\n```py\nprint("hi")\n```\n\n---\n\nAfter a rule.\n';
    expect(roundTrip({ title: 'x' }, body).body).toBe(body);
  });

  it('drops null/undefined but keeps empty strings', () => {
    const out = stringify({ data: { a: undefined, b: null, c: '', d: 0 }, body: '' });
    expect(out).not.toMatch(/^a:/m);
    expect(out).not.toMatch(/^b:/m);
    expect(parse(out).data).toEqual({ c: '', d: 0 });
  });

  it('serialises an empty document to a bare fence', () => {
    expect(stringify({ data: {}, body: 'hi' })).toBe('---\n---\nhi');
  });

  it('parses CRLF fences and files with no frontmatter', () => {
    expect(parse('---\r\ntitle: A\r\n---\r\nbody').data.title).toBe('A');
    expect(parse('just markdown')).toEqual({ data: {}, body: 'just markdown' });
  });

  it('reads existing hand-written frontmatter from the repo style', () => {
    const raw = `---
title: Sulphur Bank Mercury Mine
client: "EPA Region 9 — Superfund"
status: active
startDate: 2023-06
endDate: 2030-12
techniques:
  - XRF scanning
  - Mercury characterization
lat: 39.0
lng: -122.66
published: true
---
Body text.
`;
    const { data, body } = parse(raw);
    expect(data.title).toBe('Sulphur Bank Mercury Mine');
    expect(data.startDate).toBe('2023-06');
    expect(data.techniques).toHaveLength(2);
    expect(data.lat).toBe(39);
    expect(data.published).toBe(true);
    expect(body).toBe('Body text.\n');
  });

  it('throws a readable error on invalid YAML instead of returning garbage', () => {
    expect(() => parse('---\ntitle: [unclosed\n---\n')).toThrow(/valid YAML/);
    expect(() => parse('---\n- just a list\n---\n')).toThrow(/mapping/);
  });
});

describe('cleanForSchema', () => {
  it('strips blank optionals but keeps falsy primitives and arrays', () => {
    expect(cleanForSchema({ a: '', b: '  ', c: null, d: undefined, e: 0, f: false, g: ['', 'x', null] }))
      .toEqual({ e: 0, f: false, g: ['x'] });
  });
});
