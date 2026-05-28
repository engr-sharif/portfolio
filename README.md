# engr-sharif portfolio

Personal portfolio + live project dashboard for **Mohammad "Nawaz" Sharif**,
Environmental Engineer (EIT). Static site, GPU-light motion, and a browser admin
so projects, photos, and text can be updated without touching code.

**Stack:** Astro · React islands · GSAP (ScrollTrigger / SplitText / Flip) ·
Lenis · Motion · Three.js + React Three Fiber · Tailwind CSS 4 · Sveltia/Decap
CMS · TypeScript. Output is 100% static (GitHub Pages — no server runtime).

---

## ⚠️ Read first: deploy target & `base` path

This site is configured as a GitHub **user site** at the root domain:

```js
// astro.config.mjs
site: 'https://engr-sharif.github.io',
base: '/',
```

That is correct **only if the repo is named exactly `engr-sharif.github.io`**.
This repo is currently named `portfolio`, so you must pick one:

| Option | What to do | Result URL |
| --- | --- | --- |
| **A (recommended)** | Rename the repo to `engr-sharif.github.io` | `https://engr-sharif.github.io/` |
| **B** | Set `base: '/portfolio/'` in `astro.config.mjs` | `https://engr-sharif.github.io/portfolio/` |

Getting `base` wrong is the #1 cause of broken CSS/asset paths on Pages.

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

## How to add gallery media

Drop image files into **`src/assets/gallery/`**, commit, and push. The build
auto-generates an optimized, lazy-loaded masonry gallery — no code edits. Cover
images go in **`src/assets/covers/`** and are referenced by filename.

**Video:** GitHub is a poor video host (100 MB/file limit, no CDN). Do **not**
commit large raw video. Add external embeds (YouTube/Vimeo) under *Site Settings
→ Gallery & Video* in the CMS (`src/content/settings/media.json`).

## How to swap the résumé

Replace **`public/resume/Sharif_Resume.pdf`** with your real PDF (keep the
filename). Update the "last updated" date under *Site Settings* (`resumeUpdated`
in `src/content/settings/site.json`). The current file is a placeholder.

## Editing in the browser (`/admin`)

The CMS (Sveltia, a Decap-compatible drop-in with better media handling) lives at
`/admin`. It commits changes back to the repo via GitHub. Because GitHub Pages is
static, GitHub login needs a small OAuth proxy — see
[`cms-oauth-worker/README.md`](./cms-oauth-worker/README.md).

For local editing without OAuth (`local_backend: true` is already set):
```bash
npx @sveltia/cms-server   # or: npx decap-server
npm run dev               # open http://localhost:4321/admin/
```

---

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages deploy (official Actions flow)
cms-oauth-worker/              Cloudflare Worker OAuth proxy for the CMS
public/
  admin/                      Sveltia/Decap CMS (index.html + config.yml)
  resume/Sharif_Resume.pdf    résumé (placeholder — swap in the real one)
  og-image.png, robots.txt, favicon.svg, .nojekyll
scripts/                      dev-only placeholder generators (deletable)
src/
  assets/covers, assets/gallery   images → optimized via <Image>
  components/                  Hero, Dashboard, ProjectCard, Showcase, Gallery, About…
  components/three/HeroScene   R3F WebGL hero
  content/projects/            one Markdown file per project (CMS-managed)
  content/settings/            site.json + media.json singletons
  lib/                         motion, hero, showcase, lightbox, intro, images, projects
  layouts/BaseLayout.astro
  pages/index.astro, pages/projects/[slug].astro
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

1. **Repo name / base path** — rename to `engr-sharif.github.io` *or* set
   `base: '/portfolio/'` (see the table up top).
2. **GitHub → Settings → Pages → Source = "GitHub Actions".** (The workflow in
   `.github/workflows/deploy.yml` deploys on every push to `main`.)
3. **CMS auth** — create a GitHub OAuth App and deploy the Cloudflare Worker,
   setting `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` as Worker secrets, then
   set `backend.base_url` in `public/admin/config.yml`. Full steps:
   [`cms-oauth-worker/README.md`](./cms-oauth-worker/README.md). **Never commit
   the client secret.**
4. **Résumé** — drop your real PDF at `public/resume/Sharif_Resume.pdf`.
5. **Confidentiality review** — for every seeded project, confirm each
   site/client detail is cleared for public sharing, then set `published: true`.
   The seeds use neutral, public-level descriptions and are confidentiality-gated.
6. **Real field photos** — add them to `src/assets/gallery/`. You can delete the
   placeholder generators (`scripts/gen-*.mjs`) and placeholder images once real
   media is in.
