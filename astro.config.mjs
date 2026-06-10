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
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    // Allow Astro's built-in sharp optimization at build time.
    responsiveStyles: true,
  },
});
