import { Extension, Node, mergeAttributes, type Editor, type Range } from '@tiptap/core';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import type { ReactNode } from 'react';
import { rawImageUrl } from '../../../api';

/**
 * TipTap extensions for the block editor. The whole point of the editor is a
 * LOSSLESS markdown round trip, so anything the markdown parser would drop —
 * raw HTML (video embeds), repo-relative image paths — is modelled explicitly.
 */

/* ------------------------------------------------------------- HTML block */
/** Raw HTML preserved verbatim (the markdown editor's video embeds and native
 * <video> tags). Rendered in the editor as a labelled card; written back out
 * exactly as it came in. */
const summarize = (html: string) => {
  const src = html.match(/src="([^"]+)"/)?.[1] || '';
  try { const u = new URL(src, 'https://x.invalid'); return `${u.hostname === 'x.invalid' ? '' : u.hostname}${u.pathname}`.slice(0, 60); } catch { return src.slice(0, 60); }
};
export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() { return { html: { default: '' } }; },
  parseHTML() {
    return [
      { tag: 'div[data-html-block]', getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute('data-html') || '' }) },
      { tag: 'div.video-embed', getAttrs: (el) => ({ html: (el as HTMLElement).outerHTML }) },
      { tag: 'video', getAttrs: (el) => ({ html: (el as HTMLElement).outerHTML }) },
      { tag: 'iframe', getAttrs: (el) => ({ html: (el as HTMLElement).outerHTML }) },
    ];
  },
  renderHTML({ node }) {
    const html = String(node.attrs.html || '');
    const label = /youtube/i.test(html) ? 'YouTube video' : /vimeo/i.test(html) ? 'Vimeo video' : /<video/i.test(html) ? 'Uploaded video' : 'Embedded HTML';
    return ['div', { 'data-html-block': '', 'data-html': html, class: 'blk-html', contenteditable: 'false' }, ['span', { class: 'blk-html__label' }, label], ['code', { class: 'blk-html__src' }, summarize(html)]];
  },
  renderMarkdown: (node) => String(node.attrs?.html || ''),
  // CommonMark only treats a fixed list of tags as HTML *blocks*; a <video>
  // on its own line is not one of them and would be parsed as inline HTML and
  // dropped. Tokenize both embed shapes ourselves, keeping the raw text exact.
  markdownTokenName: 'htmlBlock',
  markdownTokenizer: {
    name: 'htmlBlock',
    level: 'block',
    start: (src: string) => { const m = /(^|\n)<(div class="video-embed"|video\b)/.exec(src); return m ? m.index + m[1].length : -1; },
    tokenize: (src: string) => {
      const m = /^<div class="video-embed">[\s\S]*?<\/div>|^<video\b[^>]*>[\s\S]*?<\/video>/.exec(src);
      if (!m) return undefined;
      return { type: 'htmlBlock', raw: m[0], html: m[0] };
    },
  },
  parseMarkdown: (token) => ({ type: 'htmlBlock', attrs: { html: String(token.html ?? token.raw ?? '').trim() } }),
});

/* ------------------------------------------------------------- Repo image */
/** Images keep their repo path (e.g. /src/assets/blog/x.jpg) as `src` — which
 * is what the markdown file needs — and are DISPLAYED from GitHub's raw URL. */
export const RepoImage = Image.extend<ImageOptions & { mediaDir: string }>({
  addOptions() { return { ...(this.parent?.() as ImageOptions), mediaDir: 'src/assets/blog' }; },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => { const e = el as HTMLElement; return { src: e.getAttribute('data-src') || e.getAttribute('src'), alt: e.getAttribute('alt'), title: e.getAttribute('title') }; } }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const src = String(node.attrs.src || '');
    const display = /^(https?:|data:|blob:)/.test(src) ? src : rawImageUrl(src, this.options.mediaDir);
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: display, 'data-src': src, draggable: 'false' })];
  },
});

/* ------------------------------------------------------------- Slash menu */
export interface SlashItem { id: string; title: string; hint?: string; icon: ReactNode; keywords?: string; run: (editor: Editor, range: Range) => void }
export interface SlashState { items: SlashItem[]; index: number; rect: DOMRect | null; select: (i: number) => void }

/** "/" at the start of a line opens a block menu. The plugin owns keyboard
 * handling; React renders the list from `setState`. */
export const createSlash = (all: SlashItem[], setState: (s: SlashState | null) => void) =>
  Extension.create({
    name: 'slash',
    addProseMirrorPlugins() {
      let selected = 0;
      let current: SuggestionProps<SlashItem> | null = null;
      const push = () => {
        if (!current) return;
        const c = current;
        setState(c.items.length ? { items: c.items, index: selected, rect: c.clientRect?.() ?? null, select: (i) => c.command(c.items[i]) } : null);
      };
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => { const q = query.toLowerCase(); return all.filter((i) => !q || i.title.toLowerCase().includes(q) || (i.keywords || '').includes(q)).slice(0, 10); },
          command: ({ editor, range, props }) => { props.run(editor, range); },
          render: () => ({
            onStart: (p) => { current = p; selected = 0; push(); },
            onUpdate: (p) => { current = p; selected = Math.min(selected, Math.max(0, p.items.length - 1)); push(); },
            onKeyDown: ({ event }) => {
              if (!current || !current.items.length) return false;
              if (event.key === 'ArrowDown') { selected = (selected + 1) % current.items.length; push(); return true; }
              if (event.key === 'ArrowUp') { selected = (selected - 1 + current.items.length) % current.items.length; push(); return true; }
              if (event.key === 'Enter' || event.key === 'Tab') { current.command(current.items[selected]); return true; }
              if (event.key === 'Escape') { setState(null); return true; }
              return false;
            },
            onExit: () => { current = null; setState(null); },
          }),
        }),
      ];
    },
  });
