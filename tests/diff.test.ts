import { describe, it, expect } from 'vitest';
import { diffLines, diffStats, condense } from '../src/studio/diff';

/** The History drawer's diff must be exact: a restore is judged by it. */
describe('diffLines', () => {
  const join = (ops: ReturnType<typeof diffLines>, type: string) => ops.filter((o) => o.type === type).map((o) => o.text);

  it('reports identical inputs as all-same', () => {
    const ops = diffLines('a\nb\nc\n', 'a\nb\nc');
    expect(ops.every((o) => o.type === 'same')).toBe(true);
    expect(diffStats(ops)).toEqual({ added: 0, removed: 0 });
  });

  it('finds a single changed line inside a long file', () => {
    const before = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 150', 'line one-fifty');
    const ops = diffLines(before, after);
    expect(join(ops, 'del')).toEqual(['line 150']);
    expect(join(ops, 'add')).toEqual(['line one-fifty']);
    expect(join(ops, 'same')).toHaveLength(299);
  });

  it('handles insertions, deletions and empty sides', () => {
    expect(diffStats(diffLines('', 'x\ny'))).toEqual({ added: 2, removed: 0 });
    expect(diffStats(diffLines('x\ny', ''))).toEqual({ added: 0, removed: 2 });
    const ops = diffLines('title: A\nstatus: draft\nbody', 'title: A\nstatus: live\nlat: 38.5\nbody');
    expect(join(ops, 'del')).toEqual(['status: draft']);
    expect(join(ops, 'add')).toEqual(['status: live', 'lat: 38.5']);
  });

  it('reconstructs both sides from the ops (no line lost)', () => {
    const a = 'one\ntwo\nthree\nfour\nfive';
    const b = 'zero\none\nthree\nfour\nsix\nfive';
    const ops = diffLines(a, b);
    expect(ops.filter((o) => o.type !== 'add').map((o) => o.text).join('\n')).toBe(a);
    expect(ops.filter((o) => o.type !== 'del').map((o) => o.text).join('\n')).toBe(b);
  });

  it('normalises CRLF', () => {
    expect(diffStats(diffLines('a\r\nb\r\n', 'a\nb\n'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('condense', () => {
  it('collapses unchanged runs but keeps context around edits', () => {
    const before = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l20', 'L20');
    const rows = condense(diffLines(before, after), 2);
    const skips = rows.filter((r) => r.type === 'skip') as { count: number }[];
    expect(skips.map((s) => s.count)).toEqual([18, 17]);
    expect(rows.filter((r) => r.type === 'same')).toHaveLength(4);
  });
});
