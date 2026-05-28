/**
 * Base-aware path helper. Astro auto-prefixes the configured `base` onto
 * bundled assets and <Image> output, but NOT onto hardcoded href/src strings.
 * Wrap every internal link/asset path with withBase() so the site works under
 * the /portfolio/ subpath (and would still work if base were ever set to '/').
 *
 *   withBase()            -> "/portfolio/"
 *   withBase('#work')     -> "/portfolio/#work"
 *   withBase('/projects/x/') -> "/portfolio/projects/x/"
 *   withBase('resume/x.pdf') -> "/portfolio/resume/x.pdf"
 */
const BASE = import.meta.env.BASE_URL; // e.g. "/portfolio/" or "/"

export function withBase(path = ''): string {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE; // "/portfolio" or ""
  if (!path) return b || '/';
  return `${b}/${path.replace(/^\//, '')}`;
}
