import { describe, it, expect } from 'vitest';
import { validateEntry } from '../src/content/schemas';
import { cleanForSchema } from '../src/studio/frontmatter';

/** The Studio validates with the exact schema the build uses. These tests make
 * sure typical editor states produce the right per-field messages. */
describe('validateEntry', () => {
  const okProject = {
    title: 'Landfill CQA', client: 'Confidential municipal client', siteType: 'Landfill', status: 'complete',
    role: 'Field engineer', startDate: '2024-03', endDate: '2024-11', summary: 'Liner QA.',
    techniques: ['CQA'], published: false, order: 0, featured: false, gallery: [],
  };

  it('accepts a complete project', () => {
    expect(validateEntry('projects', okProject)).toEqual({});
  });

  it('reports missing required fields by name', () => {
    const errs = validateEntry('projects', cleanForSchema({ ...okProject, title: '', summary: '   ' }));
    expect(Object.keys(errs).sort()).toEqual(['summary', 'title']);
  });

  it('rejects a bad URL but accepts a blank one once cleaned', () => {
    expect(validateEntry('projects', { ...okProject, externalLink: 'not a url' })).toHaveProperty('externalLink');
    expect(validateEntry('projects', cleanForSchema({ ...okProject, externalLink: '' }))).toEqual({});
  });

  it('checks date formats and coordinate ranges', () => {
    expect(validateEntry('projects', { ...okProject, startDate: 'March 2024' })).toHaveProperty('startDate');
    expect(validateEntry('projects', { ...okProject, lat: 120 })).toHaveProperty('lat');
    expect(validateEntry('projects', { ...okProject, lat: 38.5, lng: -121.5 })).toEqual({});
  });

  it('blog: requires a publish date and caps the excerpt', () => {
    const post = { title: 'Notes', description: 'x'.repeat(201), draft: true, featured: false, tags: [] };
    const errs = validateEntry('blog', cleanForSchema(post));
    expect(errs).toHaveProperty('pubDate');
    expect(errs.description).toMatch(/200/);
    expect(validateEntry('blog', { ...post, description: 'ok', pubDate: '2024-05-01' })).toEqual({});
  });

  it('unknown collections are not validated', () => {
    expect(validateEntry('site', { anything: 1 })).toEqual({});
  });
});
