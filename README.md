# engr-sharif portfolio

Personal portfolio + live project dashboard for **Mohammad "Nawaz" Sharif**,
Environmental Engineer (EIT). Static site, GPU-light motion, and a browser admin
so projects, photos, and text can be updated without touching code.

**Stack:** Astro · React islands · GSAP (ScrollTrigger / SplitText / Flip) ·
Lenis · Motion · Three.js + React Three Fiber · MapLibre GL · Tailwind CSS 4 ·
a custom Studio admin · TypeScript. Output is 100% static (GitHub Pages — the
Studio's only backend is a small Cloudflare Worker).

---

## Deploy target & `base` path

This site deploys as a GitHub **project site** and is shareable at:

> **https://engr-sharif.github.io/portfolio/**

```js
// astro.config.mjs
site: 'https://engr-sharif.github.io',
base: '/portfolio/',   // matches the repo name → served under /portfolio/
```

All internal links/assets go through `withBase()` (`src/lib/path.ts`) so they
resolve correctly under the subpath. If you ever rename the repo to
`engr-sharif.github.io` (a user site at the root domain), just change `base`
back to `'/'` — everything else keeps working.

---

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # production build → dist/
npm run preview    # serve the production build locally
```

Node 20+ recommended.

---

## How to add a project (no code)

Each project is one Markdown file in `src/content/projects/`. Either edit via the
CMS at `/admin` (see below) or add a file directly:

```md
---
title: "New Project"
client: "Client / Site"
siteType: "Site characterization"
status: "active"          # active | complete | proposed
role: "Field & sampling support"
startDate: "2025-01"      # YYYY-MM
endDate: "2025-06"        # optional
summary: "One-line public summary."
techniques: ["XRF scanning", "Grid sampling"]
coverImage: "myproject.jpg"   # filename in src/assets/covers/
gallery: ["field-01.jpg"]     # optional, filenames in src/assets/gallery/
featured: false
order: 5
published: false          # ← stays hidden until you confirm it's public-safe
---

Markdown write-up here (public, high-level only).
```

> **Confidentiality:** a project only appears on the site when `published: true`.
> Leave it `false` until every site/client detail is cleared for public sharing.

## How to add a blog post

Write from the CMS (`/admin` → **Blog** → New Post) or add a file directly at
`src/content/blog/<slug>.md`:

```md
---
title: "My Post"
description: "One-line summary (used for the card + SEO, < 200 chars)."
pubDate: 2026-05-29
coverImage: "my-cover.jpg"   # filename in src/assets/blog/ (optional)
coverAlt: "Describe the image"
tags: ["XRF", "Field methods"]
category: "technical"        # field-notes | technical | professional
relatedProject: "sulphur-bank-mercury-mine"   # optional, links to a project
draft: true                  # ← stays hidden on the live site until false
---

## A heading
Markdown body. `##`/`###` headings auto-build the table of contents. Code
blocks get syntax highlighting + a copy button automatically.
```

> **Heads up:** the CMS has no separate review step — **Save = publish**. The
> `draft` flag is the gate: leave it `true` until the post is ready, then flip
> it to `false`. Reading time is computed automatically; the post appears on
> `/blog/`, its tag pages, the RSS feed (`/rss.xml`), and the sitemap.

## How to add gallery media

**From the browser (recommended):** go to **`/admin` → Field Gallery → Photos →
Add Photo**, upload an image, and write a short alt-text description. Drag to
reorder. Saving commits the photo to `src/assets/gallery/` and the optimized,
lazy-loaded masonry gallery rebuilds automatically.

**Or by hand:** drop image files into **`src/assets/gallery/`** and push — if the
CMS photo list is empty, the gallery auto-globs that folder as a fallback. Cover
images live in `src/assets/covers/` and blog images in `src/assets/blog/`.

Keep uploads reasonably small (phone photos are fine; avoid 10MB+ originals).

**Video:** GitHub is a poor video host (100 MB/file limit, no CDN). Do **not**
commit large raw video. Add external embeds (YouTube/Vimeo) under *Site Settings
→ Video embeds* in the CMS.

## How to swap the résumé

Replace **`public/resume/Sharif_Resume.pdf`** with your real PDF (keep the
filename). Update the "last updated" date under *Site Settings* (`resumeUpdated`
in `src/content/settings/site.json`). The current file is a placeholder.

## Editing in the browser (`/admin` — the Studio)

`/admin` is a **custom-built admin** ("the Studio") — a React app under
`src/studio/` that edits content live and commits straight back to the repo
through a small Cloudflare Worker (`studio-worker/`, password-protected). No
third-party CMS, no GitHub OAuth dance. It works on desktop and mobile.

What it can do:
- **Edit any collection** — projects, blog, tools — and the **Site Settings**
  singleton (name, bio, social links, SEO title/description, social-share image).
- **Markdown editor** with a formatting toolbar, drag-and-drop images, a
  **video** button (paste a YouTube/Vimeo link, or upload a short MP4), and a
  **live preview** toggle (side-by-side on desktop, swaps in on mobile).
- **Media** — image upload + a media library to reuse existing assets.
- **Headshot** and **résumé PDF** upload, **reorder / duplicate / search**
  entries, and an **unsaved-changes guard**.

### Image pipeline (automatic on upload)
Every uploaded photo is processed in the browser before it's committed
(`src/studio/image-process.ts`):
- **HEIC/HEIF → JPEG** so iPhone photos render on the built site.
- **Downscaled** to ~2400px @ q0.85 with EXIF orientation honoured (Astro then
  generates responsive sizes from that source).
- **EXIF GPS + capture date are read first** (re-encoding strips them) and saved
  onto Field Gallery photos as `lat`/`lng`/`takenAt` — this feeds the map.

### "Where I've worked" map
`src/components/WorkMap.astro` + `WorkMapIsland.tsx` render a MapLibre map on the
About page with two toggleable layers: **project sites** (projects carrying
`lat`/`lng`) and **field photos** (gallery points geotagged on upload).
Coordinates are **snapped to ~1 km** for client confidentiality, and projects
stay behind the `published` gate. Add a project to the map by setting its
location in the Studio (or `lat`/`lng` in frontmatter).

---

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages deploy (official Actions flow)
studio-worker/                 Cloudflare Worker backend for the Studio (auth + commits)
public/
  admin/                      Studio entry (mounts src/studio)
  resume/Sharif_Resume.pdf    résumé (swap via the Studio)
  og-image.png, robots.txt, favicon.svg, .nojekyll
src/
  assets/covers, assets/gallery   images → optimized via <Image>
  studio/                      the custom admin: Studio, Editor, Field, MarkdownEditor,
                               PreviewPane, image-process, schema, api
  components/                  Hero, Dashboard, ProjectCard, Showcase, Gallery, About,
                               WorkMap (+ WorkMapIsland), three/HeroScene…
  content/projects, blog, tools   one Markdown file per entry (Studio-managed)
  content/settings/            site.json + gallery.json + media.json singletons
  lib/                         motion, hero, showcase, images, projects, blog, site…
  layouts/BaseLayout.astro     <head>, SEO/OG/Twitter, JSON-LD, RSS link
  pages/                       index, about, projects/[slug], blog/[slug], 404, rss.xml
  content.config.ts            content collections schema
astro.config.mjs
```

## Design & motion notes

- Tokens (color/type/easing) live in `src/styles/global.css` under `@theme`.
- Global motion (Lenis smooth scroll, custom cursor, magnetic buttons, scroll
  reveals) is in `src/lib/motion.ts`; the hero reveal in `src/lib/hero.ts`; the
  pinned showcase in `src/lib/showcase.ts`; lightbox in `src/lib/lightbox.ts`.
- **Every animation respects `prefers-reduced-motion`** and degrades on touch
  (no hover-only dead-ends; no scroll-jacking on phones). The WebGL hero pauses
  off-screen and freezes under reduced-motion.

## Performance

- All images go through Astro `<Image>` (responsive WebP, lazy-loaded).
- The Three.js hero is isolated into its own chunk, loaded via `client:visible`
  so it never blocks first paint/LCP (the headline is plain HTML/CSS).
- Run a Lighthouse check after deploy; target ≥ 90 Performance / ≥ 95 A11y.

---

## ✅ Manual steps for Nawaz

These need your own credentials/judgment — they are **not** done in this repo:

1. **Base path** — already set to `/portfolio/` so the site is shared at
   `https://engr-sharif.github.io/portfolio/`. (Only change this if you rename
   the repo to `engr-sharif.github.io`.)
2. **GitHub → Settings → Pages → Source = "GitHub Actions".** (The workflow in
   `.github/workflows/deploy.yml` deploys on every push to `main`.)
3. **Studio backend** — deploy the Cloudflare Worker and set its secrets
   (`STUDIO_PASSWORD`, `STUDIO_JWT_SECRET`, and a GitHub token). Full steps:
   [`studio-worker/README.md`](./studio-worker/README.md). **Never commit the
   secrets.**
4. **Résumé** — upload your PDF in the Studio (Site Settings → Résumé), or drop
   it at `public/resume/Sharif_Resume.pdf`.
5. **Confidentiality review** — for every seeded project, confirm each
   site/client detail is cleared for public sharing, then set `published: true`.
   The seeds use neutral, public-level descriptions and are confidentiality-gated.
6. **Real field photos** — add them to `src/assets/gallery/`. You can delete the
   placeholder generators (`scripts/gen-*.mjs`) and placeholder images once real
   media is in.
