/**
 * Studio end-to-end suite against the in-memory mock Worker (demo mode), so it
 * needs no credentials or network. Drives the real UI in headless Chromium:
 * sign in → dashboard → ⌘K → collection table → drag-reorder (keyboard) →
 * edit + ⌘S → toast → history diff → bulk unpublish → field log → mobile.
 * Fails on any page error, console error, or failed same-origin request.
 *
 *   npm run build && npm run e2e:studio
 * Env: PLAYWRIGHT_CHROMIUM, SMOKE_PORT, BASE_PATH.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_PATH || '/';
const PORT = Number(process.env.SMOKE_PORT || 4327);
const ORIGIN = `http://localhost:${PORT}`;
const astroBin = new URL('../node_modules/astro/bin/astro.mjs', import.meta.url);
const WATCHDOG_MS = 5 * 60 * 1000;
setTimeout(() => { console.error(`e2e:studio: watchdog fired after ${WATCHDOG_MS / 1000}s — aborting`); shutdown(2); }, WATCHDOG_MS).unref();

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

import { mkdirSync } from 'node:fs';
mkdirSync('.shots-e2e', { recursive: true });
const failures = [];
const issues = [];
const ignorable = (s) => /raw\.githubusercontent\.com|api\.github\.com|pages\.dev|cartocdn\.com/.test(s); // third-party fetches; some sandboxes have no egress
let page;
async function step(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures.push(`${name}: ${String(e?.message || e).split('\n')[0]}`); console.log(`✗ ${name}`); try { await page?.screenshot({ path: `.shots-e2e/${name.replace(/\W+/g, '-')}.png` }); } catch { /* fine */ } }
}

