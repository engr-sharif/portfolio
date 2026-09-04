import { useMemo, type FC } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { rawImageUrl, rawRepoUrl } from './api';

interface Props {
  body: string;
  title?: string;
  cover?: string;
  coverDir?: string;
}

marked.setOptions({ gfm: true, breaks: false });

// Only these video hosts may be embedded in the preview (mirrors what the
// editor's "Insert video" button produces).
const EMBED_HOSTS = ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com'];

/**
 * Render the markdown write-up to HTML for an in-Studio preview. This mirrors
 * the live site closely (GFM, raw-HTML video embeds) but isn't the exact Astro
 * pipeline — the published page is the source of truth.
 *
 * The output is sanitised with DOMPurify before it touches the DOM: the
 * write-up is author-controlled, but pasted content (or a compromised
 * dependency) must never be able to run script inside the authenticated
 * admin. Image/video sources are then rewritten to public raw-content URLs so
 * media shows inside the Studio.
 */
function render(body: string): string {
  const raw = marked.parse(body || '', { async: false }) as string;
  if (typeof document === 'undefined') return '';

  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe', 'video', 'source'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'controls', 'preload', 'playsinline', 'poster', 'title'],
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  });

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('iframe').forEach((f) => {
    let ok = false;
    try { ok = EMBED_HOSTS.includes(new URL(f.getAttribute('src') || '', 'https://invalid.local').host); } catch { ok = false; }
    if (!ok) f.remove();
    else f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  });

  doc.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src') || '';
    if (s && !/^https?:/.test(s)) img.setAttribute('src', rawImageUrl(s));
    img.setAttribute('loading', 'lazy');
  });

  doc.querySelectorAll('video, source').forEach((el) => {
    const s = el.getAttribute('src') || '';
    if (s.startsWith('/portfolio/')) el.setAttribute('src', rawRepoUrl('public/' + s.replace('/portfolio/', '')));
    else if (s.startsWith('/videos/')) el.setAttribute('src', rawRepoUrl('public' + s));
  });

  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  return doc.body.innerHTML;
}

export const PreviewPane: FC<Props> = ({ body, title, cover, coverDir }) => {
  const html = useMemo(() => render(body), [body]);
  const coverUrl = cover ? rawImageUrl(cover, coverDir || 'src/assets/covers') : '';

  return (
    <aside className="st-preview" aria-label="Live preview">
      <div className="st-preview__head">Preview</div>
      <div className="st-preview__scroll">
        <article className="st-prose">
          {title && <h1 className="st-prose__title">{title}</h1>}
          {coverUrl && <img className="st-prose__cover" src={coverUrl} alt="" loading="lazy" />}
          {body.trim()
            ? <div dangerouslySetInnerHTML={{ __html: html }} />
            : <p className="st-prose__empty">Start writing to see it rendered here.</p>}
        </article>
      </div>
    </aside>
  );
};
