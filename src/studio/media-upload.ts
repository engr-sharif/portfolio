/**
 * Media uploads shared by the loop field and both editors, plus the HTML the
 * editors insert for video (the same click-to-load facade and silent loop the
 * public site renders).
 */
import { commitFiles, uploadImage, isMissingRoute, freeNames } from './api';
import { LIMITS, checkSize, videoMeta, posterFrom, readB64, youtubeId } from './media';
import { scrubVideo } from './video-scrub';

const slug = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'clip';

/** Commit several files at once; fall back to one upload each on an old Worker. */
export async function commitMedia(message: string, files: { path: string; blob: Blob }[]) {
  const prepared = await Promise.all(files.map(async (f) => ({ path: f.path, content: await readB64(f.blob), type: f.blob.type })));
  try {
    await commitFiles(message, prepared.map(({ path, content }) => ({ path, content, encoding: 'base64' as const })));
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
    for (const p of prepared) await uploadImage(p.path, `data:${p.type || 'application/octet-stream'};base64,${p.content}`, message);
  }
}

/** The Worker takes up to 20 MB of payload per commit; stay under it. */
const COMMIT_BUDGET = 18 * 1024 * 1024;
export interface BatchFile { path: string; content: string; encoding?: 'utf-8' | 'base64' }

/**
 * Commit files in as few commits as fit the Worker's size limit, in order.
 * Put the file that references the others LAST: media land first, and the
 * note appears only once everything it points at is in the repo. Returns the
 * final commit.
 */
export async function commitInBatches(message: string, files: BatchFile[], budget = COMMIT_BUDGET): Promise<string | undefined> {
  const batches: BatchFile[][] = [[]];
  let size = 0;
  for (const f of files) {
    if (size + f.content.length > budget && batches[batches.length - 1].length) { batches.push([]); size = 0; }
    batches[batches.length - 1].push(f);
    size += f.content.length;
  }
  let commit: string | undefined;
  for (const [i, b] of batches.entries()) {
    const r = await commitFiles(batches.length > 1 ? `${message} (${i + 1}/${batches.length})` : message, b.map((f) => ({ ...f, encoding: f.encoding ?? 'utf-8' })));
    commit = r.commit;
  }
  return commit;
}

/**
 * Check, poster and store a short silent loop in public/media/loops — clip and
 * poster in one commit, with the phone's GPS blanked from the clip first.
 * Returns site paths ("/media/loops/…").
 */
export async function storeLoop(file: File, stage: (s: string) => void = () => {}): Promise<{ src: string; poster: string }> {
  stage('Checking…');
  checkSize(file, LIMITS.loopBytes, 'Trim it to about 10 seconds and export at 720p, or put it on YouTube and paste the link instead.');
  const meta = await videoMeta(file);
  if (meta.duration > LIMITS.loopSeconds + 0.5) throw new Error(`That clip runs ${Math.round(meta.duration)} s; a loop can be ${LIMITS.loopSeconds} s at most. Trim it, or put longer video on YouTube.`);
  stage('Taking a poster frame…');
  const still = await posterFrom(file);
  stage('Removing location data…');
  const { file: clean } = await scrubVideo(file);
  const base = slug(file.name);
  const ext = /webm/.test(file.type) || /\.webm$/i.test(file.name) ? 'webm' : 'mp4';
  const [clip, poster] = await freeNames('public/media/loops', [`${base}.${ext}`, `${base}-poster.jpg`]);
  stage('Uploading…');
  await commitMedia(`studio: add loop ${clip}`, [
    { path: `public/media/loops/${clip}`, blob: clean },
    { path: `public/media/loops/${poster}`, blob: still },
  ]);
  return { src: `/media/loops/${clip}`, poster: `/media/loops/${poster}` };
}

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

/** A YouTube link → the site's click-to-load facade, or null. */
export function youtubeFacadeHtml(url: string, title = 'Video'): string | null {
  const id = youtubeId(url);
  if (!id) return null;
  const t = title.replace(/"/g, '&quot;');
  return `<a class="yt" href="https://www.youtube.com/watch?v=${id}" data-yt="${id}" data-title="${t}" aria-label="Play video: ${t}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt__play">Play video</span></a>`;
}

/** A stored loop → the site's silent, play-when-visible video. */
export const loopHtml = (src: string, poster: string, label = 'Short clip') =>
  `<video class="loop" data-loop muted loop playsinline preload="none" aria-label="${label.replace(/"/g, '&quot;')}" src="${BASE}${src}" poster="${BASE}${poster}"></video>`;