try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { const src = m.location()?.url || ''; if (m.type() === 'error' && !ignorable(m.text()) && !ignorable(src)) issues.push(`console: ${m.text().slice(0, 300)}${src ? ` @ ${src}` : ''}`); });
  page.on('requestfailed', (r) => { if (!ignorable(r.url())) issues.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(ORIGIN) && !/build\.json/.test(r.url())) issues.push(`http ${r.status()}: ${r.url()}`); });

  await step('sign in (demo mode)', async () => {
    await page.goto(`${ORIGIN}${BASE}studio/?mock=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.st-login', { timeout: 20000 });
    await page.fill('.st-login input[type=password]', 'mock');
    await page.click('.st-login button[type=submit]');
    await page.waitForSelector('.dash', { timeout: 20000 });
  });
  await step('dashboard shows live counts', async () => {
    await page.waitForFunction(() => document.querySelectorAll('.card__stats .num').length >= 3 && [...document.querySelectorAll('.card__stats .num')].some((n) => /\d/.test(n.textContent || '')), null, { timeout: 20000 });
    await page.waitForSelector('.activity__row', { timeout: 20000 });
  });
  await step('⌘K jumps to Projects', async () => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.cmdk__input input:focus', { timeout: 5000 });
    await page.keyboard.type('proj');
    await page.waitForSelector('.cmdk__item.is-active:has-text("Projects")', { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid=entry-row]', { timeout: 20000 });
    if (!/\/studio\/c\/projects/.test(page.url())) throw new Error(`url is ${page.url()}`);
  });
  let titles = [];
  await step('projects table lists entries with statuses', async () => {
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=entry-row]').length >= 3, null, { timeout: 20000 });
    titles = await page.$$eval('[data-testid=entry-row] .tbl__title', (els) => els.map((e) => e.textContent));
    const broken = await page.$$eval('[data-testid=entry-row] .pill--danger', (els) => els.length);
    if (broken) throw new Error(`${broken} rows marked broken`);
  });
  await step('keyboard drag-reorder saves one commit (toast + undo)', async () => {
    const grip = page.locator('[data-testid=entry-row] .grip').first();
    await grip.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await page.waitForSelector('.toast--success:has-text("Order saved")', { timeout: 20000 });
    await page.waitForFunction((first) => document.querySelector('[data-testid=entry-row] .tbl__title')?.textContent !== first, titles[0], { timeout: 20000 });
    const after = await page.$$eval('[data-testid=entry-row] .tbl__title', (els) => els.map((e) => e.textContent));
    if (after[1] !== titles[0]) throw new Error(`expected "${titles[0]}" second, got ${JSON.stringify(after.slice(0, 2))}`);
  });
  await step('edit an entry and save with ⌘S', async () => {
    await page.locator('[data-testid=entry-row] .tbl__open').first().click();
    await page.waitForSelector('.ed', { timeout: 20000 });
    await page.waitForSelector('#f-title', { timeout: 20000 });
    await page.fill('#f-title', (await page.inputValue('#f-title')) + ' (e2e)');
    await page.waitForSelector('.ed__dirty', { timeout: 5000 });
    await page.keyboard.press('Control+s');
    await page.waitForSelector('.toast--progress, .toast--success', { timeout: 20000 });
    await page.waitForSelector('.ed__saved', { timeout: 20000 });
  });
  await step('block editor: slash menu inserts a heading, markdown view shows it', async () => {
    await page.click('.blk-prose');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/head');
    await page.waitForSelector('.slash__item.is-active:has-text("Heading 2")', { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('E2E heading');
    await page.waitForSelector('.blk-prose h2:has-text("E2E heading")', { timeout: 5000 });
    await page.click('.blk-tb .seg__btn:has-text("Markdown")');
    await page.waitForSelector('.blk--source textarea', { timeout: 5000 });
    const src = await page.inputValue('.blk--source textarea');
    if (!src.includes('## E2E heading')) throw new Error('markdown source lacks "## E2E heading"');
    await page.click('.blk-tb .seg__btn:has-text("Blocks")');
    await page.waitForSelector('.blk-prose h2:has-text("E2E heading")', { timeout: 5000 });
    await page.keyboard.press('Control+s');
    await page.waitForSelector('.ed__saved', { timeout: 20000 });
  });
  await step('history drawer diffs a past version', async () => {
    await page.click('button:has-text("History")');
    await page.waitForSelector('.drawer .vlist__item', { timeout: 20000 });
    const n = await page.$$eval('.drawer .vlist__item', (els) => els.length);
    if (n < 2) throw new Error(`expected ≥2 versions after saving, got ${n}`);
    await page.locator('.drawer .vlist__item').nth(1).click();
    await page.waitForSelector('.diff .diff__line--add, .diff .diff__line--del', { timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached', timeout: 5000 });
  });
  await step('back to the list shows the new title', async () => {
    await page.click('.ed__head button:has-text("Projects")');
    await page.waitForSelector('[data-testid=entry-row]', { timeout: 20000 });
    await page.waitForSelector('[data-testid=entry-row] .tbl__title:has-text("(e2e)")', { timeout: 20000 });
  });
  await step('bulk unpublish via one commit', async () => {
    await page.locator('[data-testid=entry-row] input[type=checkbox]').first().check();
    await page.waitForSelector('.bulkbar', { timeout: 5000 });
    await page.click('.bulkbar button:has-text("Unpublish")');
    await page.waitForSelector('.dlg__panel', { timeout: 5000 });
    await page.click('.dlg__foot button:has-text("Unpublish")');
    await page.waitForSelector('.toast--success:has-text("unpublished")', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=entry-row] .pill--draft'), null, { timeout: 20000 });
  });
  await step('field log route renders', async () => {
    await page.goto(`${ORIGIN}${BASE}studio/field-log/`, { waitUntil: 'networkidle' }); // a real static page: reloads work on any host
    await page.waitForSelector('.st-fl', { timeout: 20000 });
  });
  await step('site settings editor loads a JSON file', async () => {
    await page.goto(`${ORIGIN}${BASE}studio/file/site/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ed #f-name', { timeout: 20000 });
    const v = await page.inputValue('#f-name');
    if (!v) throw new Error('name field empty');
  });
  await step('media library: bulk upload is one commit, then delete', async () => {
    await page.goto(`${ORIGIN}${BASE}studio/media/blog/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.mediapg', { timeout: 20000 });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('[data-testid=media-input]', [{ name: 'e2e-pixel-a.png', mimeType: 'image/png', buffer: png }, { name: 'e2e-pixel-b.png', mimeType: 'image/png', buffer: png }]);
    await page.waitForSelector('.toast--success:has-text("Uploaded 2 files")', { timeout: 30000 });
    await page.waitForSelector('[data-testid=media-item] .mcard__name:has-text("e2e-pixel-a.png")', { timeout: 20000 });
    await page.click('[data-testid=media-item]:has-text("e2e-pixel-a.png") .mcard__pick');
    await page.click('[data-testid=media-item]:has-text("e2e-pixel-b.png") .mcard__pick');
    await page.click('.bulkbar button:has-text("Delete")');
    await page.click('.dlg__foot button:has-text("Delete")');
    await page.waitForSelector('.toast--success:has-text("Deleted 2 files")', { timeout: 30000 });
    await page.waitForSelector('[data-testid=media-item] .mcard__name:has-text("e2e-pixel-a.png")', { state: 'detached', timeout: 20000 });
  });
  await step('“?” opens the shortcuts sheet', async () => {
    await page.keyboard.press('Shift+Slash');
    await page.waitForSelector('.keys', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.keys', { state: 'detached', timeout: 5000 });
  });
  await step('mobile drawer opens', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ORIGIN}${BASE}studio/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.dash', { timeout: 20000 });
    await page.click('.topbar__menu');
    await page.waitForSelector('.sd--drawer', { timeout: 5000 });
  });
} catch (e) {
  failures.push(`fatal: ${e?.message || e}`);
}

if (issues.length) failures.push(...issues.map((i) => `runtime: ${i}`));
if (failures.length) { console.error('\n✗ Studio e2e failed:\n  - ' + failures.join('\n  - ')); shutdown(1); }
else { console.log('\nAll Studio e2e steps passed with no runtime errors.'); shutdown(0); }
