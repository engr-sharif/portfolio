/**
 * Line diff for the Studio's version history. Trims the common prefix/suffix,
 * then runs a classic LCS table on what's left. Content here is a single
 * Markdown/JSON file (hundreds of lines), so the O(n·m) core is comfortably
 * fast; a size guard degrades to "replaced block" for pathological inputs
 * instead of freezing the tab.
 */
export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

const MAX_CELLS = 4_000_000; // ≈ 2000 × 2000 lines after trimming

const splitLines = (s: string) => (s === '' ? [] : s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));

export function diffLines(before: string, after: string): DiffOp[] {
  const a = splitLines(before);
  const b = splitLines(after);

  // Common prefix / suffix — most edits touch a small region of a long file.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const ops: DiffOp[] = a.slice(0, start).map((text) => ({ type: 'same', text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > MAX_CELLS) {
    for (const text of midA) ops.push({ type: 'del', text });
    for (const text of midB) ops.push({ type: 'add', text });
  } else if (midA.length && midB.length) {
    // LCS lengths, then walk back to emit ops in order.
    const n = midA.length, m = midB.length, w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * w + j] = midA[i] === midB[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) { ops.push({ type: 'same', text: midA[i] }); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { ops.push({ type: 'del', text: midA[i] }); i++; }
      else { ops.push({ type: 'add', text: midB[j] }); j++; }
    }
    while (i < n) ops.push({ type: 'del', text: midA[i++] });
    while (j < m) ops.push({ type: 'add', text: midB[j++] });
  } else {
    for (const text of midA) ops.push({ type: 'del', text });
    for (const text of midB) ops.push({ type: 'add', text });
  }

  for (const text of a.slice(endA)) ops.push({ type: 'same', text });
  return ops;
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const o of ops) { if (o.type === 'add') added++; else if (o.type === 'del') removed++; }
  return { added, removed };
}

/** Collapse long unchanged runs so the reader sees the edits, not the file.
 * Keeps `context` lines around each change and replaces the rest with a
 * `{ skipped }` marker. */
export type DiffRow = DiffOp | { type: 'skip'; count: number };
export function condense(ops: DiffOp[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.type === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true;
  });
  const rows: DiffRow[] = [];
  let skipped = 0;
  ops.forEach((o, i) => {
    if (keep[i]) {
      if (skipped) { rows.push({ type: 'skip', count: skipped }); skipped = 0; }
      rows.push(o);
    } else skipped++;
  });
  if (skipped) rows.push({ type: 'skip', count: skipped });
  return rows;
}
