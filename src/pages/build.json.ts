import type { APIRoute } from 'astro';

/**
 * Build stamp, generated once per build. The Studio polls this on the site's
 * own origin after a publish and declares "Live" only when the deployed commit
 * is the one it just wrote (or, failing a sha, when the stamp is newer than the
 * one it saw before saving). Host-agnostic and needs no GitHub API: Cloudflare
 * Pages exposes CF_PAGES_COMMIT_SHA at build time, GitHub Actions GITHUB_SHA.
 * public/_headers marks it no-store so the poll never sees a cached copy.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      at: new Date().toISOString(),
      sha: process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null,
      branch: process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || null,
      host: process.env.CF_PAGES ? 'cloudflare-pages' : process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
