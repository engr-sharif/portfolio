/**
 * Résumé availability — decided at build time, server-side only.
 *
 * The repo ships a placeholder PDF until the real one is dropped in. Rather
 * than let a recruiter click "Download résumé" and get a stub, components ask
 * `resumeReady` and fall back to a "request it" affordance when the file is
 * missing, tiny, or still carries the PLACEHOLDER marker.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { site } from './site';

const MIN_BYTES = 5_000; // a real one-page résumé is comfortably above this

function check(): boolean {
  if (!site.resume) return false;
  try {
    const file = join(process.cwd(), 'public', site.resume.replace(/^\//, ''));
    const st = statSync(file);
    if (!st.isFile() || st.size < MIN_BYTES) return false;
    const head = readFileSync(file).subarray(0, 8_192).toString('latin1');
    if (!head.startsWith('%PDF')) return false;
    return !/PLACEHOLDER/i.test(head);
  } catch {
    return false;
  }
}

export const resumeReady: boolean = check();
