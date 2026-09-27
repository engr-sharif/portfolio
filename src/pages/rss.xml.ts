import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/blog';
import { withBase } from '../lib/path';
import { site } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: `${site.name} — Field notes`,
    description:
      'Notes on environmental site characterization, remediation and compliance monitoring, and on the tools behind the work.',
    site: context.site ?? 'https://mosharif.pages.dev',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      // Absolute, base-aware link so feed readers resolve it correctly.
      link: withBase(`notes/${post.id}/`),
    })),
    customData: '<language>en-us</language>',
  });
}
