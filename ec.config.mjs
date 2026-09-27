// @ts-check
import { defineEcConfig } from 'astro-expressive-code';

// Code blocks follow the site theme: Field (light) and Lab (dark) are the two
// values of <html data-theme>. Frames are drawn with the site's own tokens so
// a snippet reads as a figure, not an embedded widget.
export default defineEcConfig({
  themes: ['github-light', 'github-dark'],
  themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
  useDarkModeMediaQuery: false,
  styleOverrides: {
    borderRadius: '0',
    borderColor: 'var(--rule-2)',
    codeFontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    codeFontSize: '0.875rem',
    codeLineHeight: '1.7',
    uiFontFamily: "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif",
    frames: {
      shadowColor: 'transparent',
      editorTabBarBackground: 'var(--ground-2)',
      terminalTitlebarBackground: 'var(--ground-2)',
    },
  },
});
