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

That's it. Visit **`/portfolio/studio/`**, sign in with your password, and edit.

### 5. (Optional) Enable the AI assistant
The Studio's ✨ assistant (polish/summarize/expand text, and write captions/alt
text from photos) runs on **Cloudflare Workers AI** — open-source models on
Cloudflare's free tier, no extra API key. The binding is already declared in
`wrangler.toml`:
```toml
[ai]
binding = "AI"
```
Just enable Workers AI on your Cloudflare account (Dashboard → **AI** → Workers
AI → follow the one-time enable prompt) and redeploy:
```bash
cd studio-worker && npx wrangler deploy
```
Until that's done, the ✨ buttons return a friendly "AI not enabled yet" message
and everything else keeps working. Models default to
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` (text — best writing quality on
Workers AI) and `@cf/llava-hf/llava-1.5-7b-hf` (vision); override via
`AI_TEXT_MODEL` / `AI_VISION_MODEL` in `wrangler.toml`. If the 70B model uses too
much of the free daily allowance, drop the text model to
`@cf/meta/llama-3.1-8b-instruct` for faster, cheaper edits. The assistant's
voice/tone guide lives in the Worker (and is editable at **Studio → AI Assistant**).

## Redeploying after a code change (no CLI needed)
Cloudflare Dashboard → Workers & Pages → **engr-sharif-studio** → **Edit code**
→ replace the contents with the new `worker.js` → **Deploy**. Secrets and vars
are kept. Check the **Settings → Variables** tab has `ALLOWED_ORIGIN` set —
since this revision the Worker refuses cross-origin requests without it.

## How it works
- **Login:** `POST /api/login` with the password → returns a signed JWT (8 h).
- **Edits:** the studio reads/writes content files via the Worker, which uses
  your `GITHUB_TOKEN` to commit. Every save is a real Git commit → the site
  rebuilds and is live in ~90 seconds.
- **Deploy status:** `GET /api/deploy-status?since=<ms>` reads the Actions run
  for the deploy branch so the Studio can say *Live* / *Build failed* honestly
  (falls back to an unauthenticated read — the repo is public — when the PAT
  has no Actions permission).
- **AI:** `POST /api/assist` proxies to Workers AI. Vision tasks only accept
  images hosted in this repo (`raw.githubusercontent.com/<repo>/…`).

## Security posture
- Password + GitHub token live only in the Worker's environment; the browser
  holds a short-lived session token.
- **CORS fails closed** — only origins listed in `ALLOWED_ORIGIN` are echoed;
  unknown `Origin` headers get a 403.
- **JWT pinned to HS256**; `alg`/`typ`/`sub`/`exp`/`iat` are all checked.
- **Rate limits** (per client IP, in isolate memory): 8 sign-in attempts per
  10 min, 40 assist calls per 10 min. Pair with a Cloudflare WAF rule for a
  hard ceiling if you ever need one.
- **Repo paths are validated** (relative, no `..`, no control chars) and
  uploads are capped at ~50 MB; assist input at 20k chars / 8 MB images.
- Responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`.

## Notes
- To change your password later: `npx wrangler secret put STUDIO_PASSWORD`
  (or Dashboard → Settings → Variables → edit the secret).
- Local dev: add `http://localhost:4321` to `ALLOWED_ORIGIN` (comma-separated).
