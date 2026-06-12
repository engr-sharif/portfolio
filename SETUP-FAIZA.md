# SETUP — Finishing Faiza's site

This repo was cloned & re-tailored from a sibling portfolio. The **engine, theme,
and content** are already done. What remains is **per-account wiring** that can
only happen now that this repo and Faiza's accounts exist. Work top to bottom.

Assumed handle: **`faizashaheen209`** → site at `https://faizashaheen209.github.io/`.
If the GitHub username differs, substitute it everywhere below.

---

## 0. Sanity check the build
```bash
npm ci
npm run build        # must succeed
npx astro check      # 0 errors
```

## 1. Confirm identity config
All identity lives in **`src/content/settings/site.json`**. Verify these are Faiza's:
`name`, `shortName`, `credential` ("Structural Engineer · DWR"), `role`, `bio`,
`location`, `email`, `linkedin`, `github`, plus the new keys
`employer` ("California Department of Water Resources"), `domain`
("faizashaheen209.github.io"), `repoOwner` ("faizashaheen209"), `repoName`
("faizashaheen209.github.io"), `workerUrl` (fill after step 3).

## 2. Confirm base path = "/" (user-pages site)
- `astro.config.mjs` → `site: 'https://faizashaheen209.github.io'`, `base: '/'`.
  (Already set in the template — just confirm it matches her real username.)
- Because base is `/`, all `withBase()` calls resolve to root — no `/portfolio/`
  prefix. If any literal `/portfolio/` survives a `grep -rn "/portfolio/" src/`,
  replace it (see step 4 for the Studio ones).

## 3. Deploy her Cloudflare Worker (the Studio backend)
The Studio won't work until this exists. Full guide: `studio-worker/README.md`.
```bash
cd studio-worker
# Edit wrangler.toml: name = "faizashaheen209-studio",
#   GITHUB_REPO = "faizashaheen209/faizashaheen209.github.io",
#   ALLOWED_ORIGIN = "https://faizashaheen209.github.io"
npx wrangler login
npx wrangler deploy
npx wrangler secret put STUDIO_PASSWORD     # her admin password
npx wrangler secret put STUDIO_JWT_SECRET   # openssl rand -hex 32
npx wrangler secret put GITHUB_TOKEN        # fine-grained PAT, Contents R/W on HER repo
```
Copy the deployed Worker URL (e.g. `https://faizashaheen209-studio.<her>.workers.dev`).
(Optional AI assistant: Cloudflare Dashboard → AI → Workers AI → enable, then redeploy.)

## 4. Point the Studio at her Worker + repo
These are the hardcoded references that must become hers:
- **`src/studio/api.ts`**
  - `getEndpoint()` default → her Worker URL from step 3.
  - `rawImageUrl()` / `rawRepoUrl()` / `lastDeployTime()` → replace the literal
    `engr-sharif/portfolio` with `faizashaheen209/faizashaheen209.github.io`.
- **`src/studio/Studio.tsx`** — the sidebar "View site" link `href="/portfolio/"` → `/`.
- **`src/studio/MarkdownEditor.tsx`** — the self-hosted video path `\`/portfolio/videos/…\``
  → `/videos/…`.
- **`src/studio/PreviewPane.tsx`, `PublishToast.tsx`** — any `/portfolio/` or repo
  literal → her values.
- Also put the Worker URL in `site.json.workerUrl` for reference.
- `grep -rn "engr-sharif\|/portfolio/" src/studio` should come back clean.

## 5. Enable hosting
- GitHub → repo **Settings → Pages → Source = "GitHub Actions"**.
- `.github/workflows/deploy.yml` deploys on every push to `main`. First push triggers it.
- Set the Worker password somewhere safe; visit `/studio` and log in.

## 6. First content
- `src/content/` is stripped to one example each (clearly marked "EXAMPLE —
  replace me"). Faiza edits/deletes via the Studio.
- Settings (`site.json`, `profile.json`, etc.) are Faiza placeholders — fill in
  real bio, timeline, credentials, social links, résumé.
- The "Where I've worked" map plots structural/water-infrastructure sites she
  adds (dams, levees, pumping plants…) — coordinates come from project frontmatter
  or geotagged gallery photos.

## 7. Optional polish (later)
- Custom domain (e.g. `faizashaheen209.com`) → repo Settings → Pages → Custom domain
  + a `CNAME` file; update `site` in `astro.config.mjs`.
- Swap the (removed) environmental live-data widget for a **California reservoir /
  snowpack** panel (CDEC has a free API) — very on-brand for DWR. Not built yet.
- Field-engineer **calculators** (beam/section/load) as standalone pages — great SEO.

---

### What was already done in the template (don't redo)
- ✅ All of the sibling's content stripped → structural placeholders.
- ✅ Identity centralized into `site.json`; layout/footer/about read from it.
- ✅ Base path set to `/`; astro.config reads site/base from config.
- ✅ Theme reskinned to a **blueprint** palette (slate / steel-blue / concrete).
- ✅ EnviroStor (environmental regulatory) feature removed.
- ✅ AI writing guide in the Worker generalized (no longer in the sibling's voice).
- ✅ This file + `CLAUDE.md` written for context.
