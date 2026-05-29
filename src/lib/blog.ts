import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Published posts (drafts hidden in production, shown in dev), newest first. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true,
  );
  return all.sort((a, b) => +b.data.pubDate - +a.data.pubDate);
}

export async function getFeaturedPosts(): Promise<Post[]> {
  return (await getPosts()).filter((p) => p.data.featured);
}

/** Unique tags with counts, sorted by frequency. */
export async function getTags(): Promise<{ tag: string; count: number }[]> {
  const posts = await getPosts();
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Posts sharing the most tags/category with the given post (max `limit`). */
export async function getRelated(post: Post, limit = 2): Promise<Post[]> {
  const posts = await getPosts();
  const tags = new Set(post.data.tags);
  return posts
    .filter((p) => p.id !== post.id)
    .map((p) => {
      const shared = p.data.tags.filter((t) => tags.has(t)).length;
      const sameCat = p.data.category && p.data.category === post.data.category ? 1 : 0;
      return { p, score: shared * 2 + sameCat };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export const CATEGORY_LABEL: Record<string, string> = {
  'field-notes': 'Field Notes',
  technical: 'Technical',
  professional: 'Professional',
};

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
