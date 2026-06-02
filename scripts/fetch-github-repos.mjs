#!/usr/bin/env node
/**
 * Build-time GitHub repo fetcher.
 *
 * Fetches public repos for GH_USER and writes a trimmed JSON snapshot to
 * src/data/repos.json, which the site reads at build (see src/lib/code.ts).
 *
 * - Uses GITHUB_TOKEN if present (5,000 req/hr) — set in the Actions workflow.
 * - Unauthenticated falls back gracefully: on any error (rate limit, offline)
 *   it KEEPS the existing committed repos.json rather than failing the build.
 * - A denylist hides clearly personal/unrelated repos; an allowlist of
 *   "featured" names floats the best work to the top.
 *
 * Run: node scripts/fetch-github-repos.mjs
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/data/repos.json');

const GH_USER = process.env.GH_USER || 'engr-sharif';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// Repos to hide (personal / unrelated). Edit freely.
const DENY = new Set([
  'samantha-voice',
  'memory-palace',
  'timetracker',
  'faihma-cards',
  'faiza-fe',
  'faihma-exam',
]);

// Float these to the top, in this order.
const FEATURED = [
  'sbmm-planning-tool',
  'XRF',
  'ABP',
  'sbmm-explorer-v2',
  'SoilXRF',
  'portfolio',
];

async function main() {
  const url = `https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed&type=owner`;
  const headers = { 'User-Agent': 'portfolio-build', Accept: 'application/vnd.github+json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const raw = await res.json();

    const repos = raw
      .filter((r) => !r.fork && !r.archived && !r.private && !DENY.has(r.name))
      .map((r) => ({
        name: r.name,
        description: r.description || '',
        language: r.language || '',
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        topics: r.topics || [],
        url: r.html_url,
        homepage: r.homepage || '',
        pushedAt: r.pushed_at,
      }))
      .sort((a, b) => {
        const fa = FEATURED.indexOf(a.name);
        const fb = FEATURED.indexOf(b.name);
        if (fa !== -1 || fb !== -1) {
          return (fa === -1 ? 99 : fa) - (fb === -1 ? 99 : fb);
        }
        return new Date(b.pushedAt) - new Date(a.pushedAt);
      });

    writeFileSync(OUT, JSON.stringify({ user: GH_USER, fetchedAt: new Date().toISOString(), repos }, null, 2));
    console.log(`Wrote ${repos.length} repos to src/data/repos.json`);
  } catch (err) {
    if (existsSync(OUT)) {
      console.warn(`⚠ GitHub fetch failed (${err.message}); keeping existing repos.json`);
      // touch nothing — the committed snapshot is the fallback
    } else {
      console.warn(`⚠ GitHub fetch failed (${err.message}); writing empty repos.json`);
      writeFileSync(OUT, JSON.stringify({ user: GH_USER, fetchedAt: null, repos: [] }, null, 2));
    }
    // never fail the build
  }
}

main();
