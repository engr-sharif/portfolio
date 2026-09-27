/**
 * Where this build is going. Cloudflare Pages sets CF_PAGES_BRANCH on every
 * build: "main" is the live site; anything else is a preview deployment,
 * which is never indexed. The "preview" branch is the Studio's unlisted
 * preview: it also shows unpublished entries, so a draft can be read as a
 * visitor would see it before it goes live.
 */
const branch = process.env.CF_PAGES_BRANCH || '';
export const IS_PREVIEW = !!branch && branch !== 'main';
export const SHOW_UNPUBLISHED = branch === 'preview';
