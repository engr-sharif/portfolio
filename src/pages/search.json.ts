/**
 * The search index behind the command palette (src/scripts/search.ts):
 * every project, tool, note and page with a title, a one-line description,
 * a kind, a URL and a little extra text to match against.
 */
import type { APIRoute } from 'astro';
import { getProjects } from '../lib/projects';
import { getTools } from '../lib/tools';
import { getPosts } from '../lib/blog';
import { withBase } from '../lib/path';

export const GET: APIRoute = async () => {
  const [projects, tools, posts] = await Promise.all([getProjects(), getTools(), getPosts()]);
  const clip = (s = '', n = 600) => s.replace(/[#*_>`[\]()]/g, ' ').replace(/\s+/g, ' ').slice(0, n);
  const entries = [
    ...projects.map((p) => ({ t: p.data.title, d: p.data.summary, k: 'Project', u: withBase(`/projects/${p.id}/`), s: [p.data.siteType, p.data.client, p.data.location, ...p.data.techniques, clip(p.body)].join(' ') })),
    ...tools.map((t) => ({ t: t.data.name, d: t.data.summary, k: 'Tool', u: withBase(`/tools/${t.id}/`), s: [...t.data.tech, t.data.problem, clip(t.body)].join(' ') })),
    ...posts.map((p) => ({ t: p.data.title, d: p.data.description, k: 'Note', u: withBase(`/notes/${p.id}/`), s: [...p.data.tags, p.data.category, clip(p.body)].join(' ') })),
    { t: 'Home', d: '', k: 'Page', u: withBase('/'), s: 'start map atlas' },
    { t: 'Work', d: 'All projects', k: 'Page', u: withBase('/projects/'), s: 'projects case studies' },
    { t: 'Tools', d: 'Software built for the field', k: 'Page', u: withBase('/tools/'), s: 'software apps code' },
    { t: 'Notes', d: 'Field notes and writing', k: 'Page', u: withBase('/notes/'), s: 'blog writing posts' },
    { t: 'About', d: 'Background, credentials and experience', k: 'Page', u: withBase('/about/'), s: 'bio credentials eit pe hazwoper' },
    { t: 'CV', d: 'Experience and credentials on one page', k: 'Page', u: withBase('/cv/'), s: 'resume résumé curriculum vitae' },
    { t: 'Contact', d: 'Email or send a message', k: 'Page', u: withBase('/#contact'), s: 'email hire message' },
    { t: 'Colophon', d: 'How this site is built', k: 'Page', u: withBase('/colophon/'), s: 'design typefaces stack' },
  ];
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } });
};
