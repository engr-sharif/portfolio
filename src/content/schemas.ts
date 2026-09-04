/**
 * Content schemas — the single source of truth for what a project, post, or
 * tool entry must look like. Consumed by both the Astro content collections
 * (build-time validation) and the Studio editor (pre-save validation), so an
 * entry that saves in the Studio can never break the build.
 *
 * `astro/zod` is the same Zod instance Astro uses internally, and it's safe to
 * import in browser code (the Studio bundle).
 */
import { z } from 'astro/zod';

// Zod 4 probes `new Function("")` to decide whether it may JIT-compile object
// parsers. That probe is a Content-Security-Policy violation in the Studio
// (script-src has no 'unsafe-eval'), so opt out — the interpreter path is
// plenty fast for a handful of fields.
if (typeof (z as { config?: (o: { jitless: boolean }) => void }).config === 'function') {
  (z as unknown as { config: (o: { jitless: boolean }) => void }).config({ jitless: true });
}

const yearMonth = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM (e.g. 2024-03)');

export const projectSchema = z.object({
  title: z.string().min(1, 'Give the project a title'),
  client: z.string().min(1, 'Add the client or site (confirm it is public)'),
  siteType: z.string().min(1, 'Add a site type (e.g. "Superfund mercury mine")'),
  status: z.enum(['active', 'complete', 'proposed']),
  role: z.string().min(1, 'Describe your role'),
  startDate: yearMonth,
  endDate: yearMonth.optional(),
  summary: z.string().min(1, 'Write a short summary — it appears on cards and in search'),
  techniques: z.array(z.string()).default([]),
  coverImage: z.string().optional(),
  coverAlt: z.string().optional(),
  gallery: z.array(z.string()).default([]),
  externalLink: z.url({ error: 'Must be a full URL starting with https://' }).optional(),
  featured: z.boolean().default(false),
  order: z.number().default(0),
  // Live regulatory data: a site name to look up in California's EnviroStor
  // (DTSC) public dataset, rendering an official status badge fetched live in
  // the browser. e.g. "Sulphur Bank Mercury Mine". Empty = no live badge.
  envirostorQuery: z.string().optional(),
  // Approximate, publicly-shareable location for the "Where I've worked" map.
  // Coordinates are city/area-level (snapped further at render for privacy);
  // leave blank to keep a project off the map. `location` is a display label.
  location: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Confidentiality gate: a project only renders publicly when every
  // site/client detail has been confirmed cleared for public sharing.
  published: z.boolean().default(false),
});

export const blogSchema = z.object({
  title: z.string().min(1, 'Give the post a title'),
  description: z.string().min(1, 'Add an excerpt — it is the search/share blurb').max(200, 'Keep the excerpt under 200 characters'),
  pubDate: z.coerce.date({ error: 'Pick a published date' }),
  updatedDate: z.coerce.date().optional(),
  coverImage: z.string().optional(),
  coverAlt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  category: z.enum(['field-notes', 'technical', 'professional']).optional(),
  relatedProject: z.string().optional(),
  featured: z.boolean().default(false),
  canonicalURL: z.url({ error: 'Must be a full URL starting with https://' }).optional(),
  draft: z.boolean().default(true),
});

export const toolSchema = z.object({
  name: z.string().min(1, 'Give the tool a name'),
  summary: z.string().min(1, 'Add a one-line summary'),
  problem: z.string().optional(),
  tech: z.array(z.string()).default([]),
  repoUrl: z.url({ error: 'Must be a full URL starting with https://' }).optional(),
  liveUrl: z.url({ error: 'Must be a full URL starting with https://' }).optional(),
  screenshots: z.array(z.string()).default([]),
  codeSnippet: z.string().optional(),
  codeLang: z.string().default('javascript'),
  featured: z.boolean().default(false),
  order: z.number().default(0),
  published: z.boolean().default(false),
});

/** Studio collection id → schema (folder collections only). */
export const schemasByCollection: Record<string, z.ZodTypeAny> = {
  projects: projectSchema,
  blog: blogSchema,
  tools: toolSchema,
};

export type FieldErrors = Record<string, string>;

/** Validate entry data; returns per-field messages keyed by field name (empty
 * object = valid). Nested paths collapse to their top-level field. */
export function validateEntry(collectionId: string, data: Record<string, unknown>): FieldErrors {
  const schema = schemasByCollection[collectionId];
  if (!schema) return {};
  const res = schema.safeParse(data);
  if (res.success) return {};
  const errors: FieldErrors = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? '_');
    // Zod's default "expected string, received undefined" → plain English.
    const missing = issue.code === 'invalid_type' && /received undefined/.test(issue.message);
    if (!errors[key]) errors[key] = missing ? 'This field is required' : issue.message;
  }
  return errors;
}
