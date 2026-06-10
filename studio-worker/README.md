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
and everything else keeps working. Models default to `@cf/meta/llama-3.1-8b-instruct`
(text) and `@cf/llava-hf/llava-1.5-7b-hf` (vision); override via `AI_TEXT_MODEL` /
`AI_VISION_MODEL` in `wrangler.toml` if you want different ones. The assistant's
voice/tone guide lives in the Worker (and is editable at **Studio → AI Assistant**).

## How it works
- **Login:** `POST /api/login` with the password → returns a signed JWT (8 h).
- **Edits:** the studio reads/writes content files via the Worker, which uses
  your `GITHUB_TOKEN` to commit. Every save is a real Git commit → the site
  rebuilds and is live in ~90 seconds.
- **Security:** password + GitHub token live only in the Worker's environment.
  The browser only ever holds a short-lived session token. CORS is locked to
  your site origin (`ALLOWED_ORIGIN` in `wrangler.toml`).

## Notes
- This Worker is separate from the older `cms-oauth-worker` (which backed
  Sveltia). You can retire that one once you've moved fully to the studio.
- To change your password later: `npx wrangler secret put STUDIO_PASSWORD`.
