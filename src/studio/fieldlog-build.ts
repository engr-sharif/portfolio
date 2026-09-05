/**
 * Turns a field-log capture into a Field Notes DRAFT: the markdown file plus
 * the repo paths its photos will live at. Pure — tested in isolation. The
 * caller commits everything as ONE atomic commit.
 */
import { stringify } from './frontmatter';

export interface NotePhoto { ext: string; alt?: string; takenAt?: string }
export interface NoteInput {
  title: string;
  note: string;
  createdAt: string;         // ISO
  lat?: number;
  lng?: number;
  project?: string;
  photos: NotePhoto[];
}
export interface BuiltNote {
  slug: string;
  path: string;              // src/content/blog/<slug>.md
  content: string;           // full markdown with frontmatter
  photoPaths: string[];      // src/assets/blog/<slug>-1.jpg …
  data: Record<string, unknown>;
}

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function fieldNoteSlug(title: string, createdAt: string): string {
  const day = createdAt.slice(0, 10);
  const t = slugify(title).slice(0, 60).replace(/-$/, '');
  return t ? `${day}-${t}` : `${day}-field-note`;
}

/** First sentence-ish of the note, capped for the excerpt field. */
export function excerpt(note: string, max = 180): string {
  const flat = note.replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(', '));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut).trim().replace(/[,;]$/, '') + (stop > max * 0.5 ? '' : '…');
}

/** Site convention: coordinates shown to ~1 km so client sites stay approximate. */
const coarse = (n: number) => Math.round(n * 100) / 100;

export function buildFieldNote(input: NoteInput, opts: { slug?: string; mediaDir?: string; contentDir?: string } = {}): BuiltNote {
  const mediaDir = opts.mediaDir || 'src/assets/blog';
  const contentDir = opts.contentDir || 'src/content/blog';
  const slug = opts.slug || fieldNoteSlug(input.title, input.createdAt);
  const day = input.createdAt.slice(0, 10);
  const photoPaths = input.photos.map((p, i) => `${mediaDir}/${slug}-${i + 1}.${p.ext.replace(/^\./, '') || 'jpg'}`);
  const title = input.title.trim() || `Field note — ${day}`;

  const data: Record<string, unknown> = {
    title,
    description: excerpt(input.note) || `Field note logged on ${day}.`,
    pubDate: day,
    ...(photoPaths[0] ? { coverImage: photoPaths[0].split('/').pop(), coverAlt: input.photos[0].alt || title } : {}),
    tags: ['Field log'],
    category: 'field-notes',
    ...(input.project ? { relatedProject: input.project } : {}),
    featured: false,
    draft: true,
  };

  const parts: string[] = [];
  const when = new Date(input.createdAt);
  const stamp = isNaN(when.getTime()) ? day : when.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const where = input.lat != null && input.lng != null ? ` · ${coarse(input.lat).toFixed(2)}, ${coarse(input.lng).toFixed(2)} (approx.)` : '';
  parts.push(`*Logged in the field ${stamp}${where}.*`);
  if (input.note.trim()) parts.push(input.note.trim());
  if (photoPaths.length) {
    parts.push('## Photos');
    parts.push(photoPaths.map((p, i) => `![${input.photos[i].alt || `${title} — photo ${i + 1}`}](/${p})`).join('\n\n'));
  }

  return { slug, path: `${contentDir}/${slug}.md`, content: stringify({ data, body: parts.join('\n\n') + '\n' }), photoPaths, data };
}
