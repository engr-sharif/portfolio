/**
 * Field / Lab theme.
 *
 *   Field — the dark default: ink, paper, field green. The site as a night
 *           survey sheet.
 *   Lab   — the light counterpart: paper surfaces, ink text, deeper greens.
 *
 * The choice lives in localStorage ("theme": "dark" | "light"); with no choice
 * saved we follow prefers-color-scheme. A hashed inline script in BaseLayout
 * applies the attribute before first paint so there's never a flash, and this
 * module owns everything after that: the toggle, the meta theme-color, the
 * WebGL/map listeners (via a `themechange` event), and re-applying the theme
 * after a View Transition (Astro swaps <html> attributes on navigation).
 */
export type Theme = 'dark' | 'light';

const KEY = 'theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0c0e0d', light: '#f4f3ee' };

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function preferred(): Theme {
  return stored() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function applyTheme(theme: Theme, persist = false) {
  const root = document.documentElement;
  const prev = currentTheme();
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  if (persist) {
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  }
  syncToggles(theme);
  if (prev !== theme) window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

function syncToggles(theme: Theme) {
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => {
    const toLight = theme === 'dark';
    btn.setAttribute('aria-pressed', String(theme === 'light'));
    btn.setAttribute('aria-label', toLight ? 'Switch to Lab (light) theme' : 'Switch to Field (dark) theme');
    btn.title = btn.getAttribute('aria-label')!;
  });
}

// One delegated listener survives every navigation.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest?.('[data-theme-toggle]');
  if (!btn) return;
  e.preventDefault();
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
});

// Follow the OS while the visitor hasn't chosen explicitly.
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (!stored()) applyTheme(preferred());
});

// Astro's ClientRouter replaces <html>'s attributes with the incoming page's,
// which never carry data-theme — put it back before the new page paints.
document.addEventListener('astro:after-swap', () => applyTheme(preferred()));
document.addEventListener('astro:page-load', () => syncToggles(currentTheme()));

// First load: the head script already set the attribute; sync the rest.
applyTheme(preferred());
