/**
 * Dev-only helper: generate abstract raster placeholder images so the seeded
 * dashboard + gallery have real, <Image>-optimizable visuals before Nawaz adds
 * field photos. Run with: node scripts/gen-placeholders.mjs
 * Safe to delete once real photos are in place.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const covers = join(root, 'src/assets/covers');
const gallery = join(root, 'src/assets/gallery');
mkdirSync(covers, { recursive: true });
mkdirSync(gallery, { recursive: true });

const palettes = {
  sbmm: ['#1d4632', '#4ca97b', 'XRF · GRID SAMPLING'],
  mgp: ['#15302a', '#2f6f4e', 'MGP REMEDIATION'],
  pfas: ['#123', '#2f6f6f', 'PFAS · GROUNDWATER'],
  cqa: ['#202a20', '#6b8f4e', 'LANDFILL CQA'],
};

function svg(w, h, [a, b, label], i = 0) {
  const lines = Array.from({ length: 9 }, (_, k) => {
    const y = (h / 9) * (k + 0.5) + Math.sin(k + i) * 8;
    return `<path d="M0 ${y} Q ${w / 2} ${y - 30 - i * 4} ${w} ${y}" fill="none" stroke="${b}" stroke-opacity="0.35" stroke-width="1.4"/>`;
  }).join('');
  const dots = Array.from({ length: 60 }, () => {
    const x = Math.random() * w;
    const y = Math.random() * h;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(Math.random() * 2 + 1).toFixed(1)}" fill="${b}" fill-opacity="0.5"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity="0.4"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="#0c0e0d"/>
    <rect width="${w}" height="${h}" fill="url(#g)" opacity="0.7"/>
    ${lines}${dots}
    <text x="${w / 2}" y="${h - 28}" fill="#f4f3ee" fill-opacity="0.85" font-family="monospace" font-size="22" text-anchor="middle" letter-spacing="3">${label}</text>
  </svg>`);
}

for (const [name, p] of Object.entries(palettes)) {
  await sharp(svg(1200, 800, p)).jpeg({ quality: 82 }).toFile(join(covers, `${name}.jpg`));
}

// A handful of gallery field-photo placeholders.
const gp = Object.values(palettes);
for (let i = 0; i < 6; i++) {
  const p = gp[i % gp.length];
  const w = 900;
  const h = i % 3 === 0 ? 1200 : i % 3 === 1 ? 700 : 900;
  await sharp(svg(w, h, [p[0], p[1], `FIELD ${String(i + 1).padStart(2, '0')}`], i))
    .jpeg({ quality: 80 })
    .toFile(join(gallery, `field-${String(i + 1).padStart(2, '0')}.jpg`));
}

console.log('Generated placeholder covers + gallery images.');
