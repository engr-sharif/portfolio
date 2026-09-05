import { describe, it, expect } from 'vitest';
import { buildFieldNote, fieldNoteSlug, excerpt } from '../src/studio/fieldlog-build';
import { parse } from '../src/studio/frontmatter';
import { validateEntry } from '../src/content/schemas';

/** A capture made with no signal must become a Field Notes draft the build
 * accepts as-is — the whole point is zero cleanup back at the desk. */
const capture = {
  title: 'Cell 4 liner seams — north slope',
  note: 'Walked the north slope after the 0600 rain. Two seams show fishmouths near station 12+50; flagged both for the installer. Air test scheduled for tomorrow.\n\n- Ambient 58°F\n- No standing water',
  createdAt: '2026-09-05T14:32:00.000Z',
  lat: 38.5816, lng: -121.4944,
  project: 'landfill-cqa-cell-4',
  photos: [{ ext: 'jpg', alt: 'Fishmouth at seam 12+50' }, { ext: 'jpg' }],
};

describe('buildFieldNote', () => {
  it('produces a draft that passes the blog schema', () => {
    const built = buildFieldNote(capture);
    const doc = parse(built.content);
    expect(validateEntry('blog', doc.data)).toEqual({});
    expect(doc.data.draft).toBe(true);
    expect(doc.data.category).toBe('field-notes');
    expect(doc.data.relatedProject).toBe('landfill-cqa-cell-4');
    expect(doc.data.coverImage).toBe('2026-09-05-cell-4-liner-seams-north-slope-1.jpg');
  });

  it('names the file and photos from the day + title, in the blog folders', () => {
    const built = buildFieldNote(capture);
    expect(built.path).toBe('src/content/blog/2026-09-05-cell-4-liner-seams-north-slope.md');
    expect(built.photoPaths).toEqual([
      'src/assets/blog/2026-09-05-cell-4-liner-seams-north-slope-1.jpg',
      'src/assets/blog/2026-09-05-cell-4-liner-seams-north-slope-2.jpg',
    ]);
    expect(built.content).toContain('![Fishmouth at seam 12+50](/src/assets/blog/2026-09-05-cell-4-liner-seams-north-slope-1.jpg)');
  });

  it('keeps client locations approximate (2 dp ≈ 1 km) and honours a caller-chosen slug', () => {
    const built = buildFieldNote(capture, { slug: 'custom-slug-2' });
    expect(built.path).toBe('src/content/blog/custom-slug-2.md');
    expect(built.content).toContain('38.58, -121.49 (approx.)');
    expect(built.content).not.toContain('38.5816');
  });

  it('copes with an empty title and no photos', () => {
    const built = buildFieldNote({ ...capture, title: '', photos: [] });
    expect(built.slug).toBe('2026-09-05-field-note');
    expect(parse(built.content).data.title).toBe('Field note — 2026-09-05');
    expect(parse(built.content).data.coverImage).toBeUndefined();
    expect(built.content).not.toContain('## Photos');
  });
});

describe('helpers', () => {
  it('slugs strip accents and cap length', () => {
    expect(fieldNoteSlug('Café — PFAS sampling round 3!', '2026-01-02T00:00:00Z')).toBe('2026-01-02-cafe-pfas-sampling-round-3');
    expect(fieldNoteSlug('x'.repeat(200), '2026-01-02T00:00:00Z').length).toBeLessThanOrEqual(11 + 60);
  });
  it('excerpt ends on a sentence when it can', () => {
    expect(excerpt(capture.note)).toBe('Walked the north slope after the 0600 rain. Two seams show fishmouths near station 12+50; flagged both for the installer. Air test scheduled for tomorrow.');
    expect(excerpt('word '.repeat(60)).endsWith('…')).toBe(true);
    expect(excerpt('')).toBe('');
  });
});
