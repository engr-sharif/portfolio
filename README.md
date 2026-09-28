# engr-sharif portfolio

The portfolio of **Mohammad "Nawaz" Sharif**, Environmental Engineer (EIT), at
<https://mosharif.pages.dev>, and the **Studio**, the browser admin he
publishes it from (including from the field, offline).

The design direction is **Ground Truth**: the site reads like an engineer's
report set, built from real survey data. The home page stands on California,
drawn from real elevation data. The map sits under the whole page, and the
camera travels as you read:

- It rises out of the opening.
- It flies to each site in the index, then descends onto each project's own
  40 km of terrain.
- It cuts the ground open into a geological section for the tools.
- It turns among the field photos standing where they were taken, then pulls
  back to Sacramento.

Every project is a numbered report with a title block, a live 3D key map and
figures. The page margin is a boring log that tracks how far you've
read, and the 404 hits refusal.

**Stack:** Astro 7 (static output) · hand-written WebGL2 · CSS scroll-driven
animations and cross-document View Transitions · Archivo, Newsreader and
IBM Plex Mono, self-hosted · satori share cards · a strict
Content-Security-Policy. The public site ships **no framework JavaScript**;
the Studio is a React app backed by a small Cloudflare Worker. Hosted on
Cloudflare Pages.

---

## Local development

```bash
npm install
npm run dev            # http://localhost:4321
npm run build          # production build → dist/
npm run preview        # serve dist/ (Astro 7 runs it as a background daemon; `astro preview stop` ends it)
```

Node 22 (`.node-version`).

### Checks (all run in CI on every push)

| Command | What it proves |
|---|---|
| `npm test` | Unit tests: schemas, frontmatter round-trips, the Worker's commit and preview routes, the confidentiality scan, video location scrub, terrain projection maths, media helpers |
| `npm run check` | TypeScript and Astro diagnostics |
| `npm run smoke` | Every page type in headless Chromium: no CSP violations, console errors, horizontal overflow or reveals left invisible. CI runs it twice, dark with scroll-driven animations and light without |
| `npm run smoke:studio` | The Studio renders, registers its service worker and opens offline |
| `npm run e2e:studio` | The Studio end to end against an in-memory Worker: editing, ⌘S, clearance, the confidentiality check, preview links, media fields, voice-note upload, field-log memo and clip, the watch list, bulk actions, history |

`node scripts/shots.mjs` saves design-review screenshots of every page (both
themes, desktop and phone) to `.shots/`.

---

## Hosting

Cloudflare Pages project **`mosharif`**, connected to this repo: build
`npm run build`, output `dist`, variables `SITE_URL=https://mosharif.pages.dev`
and `BASE_PATH=/`. A push to `main` is live in about two minutes.

- **Every other branch** gets its own preview URL. Preview builds are
  `noindex` and `robots.txt` disallows everything (`src/lib/build-env.ts`).
- **The `preview` branch** is the Studio's *unlisted preview*. Its build also
  shows unpublished entries and stamps each page "Unlisted preview", at
  `https://preview.mosharif.pages.dev`.
- `public/_headers` sets the security and caching headers. The Studio gets
  its own policy, with camera, microphone and location allowed for itself.
- `public/_redirects` sends the old `/blog/…` addresses to `/notes/…` and
  serves the Studio's deep links.
- `/build.json` is a per-build stamp the Studio polls, so it only says *Live*
  once the site has actually rebuilt.
- The old GitHub Pages address serves only a redirect
  (`scripts/redirect-site.mjs`, `.github/workflows/deploy.yml`).

Moving to a custom domain takes two changes: `SITE_URL` in the Pages settings,
and the Worker's `ALLOWED_ORIGIN`. Every link goes through `withBase()`, and
every absolute URL goes through `Astro.site`.

---

## Publishing with the Studio (`/studio`)

A custom admin (no third-party CMS) that commits straight to this repo through
the Worker in [`studio-worker/`](./studio-worker/README.md). It sits behind a
password, works on desktop and phone, installs as an app, and opens offline.
Try it without a password at `/studio/?mock=1` (password `mock`). That demo
runs on an in-memory copy of the site; nothing is saved.

**Writing.** Projects, notes and tools each have a schema-driven form and a
block editor (type `/` for blocks; drop or paste images; a Markdown toggle).
Every save is one commit and works with ⌘S. Drafts are kept in the browser as
you type. A History drawer diffs past versions and restores them. ⌘K jumps
anywhere. There is no built-in AI writing help: draft in Claude, then paste
the text in.

