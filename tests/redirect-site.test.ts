import { describe, it, expect } from 'vitest';
// @ts-ignore — plain ESM script
import { mapPath, page } from '../scripts/redirect-site.mjs';

/** The old GitHub Pages address must forward every deep link to the same
 * path on the new host — that's what keeps résumé QR codes and search results
 * working after the move. */
describe('redirect site', () => {
  it('maps old /portfolio/ paths onto the new host', () => {
    expect(mapPath('/portfolio/', '/portfolio/', 'https://mosharif.pages.dev')).toBe('https://mosharif.pages.dev/');
    expect(mapPath('/portfolio/projects/pfas/', '/portfolio/', 'https://mosharif.pages.dev')).toBe('https://mosharif.pages.dev/projects/pfas/');
    expect(mapPath('/other', '/portfolio/', 'https://mosharif.pages.dev')).toBe('https://mosharif.pages.dev/other');
  });

  it('emits a canonical, a meta refresh, and the JS path mapper', () => {
    const html = page('');
    expect(html).toContain('<link rel="canonical" href="https://mosharif.pages.dev/">');
    expect(html).toContain('http-equiv="refresh" content="0; url=https://mosharif.pages.dev/"');
    expect(html).toContain('location.replace(');
    expect(html).toContain('name="robots" content="noindex"');
  });
});
