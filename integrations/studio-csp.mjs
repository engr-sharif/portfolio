/**
 * Studio CSP hashing — Astro integration.
 *
 * The /studio page ships a strict Content-Security-Policy with
 * `script-src 'self'`. Astro itself injects two small inline bootstrap
 * scripts for client islands (the `astro-island` element + the `client:only`
 * directive), and their content changes between Astro versions — so instead
 * of hardcoding hashes that would silently break on upgrade, we compute the
 * SHA-256 of every inline <script> in the built page and splice them into the
 * policy after the build. Result: strict CSP, zero maintenance.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = '__STUDIO_SCRIPT_HASHES__';

export default function studioCsp() {
  return {
    name: 'studio-csp',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const file = fileURLToPath(new URL('studio/index.html', dir));
        let html;
        try { html = await readFile(file, 'utf8'); } catch { return; }
        if (!html.includes(PLACEHOLDER)) return;
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
        html = html.replace(PLACEHOLDER, hashes.join(' '));
        await writeFile(file, html);
        logger.info(`studio CSP: pinned ${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'}`);
      },
    },
  };
}
