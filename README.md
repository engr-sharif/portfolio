# engr-sharif portfolio

Personal portfolio + live project dashboard for **Mohammad "Nawaz" Sharif**,
Environmental Engineer (EIT). Static site, GPU-light motion, and a browser admin
so projects, photos, and text can be updated without touching code.

**Stack:** Astro · React islands · CSS scroll-driven animations (with an
IntersectionObserver fallback) · GSAP for the signature moments (SplitText hero,
Flip lightbox, count-up stats) · Three.js + React Three Fiber · MapLibre GL ·
Tailwind CSS 4 · satori-generated share cards · a strict Content-Security-Policy
on every page · a custom Studio admin · TypeScript. Output is 100% static
(Cloudflare Pages — the Studio's only backend is a small Cloudflare Worker).

---

## Hosting: deploy target & `base` path

The build is **host-agnostic**. Two environment variables decide where it lives:

| Host | `SITE_URL` | `BASE_PATH` |
|---|---|---|
| **Cloudflare Pages (production, the default)** | `https://mosharif.pages.dev` | `/` |
| Custom domain (when added) | `https://<domain>` | `/` |
| GitHub Pages (legacy) | `https://engr-sharif.github.io` | `/portfolio/` |

The legacy address now serves only a redirect (`scripts/redirect-site.mjs`,
deployed by `.github/workflows/deploy.yml`) so old links, QR codes and search
results land on the new home.

Every internal link goes through `withBase()` (`src/lib/path.ts`), every absolute
URL through `Astro.site`, `robots.txt` is generated from both, and the Studio,
share cards and test scripts read the same values — so moving host is a
two-variable change, not a search-and-replace.

**Cloudflare Pages (already set up):** the project `mosharif` is connected to this
repo — build command `npm run build`, output `dist`, variables
`SITE_URL=https://mosharif.pages.dev` and `BASE_PATH=/` for Production and Preview
(Node comes from `.node-version`). Every push to `main` goes live in ~2 minutes;
every other branch/PR gets a preview URL. The Studio Worker's `ALLOWED_ORIGIN`
lists the new origin. `public/_headers` supplies the security/caching headers a
static host can't otherwise send, and `/build.json` is a per-build stamp the
Studio polls to report *Live* truthfully.

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
Studio at `/studio` (see below) or add a file directly:

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

Write from the Studio (`/studio` → **Blog** → New Post) or add a file directly at
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

**From the browser (recommended):** go to **`/studio` → Field Gallery → Photos →
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
in `src/content/settings/site.json`). Until a real PDF is in place the site
detects the placeholder at build time and shows "Request résumé" instead of a
download link (see `src/lib/resume.ts`).

## Editing in the browser (`/studio` — the Studio)

`/studio` is a **custom-built admin** ("the Studio") — a React app under
`src/studio/` that edits content and commits straight back to the repo through a
small Cloudflare Worker (`studio-worker/`, password-protected). No third-party
CMS, no OAuth dance. Desktop and phone; installable; opens offline.

**Studio 2.0 ("Field Desk")** — dense, keyboard-first, drag-and-drop:
- **⌘K command palette** — jump anywhere, create anything, find any loaded entry.
- **Collection tables** with search, status filter, **drag-to-reorder** (mouse,
  touch or keyboard) saved as **one commit** on drop with *Undo*, one-click
  status pills, and **bulk publish / unpublish / delete** (one commit each).
- **Block editor** (TipTap/ProseMirror) for the body: type **`/`** for blocks
  (headings, lists, quote, code, image, video, divider), select text for an
  inline menu, **drop or paste images** straight into the text, an AI assist
  menu (polish / grammar / summarize / expand), and a **Markdown** toggle to
  the raw source. The file stays clean markdown: every real post round-trips
  with identical rendered HTML (tested), and raw embeds are kept byte-exact.
- **Media library** — one tab per managed folder; drop any number of files
  to upload them as **one commit** (images optimised first), multi-select to
  delete, copy a path. **`?`** opens a keyboard-shortcuts sheet.
