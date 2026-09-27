# Studio API Worker

The secure backend for the custom **`/studio`** admin. It checks your password,
issues a session token, and commits your edits to GitHub — all server-side, so
no secret ever ships to the browser.

## One-time setup (~5 min, needs your accounts)

### 1. Create a fine-grained GitHub token
GitHub → Settings → Developer settings → **Fine-grained personal access tokens**
→ Generate new token:
- **Repository access:** only `engr-sharif/portfolio`
- **Permissions:** Repository → **Contents: Read and write**
- Copy the token (starts with `github_pat_…`).

### 2. Deploy the Worker
```bash
cd studio-worker
npx wrangler login
npx wrangler deploy
```
Copy the deployed URL, e.g. `https://engr-sharif-studio.<you>.workers.dev`.

### 3. Set the secrets (never committed)
```bash
npx wrangler secret put STUDIO_PASSWORD     # the password you'll log in with
npx wrangler secret put STUDIO_JWT_SECRET   # any long random string (e.g. run: openssl rand -hex 32)
npx wrangler secret put GITHUB_TOKEN        # paste the fine-grained PAT from step 1
```

### 4. Point the studio at your Worker
If your Worker URL differs from the default in `src/studio/api.ts`, update the
`getEndpoint()` default there (or, once, in the browser console on `/studio`:
`localStorage.setItem('studio.endpoint','https://…workers.dev')`).

That's it. Visit **`https://mosharif.pages.dev/studio/`**, sign in with your password, and edit.

## Redeploying after a code change (no CLI needed)
Cloudflare Dashboard → Workers & Pages → **engr-sharif-studio** → **Edit code**
→ replace the contents with the new `worker.js` → **Deploy**. Secrets and vars
are kept. Check the **Settings → Variables** tab has `ALLOWED_ORIGIN` set —
the Worker refuses cross-origin requests without it.

**Latest revision (Ground Truth redesign):** adds `POST /api/preview` (the
Studio's *Preview link*) and removes the old `/api/assist` AI endpoint and its
`[ai]` binding. Nothing else changes, and an older Studio keeps working
against it. Until you redeploy, *Preview link* says the Worker needs updating;
everything else works either way.

## How it works
- **Login:** `POST /api/login` with the password → returns a signed JWT (8 h).
- **Edits:** the studio reads/writes content files via the Worker, which uses
  your `GITHUB_TOKEN` to commit. Every save is a real Git commit → the site
  rebuilds and is live in ~90 seconds.
- **Atomic commits:** `POST /api/commit` writes/deletes several files as ONE
  commit through the Git Data API (blobs → tree → commit → fast-forward ref).
  Used for reordering a collection: one rebuild, never half-applied. Each file
  may carry the sha it was loaded at; a mismatch (or a racing push) is a 409
  and nothing is written.
- **History:** `GET /api/history?path=…` lists the commits that touched a file
  (or the whole site); `GET /api/file?path=…&ref=<sha>` reads a past version.
  Powers the Studio's History drawer and Restore.
- **Deploy status:** `GET /api/deploy-status?commit=<sha>` reads the check run
  Cloudflare Pages posts on the commit, so the Studio can say *Live* or
  *Build failed* honestly. It falls back to an unauthenticated read (the repo
  is public) when the PAT can't read checks.
- **Unlisted preview:** `POST /api/preview` resets the `preview` branch
  (`PREVIEW_BRANCH`, optional) to the live branch, then commits the files
  there as one commit. Cloudflare Pages builds it at
  `https://preview.<project>.pages.dev`. That build shows unpublished entries
  and is never indexed. The live branch is never touched. Pages must build
  preview branches (the default: *Settings → Builds → Branch control →
  Preview: All non-production branches*).

## Security posture
- Password + GitHub token live only in the Worker's environment; the browser
  holds a short-lived session token.
- **CORS fails closed** — only origins listed in `ALLOWED_ORIGIN` are echoed;
  unknown `Origin` headers get a 403.
- **JWT pinned to HS256**; `alg`/`typ`/`sub`/`exp`/`iat` are all checked.
- **Rate limit** (per client IP, in isolate memory): 8 sign-in attempts per
  10 min, 60 commits and 20 previews per 10 min. Pair with a Cloudflare WAF rule for a
  hard ceiling if you ever need one.
- **Repo paths are validated** (relative, no `..`, no control chars) and
  uploads are capped at ~50 MB (the Studio's own limits are far lower:
  Cloudflare Pages refuses any file over 25 MiB).
- Responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`.

## Notes
- To change your password later: `npx wrangler secret put STUDIO_PASSWORD`
  (or Dashboard → Settings → Variables → edit the secret).
- Local dev: add `http://localhost:4321` to `ALLOWED_ORIGIN` (comma-separated).
