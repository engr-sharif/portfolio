// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

// DEPLOY TARGET — configurable per host, defaults to Cloudflare Pages (production):
//   Cloudflare Pages (default)   SITE_URL=https://mosharif.pages.dev     BASE_PATH=/
//   Custom domain (later)        SITE_URL=https://<domain>               BASE_PATH=/
//   GitHub Pages (legacy)        SITE_URL=https://engr-sharif.github.io  BASE_PATH=/portfolio/
//                                (now serves only a redirect — see .github/workflows/deploy.yml)
// Every internal link goes through withBase() (src/lib/path.ts) and every
// absolute URL through Astro.site, so switching host is a two-variable change.
// --------------------------------------------------------------------------
const SITE_URL = process.env.SITE_URL || 'https://mosharif.pages.dev';
const BASE_PATH = process.env.BASE_PATH || '/';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  output: 'static',
  // Match static directory serving + our withBase('/x/') links, and keep
  // canonical/sitemap URLs consistent (avoids duplicate-URL SEO signals).
  trailingSlash: 'always',
  // Expressive Code must be registered before React/MDX.
  integrations: [
    // Options live in ec.config.mjs (functions can't be serialised here).
    expressiveCode(),
    react(),
    sitemap({
      // Keep the private admin out of the public sitemap.
      filter: (page) => !page.includes('/studio') && !page.includes('/styleguide'),
    }),
  ],
  // Astro 7 defaults to JSX-style whitespace stripping, which would eat the
  // spaces between inline elements in running text. Keep HTML-aware output.
  compressHTML: true,
  // Prefetching is done by the public site itself (src/scripts/prefetch.ts,
  // on hover and focus) so the Studio, a client-side app, is left alone.
  prefetch: false,
  // Content-Security-Policy on every page. Astro hashes its own inline
  // scripts/styles (islands, hoisted modules, View Transitions); the site's
  // one deliberate inline script (the `js` class gate) is hashed in
  // BaseLayout, and each page adds only the third-party origins it uses via
  // Astro.csp.insertDirective (BaseLayout for the public site, studio/index
  // for the admin). Baseline below is what EVERY page gets.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  image: {
    // Allow Astro's built-in sharp optimization at build time.
    responsiveStyles: true,
  },
});
