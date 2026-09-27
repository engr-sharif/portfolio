/**
 * Build-time social cards: /og/<route>.png for every public page.
 *
 *   /og/home.png            homepage            /og/about.png, /og/cv.png …
 *   /og/projects/<id>.png   each case study     /og/notes/<id>.png   each note
 *   /og/tools/<id>.png      each tool
 *
 * BaseLayout picks the matching card from the current path (see ogFor()).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard, type CardInput } from '../../lib/og';
import { site } from '../../lib/site';
import { getProjects, dateRange } from '../../lib/projects';
import { getPosts, formatDate, CATEGORY_LABEL } from '../../lib/blog';
import { getTools } from '../../lib/tools';
import { getImage } from '../../lib/images';
import { publicPosition } from '../../lib/atlas';
import { toUV } from '../../lib/terrain';

const SITE_URL = new URL(import.meta.env.BASE_URL, import.meta.env.SITE).href;
type Card = Omit<CardInput, 'siteName' | 'siteUrl'>;

const fsPath = (name?: string): string | undefined =>
  (getImage(name) as (ReturnType<typeof getImage> & { fsPath?: string }) | undefined)?.fsPath;

export const getStaticPaths: GetStaticPaths = async () => {
  const [projects, posts, tools] = await Promise.all([getProjects(), getPosts(), getTools()]);
  const pinFor = (d: Parameters<typeof publicPosition>[0]) => {
    const p = publicPosition(d);
    return p ? [toUV(p.lat, p.lng)] : [];
  };
  const allPins = projects.flatMap((p) => pinFor(p.data));

  const cards: Record<string, Card> = {
    home: {
      eyebrow: 'Environmental Engineer, EIT · Sacramento',
      title: site.name,
      summary: 'Site characterization and remediation in California, and the software that makes fieldwork faster.',
      meta: [`${projects.length} projects`, `${tools.length} field tools`, `${posts.length} notes`],
      pins: allPins,
    },
    about: { eyebrow: 'About', title: `About ${site.name.split(' ')[0]}`, summary: site.bio, meta: ['Environmental Engineer, EIT', site.location], coverPath: fsPath(site.avatar) },
    cv: { eyebrow: 'Curriculum vitae', title: site.name, summary: 'Experience, projects, tools and credentials on one page.', meta: ['Environmental Engineer, EIT', site.location], pins: allPins },
    projects: { eyebrow: 'Work', title: 'Case studies from California sites', summary: 'Characterization, remediation and compliance monitoring, written up like reports.', meta: [`${projects.length} projects`, `${projects.filter((p) => p.data.status === 'active').length} active`], pins: allPins },
    tools: { eyebrow: 'Tools', title: 'Software built for the field', summary: 'Programs I wrote because a job on site needed them.', meta: [`${tools.length} tools`] },
    notes: { eyebrow: 'Notes', title: 'Field notes', summary: 'Methods, lessons from site, and how the tools came about.', meta: [`${posts.length} notes`] },
  };

  for (const p of projects) {
    cards[`projects/${p.id}`] = {
      eyebrow: `Project · ${p.data.siteType}`,
      title: p.data.title,
      summary: p.data.summary,
      meta: [dateRange(p.data.startDate, p.data.endDate, p.data.status), p.data.location ?? ''].filter(Boolean),
      coverPath: fsPath(p.data.coverImage),
      pins: pinFor(p.data),
    };
  }
  for (const post of posts) {
    const rel = projects.find((p) => p.id === post.data.relatedProject);
    cards[`notes/${post.id}`] = {
      eyebrow: `Note · ${post.data.category ? CATEGORY_LABEL[post.data.category] : 'Field notes'}`,
      title: post.data.title,
      summary: post.data.description,
      meta: [formatDate(post.data.pubDate), ...post.data.tags.slice(0, 2)],
      coverPath: fsPath(post.data.coverImage),
      pins: rel ? pinFor(rel.data) : [],
    };
  }
  for (const t of tools) {
    cards[`tools/${t.id}`] = { eyebrow: 'Tool', title: t.data.name, summary: t.data.summary, meta: t.data.tech.slice(0, 3), coverPath: fsPath(t.data.screenshots[0]) };
  }
  return Object.entries(cards).map(([slug, card]) => ({ params: { slug }, props: { card } }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard({ ...(props.card as Card), siteName: site.name, siteUrl: SITE_URL });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
