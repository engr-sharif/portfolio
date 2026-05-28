import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects collection — one markdown file per project in src/content/projects/.
 * Managed via the CMS at /admin. Image fields hold a *filename* that lives in
 * src/assets/covers or src/assets/gallery; components resolve them through an
 * import.meta.glob map so they go through Astro's <Image> optimizer.
 */
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
    gallery: z.array(z.string()).default([]),
    externalLink: z.string().url().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
    // Confidentiality gate: a project only renders publicly when Nawaz has
    // confirmed every site/client detail is cleared for public sharing.
    published: z.boolean().default(false),
  }),
});

export const collections = { projects };
