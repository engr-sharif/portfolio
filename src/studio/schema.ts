/**
 * Studio content schema — the single declarative model the admin UI renders
 * from. Mirrors the real Astro content collections + settings files.
 */
export type FieldType =
  | 'text' | 'textarea' | 'markdown' | 'number' | 'boolean'
  | 'select' | 'date' | 'list' | 'image' | 'tags' | 'object' | 'file'
  | 'youtube' | 'loop' | 'audio';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  required?: boolean;
  options?: string[];          // select
  default?: unknown;
  fields?: Field[];            // object / list-of-objects
  itemType?: FieldType;        // list of primitives (e.g. tags)
  mediaDir?: string;           // image / file upload target
  accept?: string;             // file field: input accept attribute (e.g. 'application/pdf')
  maxBytes?: number;           // file field: upload size limit
  posterField?: string;        // loop: sibling that receives the poster frame path
  peaksField?: string;         // audio: sibling that receives the waveform
  geo?: boolean;               // image / image list: use the photo's GPS for the entry (photo-places.ts)
}

export interface Collection {
  id: string;
  label: string;
  icon: string;
  kind: 'folder' | 'file';
  dir?: string;                // folder collections: where entries live
  file?: string;               // file collections: the single JSON path
  format?: 'frontmatter';      // folder entries: md w/ frontmatter + body
  mediaDir?: string;
  labelField: string;          // which field titles an entry in lists
  statusField?: string;        // boolean that gates visibility (published/draft)
  route?: string;              // where an entry lives on the site: route + slug + '/'
  clearance?: boolean;         // publishing needs the four-point clearance checklist
  fields: Field[];
  bodyLabel?: string;          // folder entries carry a markdown body
}

const STATUS = ['active', 'complete', 'proposed'];

