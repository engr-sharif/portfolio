import type { APIRoute } from 'astro';

/** robots.txt built from the configured site + base, so it stays correct on any host. */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const root = new URL(base, site);
  const body = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${base}studio/`,
    '',
    `Sitemap: ${new URL('sitemap-index.xml', root).href}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
