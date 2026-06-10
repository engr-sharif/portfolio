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

/** Unique techniques across published projects, sorted by frequency then name. */
export async function getTechniques(): Promise<string[]> {
  const all = await getProjects();
  const counts = new Map<string, number>();
  for (const p of all) for (const t of p.data.techniques) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
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
