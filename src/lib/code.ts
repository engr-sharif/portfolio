import reposData from '../data/repos.json';

export interface Repo {
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  topics: string[];
  url: string;
  homepage: string;
  pushedAt: string;
}

export const repos = (reposData.repos ?? []) as Repo[];

/** Common GitHub language colors (subset). Falls back to the accent green. */
const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Python: '#3572A5',
  Astro: '#ff5a03',
  Shell: '#89e051',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
};

export const langColor = (lang: string): string =>
  LANG_COLORS[lang] || 'var(--color-field-bright)';

/** "3 months ago" style relative time from an ISO date. */
export function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
