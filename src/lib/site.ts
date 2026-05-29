/**
 * Site-wide settings (the "About / Settings" singleton).
 * Editable via the CMS at /admin → Site Settings, which writes to
 * src/content/settings/site.json. We read that JSON here with a typed
 * fallback so the site always renders even before the CMS is wired up.
 */
import siteJson from '../content/settings/site.json';

export interface SiteSettings {
  name: string;
  shortName: string;
  credential: string;
  role: string;
  heroTitle?: string;
  bio: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  resume: string;
  resumeUpdated: string;
  /** GoatCounter subdomain for privacy-friendly analytics ("" = disabled). */
  analytics?: string;
}

export const site = siteJson as SiteSettings;

export const nav = [
  { label: 'Work', href: '/#work' },
  { label: 'Field', href: '/#field' },
  { label: 'Writing', href: '/blog/' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
];
