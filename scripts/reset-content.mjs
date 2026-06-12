/**
 * reset-content.mjs — strip the sibling's content and seed clean, structural
 * placeholders for a fresh owner. Run once on a freshly-cloned template:
 *
 *   node scripts/reset-content.mjs
 *
 * It deletes all projects/blog/tools entries + uploaded media, and writes one
 * clearly-marked EXAMPLE of each plus reset settings singletons. Safe to re-run.
 */
import { rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const wipeDir = (dir, keepGitkeep = false) => {
  const p = join(root, dir);
  if (existsSync(p)) for (const f of readdirSync(p)) if (f !== '.gitkeep') rmSync(join(p, f), { recursive: true, force: true });
  mkdirSync(p, { recursive: true });
  if (keepGitkeep) writeFileSync(join(p, '.gitkeep'), '');
};
const write = (rel, content) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), content); };

// --- content collections ---
wipeDir('src/content/projects');
write('src/content/projects/example-project.md', `---
title: "Example Structural Project — replace me"
client: "California DWR"
siteType: "Dam / spillway evaluation"
status: "active"
role: "Structural engineer"
startDate: "2025-01"
summary: "A short summary of the project — what the structure was, your role, and the analysis or design work involved. Edit or delete this example in the Studio."
techniques: ["Seismic analysis", "FEA", "Concrete design", "Load rating"]
featured: true
order: 0
location: "Sacramento, CA"
lat: 38.58
lng: -121.49
published: true
---
This is an example project so the site renders before real content is added.
Replace it in the Studio with a real structural project — describe the structure,
the analysis or design approach, and the outcome.
`);

wipeDir('src/content/blog');
write('src/content/blog/example-post.md', `---
title: "Example Post — replace me"
description: "A short example post so the Writing section renders. Edit or delete in the Studio."
pubDate: 2026-01-01
draft: false
tags: ["notes"]
category: "technical"
---
This is an example post. Write field notes, technical write-ups, or professional
reflections here, then publish from the Studio.
`);

wipeDir('src/content/tools');
write('src/content/tools/example-tool.md', `---
name: "Example Tool — replace me"
summary: "A spreadsheet or script you built to speed up structural work."
problem: "Describe the repetitive task this tool solves."
tech: ["Python"]
featured: false
order: 0
published: true
---
Replace this with a real tool, or delete the Tools section content entirely if
it doesn't apply.
`);

// --- settings singletons ---
write('src/content/settings/profile.json', JSON.stringify({
  credentials: [
    { label: 'Engineer-in-Training (EIT)', issuer: 'California', status: 'Active', date: '' },
    { label: 'Professional Engineer (PE)', issuer: 'California — Civil / Structural', status: 'In progress', date: '' },
  ],
  certifications: [],
  timeline: [
    { date: '', title: 'B.S., Civil / Structural Engineering', org: 'University', detail: 'Replace with your education.' },
    { date: 'Present', title: 'Structural Engineer', org: 'California DWR · Structural Division', detail: 'Analysis and design of water infrastructure.' },
  ],
}, null, 2) + '\n');

write('src/content/settings/gallery.json', JSON.stringify({
  note: 'Upload photos from /studio → Field Gallery, or drop files into src/assets/gallery/.',
  photos: [],
}, null, 2) + '\n');

write('src/content/settings/media.json', JSON.stringify({
  galleryNote: 'Drop photos into src/assets/gallery/ — they appear automatically on the next build.',
  videos: [],
}, null, 2) + '\n');

write('src/content/settings/testimonials.json', JSON.stringify({
  note: 'Add recommendations (with permission). Leave empty to hide the section.',
  items: [],
}, null, 2) + '\n');

write('src/content/settings/captions.json', '{}\n');
write('src/content/settings/ai.json', JSON.stringify({ guide: '' }, null, 2) + '\n');

// --- uploaded media (the sibling's photos/resume/videos) ---
for (const d of ['src/assets/covers', 'src/assets/gallery', 'src/assets/blog', 'src/assets/tools', 'src/assets/avatars']) wipeDir(d, true);
for (const d of ['public/resume', 'public/videos', 'public/og']) wipeDir(d, true);

console.log('✓ Content reset. Review, then build. Note: site.json identity + public/og-image.png still need real values.');
