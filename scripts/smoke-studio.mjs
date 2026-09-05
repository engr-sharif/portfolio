/**
 * Studio offline smoke test. Builds are assumed done (`npm run build`).
 *
 * Proves the field-log promise: after ONE online visit, /studio/ opens with no
 * network — the service worker has the page and every asset it needs — and
 * the app renders (login form visible). Also fails on any console error or
 * page error while online, and on a missing manifest/worker.
 *
 *   npm run smoke:studio
 * Env: PLAYWRIGHT_CHROMIUM (browser binary), SMOKE_PORT, BASE_PATH.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_PATH || '/';
const PORT = Number(process.env.SMOKE_PORT || 4325);
const ORIGIN = `http://localhost:${PORT}`;
const astroBin = new URL('../node_modules/astro/bin/astro.mjs', import.meta.url);

const WATCHDOG_MS = 4 * 60 * 1000;
setTimeout(() => { console.error(`smoke:studio: watchdog fired after ${WATCHDOG_MS / 1000}s — aborting`); shutdown(2); }, WATCHDOG_MS).unref();

const server = spawn(process.execPath, [fileURLToPath(astroBin), 'preview', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let browser;
function shutdown(code) {
  try { browser?.close?.(); } catch { /* closed */ }
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* gone */ } }
  setTimeout(() => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } process.exit(code); }, 500).unref();
}
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (c) => rej(new Error(`preview server exited early (code ${c})`)));
}).catch((e) => { console.error(e.message); shutdown(2); });

const failures = [];
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`));

  // 1. Online visit: app renders, worker registers, manifest + worker served.
  await page.goto(`${ORIGIN}${BASE}studio/`, { waitUntil: 'networkidle' });
  if (!(await page.locator('.st-login').count())) failures.push('online: Studio did not render its login form');
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))]);
    return reg ? `active scope=${reg.scope}` : 'not ready';
  });
  if (!sw.startsWith('active')) failures.push(`online: service worker ${sw}`);
  for (const f of ['studio.webmanifest', 'studio-sw.js']) {
    const st = await page.evaluate(async (u) => (await fetch(u)).status, `${BASE}${f}`);
    if (st !== 200) failures.push(`online: ${f} returned ${st}`);
  }
  // Give the page time to hand its already-loaded assets to the worker.
  await page.waitForTimeout(7500);
  if (errors.length) failures.push(...errors.map((e) => `online: ${e}`));
  errors.length = 0;

  // 2. Offline reload: the shell must come from the worker's cache and render.
  await ctx.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const seen = await page.waitForSelector('.st-login', { timeout: 15000 }).then(() => true).catch(() => false);
    if (!seen) failures.push(`offline: page loaded (title "${await page.title()}") but the app did not render`);
  } catch (e) {
    failures.push(`offline: reload failed — ${String(e.message).split('\n')[0]}`);
  }
  if (errors.length) failures.push(...errors.map((e) => `offline: ${e}`));
  await ctx.setOffline(false);
} catch (e) {
  failures.push(`fatal: ${e?.message || e}`);
}

if (failures.length) { console.error('✗ Studio offline smoke failed:\n  - ' + failures.join('\n  - ')); shutdown(1); }
else { console.log('✓ Studio: renders online, worker active, manifest + worker served, shell renders OFFLINE after one visit.'); shutdown(0); }