- **Location picker** — projects get a map card (click to pin, drag, or type
  lat/lng) instead of two bare number fields.
- **Editor** with a publish sidebar, live preview, **⌘S** to save, local drafts
  that survive a closed tab, a **History** drawer with a line diff and *Restore*,
  and image fields that accept **drag-and-drop** uploads with sortable galleries.
- **Truthful publish toast** — tracks the site's build stamp until the deployed
  commit is the one you saved; reports a failed build with the log link.
- **Demo mode** (`/studio/?mock=1`, password `mock`) — an in-memory copy of the
  site seeded from the repo, so anyone can try it; the e2e suite runs on it.
- **Field log** (offline capture → one-commit Field Notes draft), light/dark
  theme, error boundaries with recovery, TanStack Query cache with optimistic
  reorders, real static pages for every deep route (plus `_redirects` on
  Cloudflare for routes newer than the build).

Structure: `src/studio/app` (App, routes, TanStack Query hooks, mock Worker),
`src/studio/ui` (primitives, toasts, palette, error boundary),
`src/studio/features/*` (shell, auth, dashboard, collection, editor). The
Worker API is unchanged.

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
.github/workflows/deploy.yml   GitHub Pages deploy (official Actions flow, main only)
.github/workflows/ci.yml       PR checks: unit tests (vitest) · astro check · build
tests/                         unit tests (frontmatter round-trip, schemas, date range)
scripts/smoke.mjs              headless-Chromium smoke test (CSP, console, reveals, OG)
studio-worker/                 Cloudflare Worker backend for the Studio (auth + commits)
public/
  resume/Sharif_Resume.pdf    résumé (swap via the Studio)
  og-image.png (manual share-image override), robots.txt, favicon.svg, .nojekyll
src/
  assets/covers, assets/gallery   images → optimized via <Image>
  studio/                      the custom admin: Studio, Editor, Field, MarkdownEditor,
                               PreviewPane, image-process, schema, api
  components/                  Hero, FieldAtlas, CaseStudies, ProjectCard, Gallery, About, RecruiterBar,
                               WorkMap (+ WorkMapIsland), three/HeroScene…
  content/projects, blog, tools   one Markdown file per entry (Studio-managed)
  content/settings/            site.json + gallery.json + media.json singletons
  lib/                         motion, hero, theme, atlas, og, images, projects, blog, site…
  layouts/BaseLayout.astro     <head>, SEO/OG/Twitter, JSON-LD, RSS link
  pages/                       index, about, projects/[slug], blog/[slug], 404, rss.xml
  content.config.ts            content collections schema
