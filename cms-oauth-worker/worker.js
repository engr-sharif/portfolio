/**
 * GitHub OAuth proxy for Sveltia / Decap CMS, as a Cloudflare Worker.
 *
 * A static host (GitHub Pages) can't perform the OAuth token exchange itself —
 * that step needs the client *secret*, which must never ship to the browser or
 * the repo. This tiny Worker does the exchange server-side.
 *
 * SECRETS: set as Worker secrets/vars, NOT in this file:
 *   wrangler secret put GITHUB_CLIENT_SECRET
 *   wrangler secret put GITHUB_CLIENT_ID   (or put it in wrangler.toml [vars])
 *
 * GitHub OAuth App settings:
 *   Homepage URL:               https://engr-sharif.github.io
 *   Authorization callback URL: https://<your-worker>.workers.dev/callback
 *
 * Then in public/admin/config.yml set:
 *   backend.base_url: https://<your-worker>.workers.dev
 */

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) Kick off the OAuth dance.
    if (url.pathname === '/auth') {
      const redirectUri = `${url.origin}/callback`;
      const authUrl = new URL(GITHUB_AUTHORIZE);
      authUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
      authUrl.searchParams.set('state', crypto.randomUUID());
      return Response.redirect(authUrl.toString(), 302);
    }

    // 2) GitHub redirects back here with a code → exchange for a token.
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });

      const tokenRes = await fetch(GITHUB_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await tokenRes.json();

      const result = data.access_token
        ? { token: data.access_token, provider: 'github' }
        : { error: data.error_description || 'OAuth failed' };
      const status = data.access_token ? 'success' : 'error';

      // Hand the result back to the CMS window via postMessage.
      const body = `<!doctype html><html><body><script>
        (function () {
          function send(e) {
            window.opener && window.opener.postMessage(
              'authorization:github:${status}:' + JSON.stringify(${JSON.stringify(result)}),
              e.origin
            );
          }
          window.addEventListener('message', send, false);
          window.opener && window.opener.postMessage('authorizing:github', '*');
        })();
      </script><p>Completing sign-in…</p></body></html>`;

      return new Response(body, { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('CMS OAuth proxy. Use /auth to begin.', { status: 200 });
  },
};
