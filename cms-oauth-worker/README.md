# CMS OAuth proxy (Cloudflare Worker)

Sveltia/Decap CMS uses GitHub to store edits. The login step needs an OAuth
token exchange that GitHub Pages (a static host) can't perform, because it
requires the OAuth **client secret** — which must never live in the browser or
this repo. This Worker performs that exchange server-side.

## One-time setup

1. **Create a GitHub OAuth App**
   GitHub → Settings → Developer settings → OAuth Apps → *New OAuth App*
   - **Homepage URL:** `https://engr-sharif.github.io`
   - **Authorization callback URL:** `https://<your-worker-subdomain>.workers.dev/callback`
   - Note the **Client ID** and generate a **Client secret**.

2. **Deploy the Worker** (free tier is fine)
   ```bash
   cd cms-oauth-worker
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GITHUB_CLIENT_ID       # paste Client ID
   npx wrangler secret put GITHUB_CLIENT_SECRET   # paste Client secret
   ```
   Copy the deployed URL, e.g. `https://engr-sharif-cms-oauth.<you>.workers.dev`.

3. **Point the CMS at the Worker**
   In `public/admin/config.yml` set:
   ```yaml
   backend:
     base_url: https://engr-sharif-cms-oauth.<you>.workers.dev
   ```
   Commit and push. Visit `https://engr-sharif.github.io/admin/` and log in.

## Local editing (no OAuth needed)
`config.yml` has `local_backend: true`. To edit on your machine:
```bash
npx @sveltia/cms-server   # or: npx decap-server
npm run dev
# open http://localhost:4321/admin/
```

**Never commit the client secret.** It lives only in the Worker (`wrangler
secret put`).
