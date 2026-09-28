/**
 * Site-wide behaviour. Small on purpose: theme, nav state, the mobile menu and
 * search are always here; everything else is imported only when the page has
 * an element that needs it. No framework, no animation library.
 */
import { initTheme } from './theme';
import { initNav } from './nav';
import { initSearch } from './search';
import { initPrefetch } from './prefetch';

initTheme();
initNav();
initSearch();
initPrefetch();

const has = (sel: string) => document.querySelector(sel) !== null;

if (has('[data-rail]')) import('./rail').then((m) => m.initRail());
if (has('[data-lightbox]')) import('./lightbox').then((m) => m.initLightbox());
if (has('[data-copy]')) import('./copy').then((m) => m.initCopy());
if (has('[data-contact-form]')) import('./contact').then((m) => m.initContact());
if (has('[data-yt]')) import('./youtube').then((m) => m.initYouTube());
if (has('[data-audio]')) import('./audio').then((m) => m.initAudio());
if (has('[data-loop]')) import('./loop').then((m) => m.initLoops());
if (has('[data-film]')) import('./film').then((m) => m.initFilm());
if (has('[data-peek]')) import('./peek').then((m) => m.initPeek());
if (has('[data-envirostor]')) import('./envirostor').then((m) => m.initEnviroStor());
