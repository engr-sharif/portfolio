import { getCollection, type CollectionEntry } from 'astro:content';
import { SHOW_UNPUBLISHED } from './build-env';

export type Tool = CollectionEntry<'tools'>;

/** Published tools, sorted by order (then name). */
export async function getTools(): Promise<Tool[]> {
  const all = await getCollection('tools', ({ data }) => data.published || SHOW_UNPUBLISHED);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}
