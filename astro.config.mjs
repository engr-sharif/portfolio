// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// NOTE ON DEPLOY TARGET ----------------------------------------------------
// This is configured as a GitHub *user site* deploy at the root domain:
//   site: 'https://engr-sharif.github.io'  +  base: '/'
//
// That is correct ONLY if the repo is named exactly `engr-sharif.github.io`.
// If you deploy from a project repo (e.g. one named `portfolio`), Pages serves
// the site under a subpath and you MUST change base to '/portfolio/' (or your
// repo name). Getting base wrong is the #1 cause of broken CSS/asset paths.
// --------------------------------------------------------------------------
export default defineConfig({
  site: 'https://engr-sharif.github.io',
  base: '/',
  output: 'static',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    // Allow Astro's built-in sharp optimization at build time.
    responsiveStyles: true,
  },
});
