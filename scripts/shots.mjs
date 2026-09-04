#!/usr/bin/env node
/**
 * Design review screenshots. Serves ./dist and captures full-page shots of the
 * key pages in both themes at desktop + phone widths → ./.shots/*.png
 *
 *   npm run build && node scripts/shots.mjs
 *
 * Not part of CI — a tool for looking at the site the way a visitor does.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.SHOTS_PORT || 4377);
const BASE = `http://localhost:${PORT}/portfolio/`;
const OUT = process.env.SHOTS_OUT || '.shots';
mkdirSync(OUT, { recursive: true });

const pages = [
  ['home', ''],
  ['project', 'projects/sulphur-bank-mercury-mine/'],
  ['projects', 'projects/'],
  ['about', 'about/'],
  ['tools', 'tools/'],
  ['blog', 'blog/'],
];
const viewports = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

const astroBin = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const server = spawn(process.execPath, [astroBin, 'preview', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let browser;
const shutdown = (code) => {
  try { browser?.close?.(); } catch {}
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} process.exit(code); }, 400).unref();
};
setTimeout(() => shutdown(2), 5 * 60 * 1000).unref();
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
}).catch((e) => { console.error(e.message); shutdown(2); });

const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const theme of ['dark', 'light']) {
  for (const [vpName, viewport] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('introSeen', '1'); } catch {} }, theme);
    for (const [name, route] of pages) {
      const page = await ctx.newPage();
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      // let lazy islands + fonts settle, scroll through so everything renders
      await page.evaluate(async () => {
        const h = document.documentElement.scrollHeight;
        for (let y = 0; y <= h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 500));
      });
      const file = `${OUT}/${name}-${theme}-${vpName}.png`;
      await page.screenshot({ path: file, fullPage: true });
      // first-viewport crop too (what a visitor actually lands on)
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${vpName}-fold.png`, fullPage: false });
      console.log('shot', file);
      await page.close();
    }
    await ctx.close();
  }
}
shutdown(0);