export const collections: Collection[] = [
  {
    id: 'projects',
    label: 'Projects',
    icon: 'M2 2.5A2.5 2.5 0 0 1 4.5 0h7A2.5 2.5 0 0 1 14 2.5v11a.5.5 0 0 1-.777.416L8 10.101l-5.223 3.815A.5.5 0 0 1 2 13.5Z',
    kind: 'folder',
    dir: 'src/content/projects',
    format: 'frontmatter',
    mediaDir: 'src/assets/covers',
    labelField: 'title',
    statusField: 'published',
    route: '/projects/',
    clearance: true,
    bodyLabel: 'Write-up',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'client', label: 'Client / Site', type: 'text', hint: 'Confirm this is cleared for public sharing.' },
      { name: 'siteType', label: 'Site type', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'role', label: 'Your role', type: 'text' },
      { name: 'startDate', label: 'Start (YYYY-MM)', type: 'text' },
      { name: 'endDate', label: 'End (YYYY-MM)', type: 'text' },
      { name: 'summary', label: 'Short summary', type: 'textarea' },
      { name: 'problem', label: 'Brief — the problem', type: 'textarea', hint: 'One or two sentences: what the site or client needed. Powers the case-study panel (optional).' },
      { name: 'approach', label: 'Brief — the approach', type: 'textarea', hint: 'What you did and how — methods, field work, tools.' },
      { name: 'outcome', label: 'Brief — the outcome', type: 'textarea', hint: 'What it delivered. Keep it factual; no client-confidential results.' },
      { name: 'techniques', label: 'Techniques', type: 'tags', itemType: 'text' },
      { name: 'coverImage', label: 'Cover image', type: 'image', mediaDir: 'src/assets/covers', geo: true },
      { name: 'coverAlt', label: 'Cover alt text', type: 'text' },
      { name: 'gallery', label: 'Gallery images', type: 'tags', itemType: 'image', mediaDir: 'src/assets/covers', geo: true, hint: 'A photo’s GPS places it on the map (rounded to the privacy setting) and is then removed from the file.' },
      { name: 'externalLink', label: 'External link', type: 'text' },
      { name: 'envirostorQuery', label: 'Live status — EnviroStor site name', type: 'text', hint: 'e.g. "Sulphur Bank Mercury Mine" → live regulatory badge. Blank for none.' },
      { name: 'video', label: 'Video (YouTube)', type: 'youtube', hint: 'A walkthrough or site video. Public or unlisted both work.' },
      { name: 'videoTitle', label: 'Video title', type: 'text' },
      { name: 'audio', label: 'Voice note', type: 'audio', peaksField: 'audioPeaks', hint: 'A minute or two from the field, in your own words.' },
      { name: 'audioTranscript', label: 'Voice note transcript', type: 'textarea', hint: 'Shown under the player. Worth it for anyone who can’t listen.' },
      { name: 'documents', label: 'Public documents (PDF)', type: 'list', fields: [{ name: 'title', label: 'Title', type: 'text' }, { name: 'file', label: 'PDF', type: 'file', mediaDir: 'public/media/docs', accept: 'application/pdf', maxBytes: 10 * 1024 * 1024 }], hint: 'Only documents already public (a fact sheet, a poster). Never client deliverables.' },
      { name: 'location', label: 'Map location label', type: 'text', hint: 'e.g. "Bakersfield, CA". Shown with the site on maps and figures.' },
      { name: 'privacy', label: 'Location precision on the site', type: 'select', options: ['site', 'town', 'region'], default: 'site', hint: 'site ≈ 1 km · town ≈ 10 km · region ≈ 50 km. Use a coarser setting when the exact area is sensitive.' },
      { name: 'lat', label: 'Latitude', type: 'number', hint: 'Approximate, city-level (e.g. 38.58). Leave blank to keep this project off the map.' },
      { name: 'lng', label: 'Longitude', type: 'number', hint: 'e.g. -121.49 for Sacramento.' },
      { name: 'featured', label: 'Featured', type: 'boolean', default: false },
      { name: 'order', label: 'Sort order', type: 'number', default: 0 },
      { name: 'published', label: 'Published (cleared for public sharing)', type: 'boolean', default: false, hint: 'Leave OFF until every detail is confirmed public.' },
    ],
  },
  {
    id: 'blog',
    label: 'Blog',
    icon: 'M0 1.5A1.5 1.5 0 0 1 1.5 0h13A1.5 1.5 0 0 1 16 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 14.5Z',
    kind: 'folder',
    dir: 'src/content/blog',
    format: 'frontmatter',
    mediaDir: 'src/assets/blog',
    labelField: 'title',
    statusField: 'draft',
    route: '/notes/',
    bodyLabel: 'Post',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Excerpt / SEO description', type: 'textarea', hint: 'Under ~200 characters.' },
      { name: 'pubDate', label: 'Published date', type: 'date' },
      { name: 'updatedDate', label: 'Updated date', type: 'date' },
      { name: 'coverImage', label: 'Cover image', type: 'image', mediaDir: 'src/assets/blog' },
      { name: 'coverAlt', label: 'Cover alt text', type: 'text' },
      { name: 'tags', label: 'Tags', type: 'tags', itemType: 'text' },
      { name: 'category', label: 'Category', type: 'select', options: ['field-notes', 'technical', 'professional'] },
      { name: 'relatedProject', label: 'Related project (slug)', type: 'text' },
      { name: 'audio', label: 'Voice note', type: 'audio', peaksField: 'audioPeaks' },
      { name: 'transcript', label: 'Transcript', type: 'textarea' },
      { name: 'video', label: 'Video (YouTube)', type: 'youtube' },
      { name: 'featured', label: 'Featured', type: 'boolean', default: false },
      { name: 'draft', label: 'Draft (hidden from site)', type: 'boolean', default: true, hint: 'Save = publish. Leave ON until ready.' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: 'M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5Z',
    kind: 'folder',
    dir: 'src/content/tools',
    format: 'frontmatter',
    mediaDir: 'src/assets/tools',
    labelField: 'name',
    statusField: 'published',
    route: '/tools/',
    bodyLabel: 'Write-up',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'summary', label: 'One-line summary', type: 'textarea' },
      { name: 'problem', label: 'The problem it solves', type: 'textarea' },
      { name: 'tech', label: 'Tech used', type: 'tags', itemType: 'text' },
      { name: 'repoUrl', label: 'Code / repo URL', type: 'text' },
      { name: 'liveUrl', label: 'Live demo URL', type: 'text' },
      { name: 'loop', label: 'Screen recording (short loop)', type: 'loop', posterField: 'loopPoster', hint: 'Replaces the schematic on the tool’s figure. Record 5–15 s of the tool in use, with sample data only.' },
      { name: 'video', label: 'Walkthrough (YouTube)', type: 'youtube' },
      { name: 'screenshots', label: 'Screenshots', type: 'tags', itemType: 'image', mediaDir: 'src/assets/tools' },
      { name: 'codeSnippet', label: 'Code snippet', type: 'textarea' },
      { name: 'codeLang', label: 'Snippet language', type: 'text', default: 'javascript' },
      { name: 'featured', label: 'Featured', type: 'boolean', default: false },
      { name: 'order', label: 'Sort order', type: 'number', default: 0 },
      { name: 'published', label: 'Published', type: 'boolean', default: false },
    ],
  },
  {
    id: 'site',
    label: 'Site Settings',
    icon: 'M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.46 1.46 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.46 1.46 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.46 1.46 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.46 1.46 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.46 1.46 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.46 1.46 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.46 1.46 0 0 1-2.105-.872Z',
    kind: 'file',
    file: 'src/content/settings/site.json',
    labelField: 'name',
    fields: [
      { name: 'name', label: 'Full name', type: 'text' },
      { name: 'shortName', label: 'Short name', type: 'text' },
      { name: 'credential', label: 'Credential line', type: 'text' },
      { name: 'heroTitle', label: 'Hero headline (blank = name)', type: 'text' },
      { name: 'role', label: 'Subhead / role', type: 'text' },
      { name: 'avatar', label: 'Headshot', type: 'image', mediaDir: 'src/assets/avatars', hint: 'A clean, well-lit photo. Shows on your About page. Optional.' },
      { name: 'bio', label: 'Bio', type: 'textarea' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'linkedin', label: 'LinkedIn URL', type: 'text' },
      { name: 'github', label: 'GitHub URL', type: 'text' },
      { name: 'resume', label: 'Résumé (PDF)', type: 'file', mediaDir: 'public/resume', accept: 'application/pdf', hint: 'Upload a new PDF anytime — replaces the “Download PDF” link.' },
      { name: 'resumeUpdated', label: 'Résumé updated (YYYY-MM-DD)', type: 'text' },
      // --- Search & social sharing ---
      { name: 'seoTitle', label: 'SEO title (blank = default)', type: 'text', hint: 'Shows in the browser tab and search results.' },
      { name: 'seoDescription', label: 'SEO description (blank = default)', type: 'textarea', hint: 'The blurb under your title in Google / when shared. ~155 chars.' },
      { name: 'ogImage', label: 'Social share image', type: 'file', mediaDir: 'public/og', accept: 'image/*', hint: 'The preview image when your link is shared (LinkedIn, etc.). Ideally 1200×630.' },
      // --- Integrations ---
      { name: 'analytics', label: 'GoatCounter code', type: 'text' },
      { name: 'contactFormKey', label: 'Contact form key (Web3Forms)', type: 'text' },
    ],
  },
  {
    id: 'profile',
    label: 'Career & Credentials',
    icon: 'M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 3H11v-.5A1.5 1.5 0 0 0 9.5 1zm0 1h3a.5.5 0 0 1 .5.5V3H6v-.5a.5.5 0 0 1 .5-.5',
    kind: 'file',
    file: 'src/content/settings/profile.json',
    labelField: 'timeline',
    fields: [
      {
        name: 'timeline', label: 'Career log', type: 'list',
        hint: 'Shown on About as a boring log, present at the top. Order here doesn’t matter.',
        fields: [
          { name: 'date', label: 'When', type: 'text', hint: 'e.g. "2023 — Present" or "Anticipated 2027"' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'org', label: 'Organisation · place', type: 'text' },
          { name: 'detail', label: 'One line', type: 'text' },
        ],
      },
      {
        name: 'credentials', label: 'Licences', type: 'list',
        fields: [
          { name: 'label', label: 'Licence', type: 'text' },
          { name: 'issuer', label: 'Issued by', type: 'text' },
          { name: 'status', label: 'Status', type: 'text' },
          { name: 'date', label: 'Date', type: 'text' },
        ],
      },
      {
        name: 'certifications', label: 'Certifications', type: 'list',
        fields: [
          { name: 'label', label: 'Certification', type: 'text' },
          { name: 'issuer', label: 'Issued by / standard', type: 'text' },
          { name: 'date', label: 'Date', type: 'text' },
          { name: 'expires', label: 'Renews', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'gallery',
    label: 'Field Gallery',
    icon: 'M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
    kind: 'file',
    file: 'src/content/settings/gallery.json',
    mediaDir: 'src/assets/gallery',
    labelField: 'note',
    fields: [
      { name: 'note', label: 'Internal note', type: 'text' },
      {
        name: 'photos', label: 'Photos', type: 'list', mediaDir: 'src/assets/gallery',
        fields: [
          { name: 'image', label: 'Image', type: 'image', mediaDir: 'src/assets/gallery' },
          { name: 'alt', label: 'Alt text', type: 'text' },
          { name: 'caption', label: 'Caption', type: 'text' },
          { name: 'takenAt', label: 'Date taken', type: 'text', hint: 'Auto-filled from the photo. YYYY-MM-DD.' },
          { name: 'lat', label: 'Latitude', type: 'text', hint: 'Auto-filled from the photo’s GPS — used by the map. Clear to hide.' },
          { name: 'lng', label: 'Longitude', type: 'text' },
        ],
      },
    ],
  },
];

export const getCollection = (id: string) => collections.find((c) => c.id === id);
