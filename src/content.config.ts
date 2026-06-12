import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects collection — one markdown file per project in src/content/projects/.
 * Managed via the CMS at /admin. Image fields hold a *filename* that lives in
 * src/assets/covers or src/assets/gallery; components resolve them through an
 * import.meta.glob map so they go through Astro's <Image> optimizer.
 */
/**
 * Blog collection — one markdown file per post in src/content/blog/, managed
 * via the CMS at /admin. Mirrors the projects pattern: image fields hold a
 * filename resolved from src/assets/blog through Astro's <Image> optimizer; a
 * `draft` boolean is the build-time publish gate (drafts hidden in production).
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    coverImage: z.string().optional(),
    coverAlt: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(['field-notes', 'technical', 'professional']).optional(),
    relatedProject: z.string().optional(),
    featured: z.boolean().default(false),
    canonicalURL: z.string().url().optional(),
    draft: z.boolean().default(true),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    siteType: z.string(),
    status: z.enum(['active', 'complete', 'proposed']),
    role: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    summary: z.string(),
    techniques: z.array(z.string()).default([]),
    coverImage: z.string().optional(),
    coverAlt: z.string().optional(),
    gallery: z.array(z.string()).default([]),
    externalLink: z.string().url().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
    // Approximate, publicly-shareable location for the "Where I've worked" map.
    // Coordinates are city/area-level (snapped further at render for privacy);
    // leave blank to keep a project off the map. `location` is a display label.
    location: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    // Confidentiality gate: a project only renders publicly when the owner has
    // confirmed every site/client detail is cleared for public sharing.
    published: z.boolean().default(false),
  }),
});

/**
 * Tools collection — the "engineer who codes" projects. One markdown file per
 * tool, each with its own detail page (problem, approach, screenshots, a code
 * snippet, tech, links). CMS-managed at /admin → Tools.
 */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    name: z.string(),
    summary: z.string(),
    problem: z.string().optional(),
    tech: z.array(z.string()).default([]),
    repoUrl: z.string().url().optional(),
    liveUrl: z.string().url().optional(),
    screenshots: z.array(z.string()).default([]),
    codeSnippet: z.string().optional(),
    codeLang: z.string().default('javascript'),
    featured: z.boolean().default(false),
    order: z.number().default(0),
    published: z.boolean().default(false),
  }),
});

export const collections = { projects, blog, tools };
