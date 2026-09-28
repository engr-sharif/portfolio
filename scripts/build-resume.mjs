#!/usr/bin/env node
/**
 * Renders the résumé (scripts/resume/resume.html) to the PDF the site serves
 * at public/resume/Sharif_Resume.pdf, with Chromium's print engine, so the
 * type is the site's own and the text stays selectable.
 *
 *   node scripts/build-resume.mjs            # writes the PDF
 *   node scripts/build-resume.mjs --png      # also a PNG of each page, to check the layout
 *
 * Needs a Chromium: Playwright's, or one named in CHROME_PATH.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'scripts', 'resume', 'resume.html');
const out = join(root, 'public', 'resume', 'Sharif_Resume.pdf');
const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(out), { recursive: true });
await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
console.log(`wrote ${out}`);

// every sheet must fit its page: flag any that overflows
const over = await page.$$eval('.sheet', (els) => els.map((e, i) => (e.scrollHeight > e.clientHeight + 1 ? `page ${i + 1} overflows by ${e.scrollHeight - e.clientHeight}px` : '')).filter(Boolean));
if (over.length) { console.error(over.join('\n')); process.exitCode = 1; }

if (process.argv.includes('--png')) {
  await page.setViewportSize({ width: 816, height: 1056 });
  await page.emulateMedia({ media: 'print' });
  const boxes = await page.$$eval('.sheet', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; }));
  for (const [i, clip] of boxes.entries()) await page.screenshot({ path: join(root, 'scripts', 'resume', `page-${i + 1}.png`), clip, fullPage: true });
}
await browser.close();
