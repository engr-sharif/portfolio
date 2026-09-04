#!/usr/bin/env node
/**
 * Post-build smoke test in headless Chromium.
 *
 * Serves ./dist with `astro preview`, loads every page type, and fails on:
 *   - uncaught page errors
 *   - console errors
 *   - Content-Security-Policy violations (reported via securitypolicyviolation)
 *   - reveal elements still hidden after scrolling to the bottom
 *   - a missing generated OG card
 *
 *   npm run build && npm run smoke
 *
 * Uses the pre-installed Chromium when PLAYWRIGHT_CHROMIUM is set, otherwise
 * whatever playwright-core resolves.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = '/portfolio/';
const PORT = Number(process.env.SMOKE_PORT || 4321);
// SMOKE_NO_SDA=1 disables scroll-driven animations in Chromium to exercise the
// IntersectionObserver fallback path (Tier 2 in global.css).
const NO_SDA = process.env.SMOKE_NO_SDA === '1';
const ORIGIN = `http://localhost:${PORT}`;

const routes = [
  '', 'about/', 'projects/', 'tools/', 'blog/', 'studio/',
  ...firstOf('dist/projects', 'projects/'),
  ...firstOf('dist/blog', 'blog/', ['tags']),
  ...firstOf('dist/tools', 'tools/'),
];

function firstOf(dir, prefix, skip = []) {
  try {
    return readdirSync(dir)
      .filter((d) => !skip.includes(d) && statSync(`${dir}/${d}`).isDirectory())
      .slice(0, 2)
      .map((d) => `${prefix}${d}/`);
  } catch { return []; }
}

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', ...(NO_SDA ? ['--disable-blink-features=ScrollTimeline'] : [])] });
console.log(`smoke: ${routes.length} routes · scroll-driven animations ${NO_SDA ? 'DISABLED (fallback path)' : 'enabled'}`);
const failures = [];

for (const route of routes) {
  const url = `${ORIGIN}${BASE}${route}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'} (${(e.sourceFile || '').split('/').pop()}:${e.lineNumber})`);
    });
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });

  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => { problems.push(`nav: ${e.message}`); return null; });
  if (res && res.status() >= 400) problems.push(`HTTP ${res.status()}`);

  // Scroll through so scroll-driven / IO reveals run, then check visibility.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, h);
    await new Promise((r) => setTimeout(r, 900));
  });
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('[data-reveal], [data-reveal-stagger] > *')]
      .filter((el) => el.getBoundingClientRect().height > 0 && Number(getComputedStyle(el).opacity) < 0.9)
      .map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')),
  );
  if (hidden.length) problems.push(`still hidden after scroll: ${hidden.slice(0, 5).join(', ')}${hidden.length > 5 ? ` +${hidden.length - 5}` : ''}`);

  const csp = await page.evaluate(() => window.__cspViolations);
  csp.forEach((v) => problems.push(`csp: ${v}`));

  // OG card present + resolvable (public pages only)
  if (route !== 'studio/') {
    const og = await page.getAttribute('meta[property="og:image"]', 'content');
    if (!og) problems.push('no og:image');
    else {
      const local = og.replace('https://engr-sharif.github.io', ORIGIN);
      const r = await page.request.get(local).catch(() => null);
      if (!r || !r.ok()) problems.push(`og:image not served: ${og}`);
    }
  }

  const hasCsp = await page.$('meta[http-equiv="content-security-policy" i]');
  if (!hasCsp) problems.push('no CSP meta');

  await page.close();
  const label = `/${route}`.padEnd(44);
  if (problems.length) { failures.push({ route, problems }); console.log(`✗ ${label} ${problems.length} problem(s)`); problems.forEach((p) => console.log(`    - ${p}`)); }
  else console.log(`✓ ${label} ok`);
}

await browser.close();
server.kill();
if (failures.length) { console.error(`\n${failures.length} page(s) failed`); process.exit(1); }
console.log(`\nAll ${routes.length} pages clean.`);
