// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

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
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    // Allow Astro's built-in sharp optimization at build time.
    responsiveStyles: true,
  },
});
