import { useMemo, type FC } from 'react';
import { marked } from 'marked';
import { rawImageUrl, rawRepoUrl } from './api';

interface Props {
  body: string;
  title?: string;
  cover?: string;
  coverDir?: string;
}

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render the markdown write-up to HTML for an in-Studio preview. This mirrors
 * the live site closely (GFM, raw-HTML video embeds) but isn't the exact Astro
 * pipeline — the published page is the source of truth. Image/video sources are
 * rewritten to public raw-content URLs so media shows inside the admin.
 */
function render(body: string): string {
  const html = marked.parse(body || '', { async: false }) as string;
  if (typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

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