**Before it goes live.** Every entry that publishes goes through two checks:

1. **Clearance (projects).** Four boxes: names, photos, location and data are
   cleared for public sharing. *Published* can't be switched on until all
   four are ticked, and unticking one takes the project offline. The date is
   recorded in the file (`clearance`).
2. **Automatic check (everything).** A read of the fields and write-up for
   precise coordinates, lab results with units (mg/kg, µg/L, ng/L…), street
   addresses, parcel numbers, phone numbers, and any name on your **watch
   list**. Findings show in context in the sidebar. Publishing with anything
   unreviewed asks you to read it first. It is a checklist, not a judge: a
   regulatory limit looks exactly like a lab result.

The **watch list** (Studio → Watch list) holds names that must never appear:
clients, sites, people. The repo stores only salted hashes
(`src/content/settings/watchlist.json`), so the file doesn't show the names.
That keeps them from a casual reader, but not from someone guessing a
specific name.

**Preview link.** This builds the current version at the unlisted preview
address without touching the live site, so you can read it as a visitor
would or send it for review. Each preview replaces the last one.

**Location precision.** Map positions are always rounded:
`site` ≈ 1 km, `town` ≈ 10 km, `region` ≈ 50 km (a per-project setting).
Coordinates typed into text are not rounded, which is what the automatic
check is for.

### Media

| Kind | Where it lives | Limits | Notes |
|---|---|---|---|
| Photos | `src/assets/…` | optimised on upload | HEIC → JPEG, ≤ 2400 px, **EXIF (and GPS) stripped** by re-encoding. If re-encoding fails, the upload stops rather than send the original. |
| Photo GPS | project `photoPlaces` | read before stripping | Fills an empty project location, flags a photo taken over 25 km from its project, and is stored **rounded to the project's privacy setting**. The home map moves a photo off its project's position only when it was taken at another site. |
| Video | **YouTube** | none | Paste the link. The site shows a poster and loads YouTube's privacy-enhanced player only when someone presses play. |
| Short loops | `public/media/loops/` | 20 s, 8 MB | Silent, play when visible, a poster frame is taken for you. **Phone GPS is blanked in place** before upload. |
| Voice notes | `public/media/audio/` | 15 MB | Record in the Studio or upload. The waveform is computed in the browser, and a transcript field sits alongside. |
| PDFs | `public/media/docs/` | 10 MB | Only documents that are already public. |

The limits keep the site deployable: Cloudflare Pages rejects any file over
25 MiB, and everything committed stays in git history for good. The Media
library shows where each file is used and warns before you delete one that
something still references.

### Field log (offline)

Capture on site with no signal: a title, notes, a GPS fix, photos, a **voice
memo** and short **clips**. Everything stays on the device (IndexedDB) until
you publish. Publishing turns a capture into a Field Notes **draft**: photos
are optimised, clips get a poster frame and their GPS blanked, and the memo
gets its waveform. The files land before the note does, so a note never
appears without its media. When you're back in signal, *Publish all*
publishes every waiting capture.

---

## Content model

`src/content/schemas.ts` is the single source of truth. The build and the
Studio validate against the same rules, so an entry the Studio saves can't
break the build.

- **Projects** (`src/content/projects/*.md`): the report pages. `published`
  plus `clearance` gate them; they also take `lat`/`lng`/`privacy`, `video`,
  `audio`, `documents` and a gallery.
- **Notes** (`src/content/blog/*.md`, served at `/notes/`): `draft` gates
  them. Notes from the field log carry `category: field-notes`.
- **Tools** (`src/content/tools/*.md`): each gets a hand-drawn schematic
  (`src/components/tools/Schematic.astro`), or a `loop` screen recording
  once one is uploaded.
- **Settings** (`src/content/settings/*.json`): site details, career and
  credentials, gallery, captions and the watch list.

Titles and summaries get printer's quotes at build time; files keep what was
typed.

---

## How it's built

