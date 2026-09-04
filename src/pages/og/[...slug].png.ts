/**
 * Build-time social cards: /og/<route>.png for every public page.
 *
 *   /og/home.png            homepage
 *   /og/about.png …         section landings (about, projects, tools, blog)
 *   /og/projects/<id>.png   each case study (with its cover photo)
 *   /og/blog/<id>.png       each post
 *   /og/tools/<id>.png      each tool
 *
 * BaseLayout picks the matching card from the current path (see ogFor()).
 * Static output only — sharp + satori never ship to the browser.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard, type CardInput } from '../../lib/og';
import { site } from '../../lib/site';
import { getProjects } from '../../lib/projects';
import { dateRange } from '../../lib/date-range';
import { getPosts, formatDate } from '../../lib/blog';
import { getTools } from '../../lib/tools';
import { getImage } from '../../lib/images';

// Absolute public URL of the site root (host-agnostic: Astro.site + base).
const SITE_URL = new URL(import.meta.env.BASE_URL, import.meta.env.SITE).href;

type Card = Omit<CardInput, 'siteName' | 'siteUrl'>;

/** Absolute source path of a content image (Astro exposes it as fsPath). */
const fsPath = (name?: string): string | undefined => {
  const img = getImage(name) as (ReturnType<typeof getImage> & { fsPath?: string }) | undefined;
  return img?.fsPath;
};

export const getStaticPaths: GetStaticPaths = async () => {
  const [projects, posts, tools] = await Promise.all([getProjects(), getPosts(), getTools()]);
  const firstName = site.name.split(' ')[0];

  const cards: Record<string, Card> = {
    home: {
      eyebrow: `${site.credential} · ${site.location}`,
      title: site.name,
      summary: site.bio,
      meta: [`${projects.length} projects`, `${tools.length} field tools`, site.role],
      coverPath: fsPath(site.avatar),
    },
    about: {
      eyebrow: 'About',
      title: `${firstName}, in the field and at the desk`,
      summary: site.bio,
      meta: [site.credential, site.location],
      coverPath: fsPath(site.avatar),
    },
    projects: {
      eyebrow: 'Projects · Field Atlas',
      title: 'Case studies from California remediation sites',
      summary: 'Site characterization, remediation, and construction QA — documented the way an engineer reads them.',
      meta: [`${projects.length} projects`, `${projects.filter((p) => p.data.status === 'active').length} active`],
    },
    tools: {
      eyebrow: 'Tools',
      title: 'Software built for the field',
      summary: 'Small, sharp programs that make sampling, QA, and reporting faster and more reliable.',
      meta: [`${tools.length} tools shipped`, 'Python · TypeScript'],
    },
    blog: {
      eyebrow: 'Field Notes & Writing',
      title: 'Notes from the field, methods from the desk',
      summary: 'Observations, techniques, and lessons from environmental fieldwork.',
      meta: [`${posts.length} posts`],
    },
  };

  for (const p of projects) {
    cards[`projects/${p.id}`] = {
      eyebrow: `Project · ${p.data.siteType}`,
      title: p.data.title,
      summary: p.data.summary,
      meta: [dateRange(p.data.startDate, p.data.endDate, p.data.status), p.data.location ?? '', p.data.role].filter(Boolean),
      coverPath: fsPath(p.data.coverImage),
      status: p.data.status,
    };
  }
  for (const post of posts) {
    cards[`blog/${post.id}`] = {
      eyebrow: post.data.category ? `Writing · ${post.data.category.replace('-', ' ')}` : 'Writing',
      title: post.data.title,
      summary: post.data.description,
      meta: [formatDate(post.data.pubDate), ...post.data.tags.slice(0, 2).map((t) => `#${t}`)],
      coverPath: fsPath(post.data.coverImage),
    };
  }
  for (const t of tools) {
    cards[`tools/${t.id}`] = {
      eyebrow: 'Tool',
      title: t.data.name,
      summary: t.data.summary,
      meta: t.data.tech.slice(0, 3),
      coverPath: fsPath(t.data.screenshots[0]),
    };
  }

  return Object.entries(cards).map(([slug, card]) => ({ params: { slug }, props: { card } }));
};

export const GET: APIRoute = async ({ props }) => {
  const card = props.card as Card;
  const png = await renderCard({ ...card, siteName: site.name, siteUrl: SITE_URL });
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