astro.config.mjs
```

## The Living Atlas (WebGL California)

One persistent WebGL scene sits behind every public page: a point field of
**real California terrain** (Sierra crest, Central Valley, Tahoe, the coast)
with slowly climbing contour lines, a pointer ripple, and the project sites
glowing on their real coordinates.

- **Data** — `node scripts/build-terrain.mjs` fetches SRTM-derived Mapzen
  terrarium tiles + the Natural Earth state boundary and bakes
  `public/data/ca-terrain.png` (192×216 RGBA: elevation, sea flag, in-state
  mask) and `src/data/ca-terrain.json` (bbox, scale). Both are committed; re-run
  only to change resolution.
- **Scene** — `src/components/three/TerrainField.tsx` samples the heightmap in
  the vertex shader (≈ 41k points desktop / 10k phone), mounted once in
  `BaseLayout` with `transition:persist` so the canvas and camera survive View
  Transitions.
- **Stations** — each page declares where the camera should be via `<body
  data-scene>`: `home` (scroll flies hero → Atlas plan view → quiet backdrop),
  `page` (quiet backdrop), `site` (close over `data-scene-lat/lng` — project
  pages). The homepage Field Atlas list emits `atlas:active` on hover to light a
  node; the scene emits `atlas:pose` for the hero HUD readout.
- **Discipline** — DPR capped, render loop paused when the tab is hidden,
  on-demand frames under reduced motion, additive blending only on the dark
  theme, colours from the theme tokens (`--hero-*`).

## Design & motion notes

- **The Living Atlas.** One persistent WebGL scene (`src/components/three/
  TerrainField.tsx`, mounted in BaseLayout with `transition:persist`) renders
  California's real terrain as a point field from a heightmap baked by
  `scripts/build-terrain.mjs` (SRTM tiles + state boundary → `public/data/
  ca-terrain.png`). Pages declare a camera station on `<body data-scene>`
  (`home` scroll flight · `page` backdrop · `site` close-up over lat/lng);
  on the homepage the camera also flies to each case study's site as its row
  crosses the viewport. Project sites glow as nodes with projected labels, a
  coordinate lens follows the pointer over the state, and the hero HUD reads
  the live camera target. Hovering an Atlas row emits `atlas:active`.
- **Kinetic type.** Section and case-study titles settle from light to bold as
  they enter (Space Grotesk's weight axis, scroll-driven, no JS).
- **Two themes.** *Field* (dark, default) and *Lab* (light) are one token set
  each in `global.css`; the toggle lives in the nav (`src/lib/theme.ts`), the
  choice persists in localStorage and follows the OS until you pick, and a
  hashed inline script applies it before first paint. The WebGL hero and the
  MapLibre basemap recolour with the theme.
- **Field Atlas.** The homepage's `FieldAtlas.astro` lists every published site
  with a location beside an intentionally empty stage: the Living Atlas behind
  the page is the map (hover a row, its node lights up). The About page keeps a
  conventional MapLibre map; data prep is shared in `src/lib/atlas.ts`.
- **Case studies.** Projects carry optional `problem` / `approach` / `outcome`
  fields (editable in the Studio). When present they render as a brief on the
  homepage rows (`CaseStudies.astro`) and at the top of the project page.
- **Recruiter bar.** `RecruiterBar.astro` slides in after the first viewport
  (CSS scroll-driven) with résumé / LinkedIn / email; dismiss hides it for the
  session.

- Tokens (color/type/easing) live in `src/styles/global.css` under `@theme`.
- Scrolling is native. Reveals, the hero parallax, the career-timeline fill,
  the topo line-draw and the reading-progress bar are **CSS scroll-driven
  animations** (`animation-timeline: view()`) declared in `global.css` under
  SCROLL-DRIVEN REVEALS — no scroll listeners, no smooth-scroll library.
  Browsers without support get the same motion as CSS transitions toggled by a
  tiny IntersectionObserver in `src/lib/motion.ts` (which also owns the custom
  cursor and magnetic buttons). GSAP stays where it earns its place: the hero
  headline (`src/lib/hero.ts`), the count-up stats and the lightbox
  (`src/lib/lightbox.ts`).
- **Share cards** (`og:image`) are rendered at build time by satori + sharp from
  `src/lib/og.ts` — one branded card per page, with the cover photo when there
  is one. `src/pages/og/[...slug].png.ts` lists the routes; BaseLayout picks the
  matching card automatically. Setting a custom image in Site Settings overrides
  all of them.
- **Content-Security-Policy** is on for every page (`security.csp` in
  `astro.config.mjs`). Astro hashes its own inline scripts; the only inline
  script we write (the `js` class gate) is hashed in BaseLayout, and third-party
  origins are added per page with `Astro.csp.insertDirective`. `npm run smoke`
  builds nothing but drives every page type in headless Chromium and fails on
  any CSP violation, console error, or reveal left invisible.
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

1. **Hosting** — production is Cloudflare Pages at `https://mosharif.pages.dev`
   (`SITE_URL`/`BASE_PATH` live in the Pages project settings). To move to a
   custom domain: Pages project → *Custom domains*, then change `SITE_URL` and
   the Worker's `ALLOWED_ORIGIN`.
2. **GitHub Pages** stays enabled (Source = "GitHub Actions") only to serve the
   redirect from the old `/portfolio/` address.
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
