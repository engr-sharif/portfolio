/**
 * Builds the tiny site that now lives at the OLD address
 * (https://engr-sharif.github.io/portfolio/): every page forwards to the same
 * path on the new host, preserving query string and hash. GitHub Pages cannot
 * send real 301s, so this is the honest maximum: a canonical link + instant
 * meta refresh (works without JS, lands on the home page) and a script that
 * maps deep links (served via 404.html) to their exact new URL.
 *
 *   node scripts/redirect-site.mjs   → ./dist-redirect/{index.html,404.html}
 */
import { mkdirSync, writeFileSync } from 'node:fs';

export const TARGET = (process.env.REDIRECT_TARGET || 'https://mosharif.pages.dev').replace(/\/$/, '');
export const OLD_BASE = process.env.OLD_BASE || '/portfolio/';
const OUT = process.env.REDIRECT_OUT || 'dist-redirect';

/** New URL for an old pathname: strips the old base, keeps the rest. */
export function mapPath(pathname, base = OLD_BASE, target = TARGET) {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  return `${target}/${rest}`;
}

export function page(pathHint = '') {
  const dest = `${TARGET}/${pathHint}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moved — ${TARGET.replace(/^https?:\/\//, '')}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${dest}">
<meta http-equiv="refresh" content="0; url=${dest}">
<script>(function(){var b=${JSON.stringify(OLD_BASE)},p=location.pathname;p=p.indexOf(b)===0?p.slice(b.length):p.replace(/^\\//,'');location.replace(${JSON.stringify(TARGET)}+'/'+p+location.search+location.hash)})();</script>
<style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#0b0d0c;color:#f4f3ee}a{color:#57c08a}p{margin:0;padding:1.5rem;text-align:center}</style>
</head>
<body><p>This site has moved to <a href="${dest}">${dest}</a>.</p></body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, page(''));
  writeFileSync(`${OUT}/404.html`, page(''));
  writeFileSync(`${OUT}/.nojekyll`, '');
  console.log(`redirect site → ${OUT}/ (→ ${TARGET})`);
}
