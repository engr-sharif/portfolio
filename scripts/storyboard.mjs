#!/usr/bin/env node
/**
 * A film's storyboard: one still every few seconds, tiled into a single WebP
 * sprite. The cinema player shows the frame under the pointer as you hover
 * its scrubber, and the chapter cards under a film on its page are drawn
 * from it (and scrub through their chapter as the pointer crosses them).
 *
 *   node scripts/storyboard.mjs <film> <out.webp> [--every 2] [--width 320] [--cols 10] [--crop w:h:x:y]
 *
 * <film> is the full cut (an MP4/WebM, or an HLS playlist). Stills are taken
 * from the middle of each interval. --crop trims a letterbox so the stills are
 * the picture alone (find it with ffmpeg's cropdetect). Needs ffmpeg with
 * libwebp on the PATH, or its path in FFMPEG. Prints the frontmatter to paste
 * under the project's `film:`.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args.splice(i, 2)[1];
};
const every = Number(opt('every', 2));
const width = Number(opt('width', 320));
const cols = Number(opt('cols', 10));
const crop = opt('crop', '');
const [input, out] = args;
if (!input || !out) {
  console.error('usage: node scripts/storyboard.mjs <film> <out.webp> [--every 2] [--width 320] [--cols 10] [--crop w:h:x:y]');
  process.exit(1);
}
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const hls = input.endsWith('.m3u8') ? ['-allowed_extensions', 'ALL'] : [];

const probe = spawnSync(ffmpeg, ['-hide_banner', ...hls, '-i', input], { encoding: 'utf8' });
const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr);
if (!m) { console.error(probe.stderr || 'ffmpeg not found'); process.exit(1); }
const duration = +m[1] * 3600 + +m[2] * 60 + +m[3];
const n = Math.ceil(duration / every);
const rows = Math.ceil(n / cols);

const vf = [
  `trim=start=${every / 2}`, 'setpts=PTS-STARTPTS', `fps=1/${every}`,
  ...(crop ? [`crop=${crop}`] : []),
  `scale=${width}:-2:flags=lanczos`, `tile=${cols}x${rows}`,
].join(',');
const run = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...hls, '-i', input, '-an', '-vf', vf,
  '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', '-compression_level', '6', '-y', out], { encoding: 'utf8' });
if (run.status !== 0) { console.error(run.stderr); process.exit(1); }

// the tile height, as scale rounded it
const size = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(probe.stderr);
const [cw, ch] = crop ? crop.split(':').map(Number) : size ? [+size[1], +size[2]] : [16, 9];
const h = Math.round((width * ch) / cw / 2) * 2;
const src = out.replace(/^.*?public(?=\/media\/)/, '');
console.log(`${out}: ${n} stills, ${cols}×${rows}, ${(statSync(out).size / 1024).toFixed(0)} KB\n`);
console.log(`  storyboard:\n    src: ${src}\n    every: ${every}\n    cols: ${cols}\n    rows: ${rows}\n    w: ${width}\n    h: ${h}`);
