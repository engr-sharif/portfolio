import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;

const statusOrder = { active: 0, proposed: 1, complete: 2 } as const;

/** Published projects only (confidentiality gate), sorted by status then order. */
export async function getProjects(): Promise<Project[]> {
  const all = await getCollection('projects', ({ data }) => data.published);
  return all.sort((a, b) => {
    const s = statusOrder[a.data.status] - statusOrder[b.data.status];
    if (s !== 0) return s;
    return a.data.order - b.data.order;
  });
}

export async function getFeatured(): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.data.featured).sort((a, b) => a.data.order - b.data.order);
}

export const statusLabel: Record<string, string> = {
  active: 'Active',
  complete: 'Complete',
  proposed: 'Proposed',
};

export function dateRange(start: string, end?: string): string {
  const fmt = (s: string) => {
    const [y, m] = s.split('-');
    if (!m) return y;
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  return `${fmt(start)} — ${end ? fmt(end) : 'Present'}`;
}
