/**
 * Profile data (credentials, certifications, tools, timeline) — the
 * "Credentials / Career" singleton, editable via the CMS at /admin.
 * Typed with a fallback so the site always renders.
 */
import profileJson from '../content/settings/profile.json';

export interface Credential {
  label: string;
  issuer: string;
  status: string;
  date: string;
}
export interface Certification {
  label: string;
  issuer: string;
  date: string;
  expires?: string;
}
export interface TimelineEntry {
  date: string;
  title: string;
  org: string;
  detail: string;
}
export interface Profile {
  credentials: Credential[];
  certifications: Certification[];
  timeline: TimelineEntry[];
  /** Legacy — tools moved to their own content collection (src/content/tools). */
  tools?: unknown[];
}

export const profile = profileJson as Profile;

/**
 * Skills matrix: group every technique used across published projects into
 * domain buckets, with a count of how many projects use each. Auto-derived so
 * it never needs manual upkeep — add a technique to a project and it appears.
 */
const SKILL_GROUPS: { group: string; match: string[] }[] = [
  { group: 'Field Sampling', match: ['sampling', 'groundwater', 'soil', 'grid', 'field'] },
  { group: 'Instrumentation & Monitoring', match: ['xrf', 'lfg', 'monitoring', 'scanning', 'navigation'] },
  { group: 'Remediation & Characterization', match: ['remediation', 'characterization', 'mercury', 'pfas'] },
  { group: 'Quality Assurance', match: ['cqa', 'qa', 'liner', 'cover'] },
];

export function buildSkillMatrix(
  projects: { data: { techniques: string[] } }[],
): { group: string; skills: { name: string; count: number }[] }[] {
  const counts = new Map<string, number>();
  for (const p of projects)
    for (const t of p.data.techniques) counts.set(t, (counts.get(t) ?? 0) + 1);

  const assigned = new Set<string>();
  const groups = SKILL_GROUPS.map(({ group, match }) => {
    const skills = [...counts.entries()]
      .filter(([name]) => {
        const lower = name.toLowerCase();
        const hit = match.some((m) => lower.includes(m));
        if (hit) assigned.add(name);
        return hit;
      })
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { group, skills };
  }).filter((g) => g.skills.length > 0);

  // Anything unmatched lands in "Methods & Reporting" so nothing is lost.
  const other = [...counts.entries()]
    .filter(([name]) => !assigned.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  if (other.length) groups.push({ group: 'Other Methods', skills: other });

  return groups;
}
