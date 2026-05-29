// Fontsource packages ship CSS-only (side-effect imports); declare them so
// `astro check` / tsc don't flag the imports in BaseLayout.
declare module '@fontsource-variable/*';
declare module '@fontsource/*';
