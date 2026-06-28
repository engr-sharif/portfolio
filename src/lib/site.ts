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
  /** Headshot image (CMS-managed filename, resolved via lib/images). */
  avatar?: string;
  bio: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  resume: string;
  resumeUpdated: string;
  /** Editable SEO / social-share overrides ("" = built-in default). */
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  /** GoatCounter subdomain for privacy-friendly analytics ("" = disabled). */
  analytics?: string;
  /** Web3Forms access key for the contact form ("" = mailto fallback). */
  contactFormKey?: string;
  /** Cloudflare Turnstile site key for contact-form spam protection (""=off). */
  turnstileSiteKey?: string;
}

export const site = siteJson as SiteSettings;

export const nav = [
  { label: 'Projects', href: '/projects/' },
  { label: 'Tools', href: '/tools/' },
  { label: 'Writing', href: '/blog/' },
  { label: 'About', href: '/about/' },
  { label: 'Contact', href: '/#contact' },
];
