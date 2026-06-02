import { getCollection, type CollectionEntry } from 'astro:content';

export type Tool = CollectionEntry<'tools'>;

/** Published tools, sorted by order (then name). */
export async function getTools(): Promise<Tool[]> {
  const all = await getCollection('tools', ({ data }) => data.published);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}
