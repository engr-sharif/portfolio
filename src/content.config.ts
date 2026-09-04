import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema, blogSchema, toolSchema } from './content/schemas';

/**
 * Content collections. The Zod schemas live in ./content/schemas.ts so the
 * Studio (src/studio) can validate an entry before committing it — the same
 * rules at edit time and at build time.
 *
 * Image fields hold a *filename* that lives under src/assets/<kind>; components
 * resolve them through an import.meta.glob map so they go through Astro's
 * <Image> optimizer.
 */

/** Blog — one markdown file per post; `draft` is the build-time publish gate. */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: blogSchema,
});

/** Projects — one markdown file per project; `published` is the confidentiality gate. */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: projectSchema,
});

/** Tools — the "engineer who codes" projects, each with a detail page. */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: toolSchema,
});

export const collections = { projects, blog, tools };
