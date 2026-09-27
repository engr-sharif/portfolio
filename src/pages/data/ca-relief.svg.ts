import type { APIRoute } from 'astro';
import { reliefSvg } from '../../lib/terrain';

/** The dot-relief of California, built from the heightmap at build time. */
export const GET: APIRoute = async () =>
  new Response(await reliefSvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
