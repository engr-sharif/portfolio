// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import { remarkReadingTime } from './src/lib/remark-reading-time.mjs';

// DEPLOY TARGET: project site at https://engr-sharif.github.io/portfolio/
// The repo is named `portfolio`, so Pages serves it under the /portfolio/
// subpath — hence base: '/portfolio/'. All internal links go through the
// withBase() helper (src/lib/path.ts) so they resolve correctly under the base.
// --------------------------------------------------------------------------
export default defineConfig({
  site: 'https://engr-sharif.github.io',
  base: '/portfolio/',
  output: 'static',
  // Match GitHub Pages directory serving + our withBase('/x/') links, and keep
  // canonical/sitemap URLs consistent (avoids duplicate-URL SEO signals).
  trailingSlash: 'always',
  // Expressive Code must be registered before React/MDX.
  integrations: [
    expressiveCode({
      themes: ['github-dark'],
      styleOverrides: {
        borderRadius: '0.6rem',
        codeFontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      },
    }),
    react(),
    sitemap({
      // Keep the private admin out of the public sitemap.
      filter: (page) => !page.includes('/studio'),
    }),
    pagefind(),
  ],
  markdown: {
    remarkPlugins: [remarkReadingTime],
  },
  // Near-instant navigation: every internal link is prefetched as it enters
  // the viewport. (Speculation-Rules prerendering is deliberately off: Chromium
  // ignores 'inline-speculation-rules' whenever script-src carries hashes
  // unless 'strict-dynamic' is also set, and strict-dynamic would block
  // Astro's parser-inserted module scripts. Revisit when Astro emits SRI.)
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
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
      // 'wasm-unsafe-eval' → Pagefind's search index runs as WebAssembly
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    // Allow Astro's built-in sharp optimization at build time.
    responsiveStyles: true,
  },
});
