# CLAUDE.md — Faiza Shaheen Portfolio

> Project memory for Claude Code sessions working in this repo. Read this first.

## What this is
A personal portfolio + custom CMS ("Studio") for **Faiza Shaheen**, a
**structural engineer at the California Department of Water Resources (DWR),
Structural Division**. It was cloned and re-tailored from a sibling project
(an environmental engineer's portfolio) — the *engine* is identical, the
*identity, theme, and content* are hers.

- **Stack:** Astro (static) + React islands + GSAP/Lenis/three.js + MapLibre.
  100% static on GitHub Pages; the Studio's only backend is a small Cloudflare
  Worker (`studio-worker/`).
- **Hosting:** user-pages repo `faizashaheen.github.io` → served at
  `https://faizashaheen.github.io/` with **base path `/`** (NOT `/portfolio/`).
- **Admin:** `/studio` — a custom React CMS that commits to this repo via the
  Worker. Editable content lives in `src/content/`.

## ⚠️ If this site was just cloned, setup is unfinished
Open **`SETUP-FAIZA.md`** and work the checklist. The big remaining items are
all Faiza-specific and can't be done until this repo + her accounts exist:
1. Deploy her own Cloudflare Worker (her password, her GitHub token, her repo).
2. Point the Studio at her Worker URL + swap the hardcoded repo references.
3. Enable GitHub Pages (Settings → Pages → Source = GitHub Actions).

## Architecture quick map
- `src/content/` — projects, blog, tools (markdown) + `settings/*.json` singletons.
- `src/content.config.ts` — Zod schema (mirror of `src/studio/schema.ts` — keep in sync).
- `src/studio/` — the admin app (Studio, Editor, Field, MarkdownEditor, PreviewPane,
  image-process, api, schema, frontmatter).
- `studio-worker/` — Cloudflare Worker backend (auth + GitHub commits + Workers AI).
- `src/lib/` — data loaders + motion. `src/lib/site.ts` is the identity config.
- `src/layouts/BaseLayout.astro` — `<head>`, SEO/OG, JSON-LD, RSS.

## House rules
- Confirm every site/client detail is OK to publish before setting `published: true`
  (DWR is a public agency, but use professional discretion on specific structures).
- Keep `content.config.ts` and `studio/schema.ts` field definitions in sync.
- Don't hardcode identity — it lives in `src/content/settings/site.json`.