```
src/
  pages/            routes: /, /projects, /tools, /notes, /about, /cv, /colophon, 404, share cards, search.json
  layouts/          BaseLayout: fonts, theme, CSP-hashed inline script, rail, search
  components/
    site/           nav, footer, depth rail (boring log), search
    home/           the ground layer, opening, atlas, work, tools, notes, field, about, contact (+ ground.css)
    ui/             title block, figure + lightbox, locator (key map), state map, status
    media/          YouTube facade, loop, audio player
  scripts/          vanilla TS, lazy-loaded per feature; ground/ is the WebGL engine, the home choreography and the key map
  lib/              content queries, terrain maths, privacy rounding (privacy.ts), site close-ups (sites.ts), share cards, build env
  styles/           tokens, base, layout, components
  studio/           the Studio (React): app/, ui/, features/*, media + confidentiality modules
studio-worker/      the Cloudflare Worker (paste worker.js into the dashboard)
scripts/            terrain build, smoke/e2e suites, screenshots, redirect site
tests/              vitest
```

**The ground.**

Data:

- `scripts/build-ground.mjs` bakes California from Mapzen Terrarium
  elevation tiles (SRTM, NED, GMTED), a Natural Earth boundary and Natural
  Earth lakes. The output is `public/data/ca-ground.webp`: 384 × 432 cells,
  with elevation in whole metres (R·256 + G) and flags for sea, lake,
  California and neighbouring land. The sea is flood-filled from the map
  edge, so Death Valley stays land.
- Each project's close-up is baked at build time by
  `src/pages/data/site/[slug].webp.ts`. It covers 40 km around the project's
  public (rounded) position, sampled from ~120 m tiles, and is always at
  least four times wider than the rounding. If the tiles can't be fetched,
  the build writes a placeholder and that site keeps the statewide ground.
- `scripts/build-terrain.mjs` still bakes the smaller `ca-terrain.png` behind
  the flat dot-relief figures.

`src/scripts/ground/` holds the engine:

- `world.ts` holds the geometry: point clouds, hillshade, and the schematic
  section with borings and water table.
- `shaders.ts` draws water as the cartographer's horizontal hatch.
- `engine.ts` is one WebGL2 canvas with damped camera goals, the torch and
  coordinate lens under the cursor, drag to orbit, and HTML overlays
  (stakes, borings, photo cards) projected each frame. It draws only while
  something moves.
- `home.ts` is the choreography. Elements marked `data-ground="<stage>"` are
  anchors, and the pose and scene are blended between the two either side of
  mid-screen, with an arc on long hops.
- `keymap.ts` runs the live key map on report pages. The home ground morphs
  into it through a shared `view-transition-name`.

Fallbacks and settings:

- Without WebGL, or if the context is lost, the home page shows the still
  relief, and the sheets carry their own locator figures.
- Under reduced motion, each stage is a finished still.
- Phones get lighter point density and a window onto the map at each stage.

**Motion.** Reveals are CSS scroll-driven animations (`animation-timeline:
view()`) with an IntersectionObserver fallback. Page-to-page morphs (a project
card's title and figure into its report) are native cross-document View
Transitions. Everything honours `prefers-reduced-motion`.

**Accessibility.** Every text colour pair is checked against WCAG AA in both
themes. The site is fully keyboard-navigable (skip link, visible focus,
dialog focus management), and the lightbox and search are real `<dialog>`s.

---

## Manual steps for Nawaz

These need your accounts or your judgement:

1. **Redeploy the Studio Worker.** Paste the current
   [`studio-worker/worker.js`](./studio-worker/worker.js) into the Cloudflare
   dashboard. This adds preview links (`/api/preview`) and removes the old AI
   endpoint. The Studio keeps working on the old Worker, but *Preview link*
   will ask for the update.
2. **Clear each live project.** On its next save the Studio asks you to tick
   the four clearance boxes. That is your confirmation that each detail is
   public; nobody else can give it.
3. **Fill the watch list** with client, site and people names that must never
   appear.
4. **Name your university** in the career log (Studio → Career &
   Credentials). It currently says "University".
5. **Confirm the field photos** in the gallery are cleared (no identifiable
   people, plates or client signage).
6. **Résumé PDF:** the résumé is designed in `scripts/resume/resume.html` and
   rendered to `public/resume/Sharif_Resume.pdf` with
   `node scripts/build-resume.mjs` (add `--png` for page previews). Edit the
   HTML, rebuild, commit the PDF. The home, About and CV pages offer it for
   download (`src/lib/resume.ts` hides the links if the file goes missing).
7. **Tool loops** (optional): record 5–15 s of each tool in use with sample
   data and upload it on the tool's page in the Studio. It replaces the
   schematic.
