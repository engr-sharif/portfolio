// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { marked } from 'marked';
import { HtmlBlock, RepoImage } from '../src/studio/features/editor/block/extensions';
import { parse } from '../src/studio/frontmatter';

/**
 * The block editor must never damage a post: every real content body has to
 * survive markdown → editor → markdown with identical rendered HTML, and a
 * second pass must be a no-op. Raw HTML embeds and repo image paths are the
 * two things a naive parser would destroy — pinned explicitly.
 */
const extensions = [StarterKit.configure({ heading: { levels: [2, 3, 4] } }), Markdown, RepoImage.configure({ mediaDir: 'src/assets/blog' }), HtmlBlock];
const roundtrip = (md: string) => {
  const editor = new Editor({ element: document.createElement('div'), extensions, content: md, contentType: 'markdown' });
  try { return editor.getMarkdown(); } finally { editor.destroy(); }
};
const html = (md: string) => String(marked.parse(md, { gfm: true })).replace(/\s+/g, ' ').replace(/> </g, '><').trim();

const bodies: { file: string; body: string }[] = [];
for (const dir of ['projects', 'blog', 'tools']) {
  for (const f of readdirSync(`src/content/${dir}`).filter((n) => /\.mdx?$/.test(n))) {
    const { body } = parse(readFileSync(`src/content/${dir}/${f}`, 'utf8'));
    if (body.trim()) bodies.push({ file: `${dir}/${f}`, body });
  }
}

describe('block editor markdown round trip', () => {
  it('has real content to test against', () => { expect(bodies.length).toBeGreaterThan(5); });

  for (const { file, body } of bodies) {
    it(`renders identically after a round trip: ${file}`, () => {
      const once = roundtrip(body);
      expect(html(once)).toBe(html(body));
      expect(roundtrip(once)).toBe(once); // stable on the second pass
    });
  }

  it('keeps video embeds (raw HTML) byte-for-byte', () => {
    const yt = '<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/abc123DEF45" title="Video" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
    const vid = '<video class="video-embed-native" controls preload="metadata" src="/videos/site-walk.mp4"></video>';
    const md = `Intro paragraph.\n\n${yt}\n\nMiddle text with **bold**.\n\n${vid}\n\nEnd.`;
    const out = roundtrip(md);
    expect(out).toContain(yt);
    expect(out).toContain(vid);
    expect(html(out)).toBe(html(md));
  });

  it('keeps repo image paths and alt text', () => {
    const md = 'Before.\n\n![Seam 12+50](/src/assets/blog/seam-12-50.jpg)\n\nAfter.';
    const out = roundtrip(md);
    expect(out).toContain('![Seam 12+50](/src/assets/blog/seam-12-50.jpg)');
  });

  it('keeps headings, nested lists, quotes, fenced code with language, links and inline marks', () => {
    const md = ['## Field method', '', 'Use the **XRF** on a _clean_ surface — see [the guide](https://example.com/guide) and `Cal check`.', '', '- Step one', '- Step two', '  - Sub-step', '', '1. First', '2. Second', '', '> Keep it defensible.', '', '```js', 'const ppm = read();', '```', '', '---', '', 'Done.'].join('\n');
    const out = roundtrip(md);
    expect(html(out)).toBe(html(md));
    expect(out).toContain('```js');
    expect(out).toContain('[the guide](https://example.com/guide)');
  });
});
