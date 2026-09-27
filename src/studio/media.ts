/**
 * Media helpers for the Studio: size limits that keep the site deployable,
 * poster frames for loops, and waveforms for audio — all in the browser, so
 * nothing needs a server beyond the existing commit API.
 *
 * Why the limits: Cloudflare Pages refuses any single file over 25 MiB (one
 * such file breaks every deploy), and every file stays in git history for
 * good. Short silent loops and voice notes are small; real videos belong on
 * YouTube.
 */
export const LIMITS = {
  loopBytes: 8 * 1024 * 1024,
  loopSeconds: 20,
  audioBytes: 15 * 1024 * 1024,
  docBytes: 10 * 1024 * 1024,
  publicBytes: 20 * 1024 * 1024,
} as const;

const MB = 1024 * 1024;
/** Binary units, as file managers show them; whole numbers where exact ("8 MB", not "8.4 MB"). */
export const fmtBytes = (n: number) => {
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const v = n / MB;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} MB`;
};

/** Throw a plain-English error when a file is over its limit. */
export function checkSize(file: Blob, max: number, advice: string) {
  if (file.size > max) throw new Error(`That file is ${fmtBytes(file.size)}; the limit here is ${fmtBytes(max)}. ${advice}`);
}

export const readB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => rej(new Error('Could not read that file.'));
  r.readAsDataURL(b);
});

/** Duration and size of a video file, read from its metadata. */
export function videoMeta(file: Blob): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.muted = true;
    const done = () => { res({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(url); };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return done();
      // Browser-recorded WebM carries no duration in its header ("Infinity");
      // seeking past the end makes the browser scan for the real one.
      v.ontimeupdate = () => { v.ontimeupdate = null; if (Number.isFinite(v.duration)) done(); else { URL.revokeObjectURL(url); rej(new Error('Couldn’t tell how long that clip is. Export it as an MP4.')); } };
      v.currentTime = Number.MAX_SAFE_INTEGER;
    };
    v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This browser can’t read that video. Export it as an MP4 (H.264).')); };
    v.src = url;
  });
}

/** A JPEG poster frame from early in a clip (what shows before it plays, and
 * instead of it under reduced motion). */
export function posterFrom(file: Blob, at = 0.6): Promise<Blob> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const fail = () => { URL.revokeObjectURL(url); rej(new Error('Couldn’t take a poster frame from that clip.')); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(at, (v.duration || 1) / 3); };
    v.onseeked = () => {
      const scale = Math.min(1, 1600 / (v.videoWidth || 1600));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      const g = c.getContext('2d');
      if (!g) return fail();
      g.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => { URL.revokeObjectURL(url); b ? res(b) : rej(new Error('Couldn’t encode the poster frame.')); }, 'image/jpeg', 0.84);
    };
    v.onerror = fail;
    v.src = url;
  });
}

/** 96 peaks (0–255, comma separated) — the waveform the site draws. */
export async function audioPeaks(file: Blob, bars = 96): Promise<{ peaks: string; duration: number }> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / bars));
    const raw: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += 8) max = Math.max(max, Math.abs(data[j]));
      raw.push(max);
    }
    const top = Math.max(...raw) || 1;
    return { peaks: raw.map((p) => Math.round((p / top) * 255)).join(','), duration: buf.duration };
  } finally {
    ctx.close();
  }
}

/** File extension for a recorded/uploaded audio blob. */
export function audioExt(file: Blob, name = (file as File).name): string {
  const fromName = name?.match(/\.(mp3|m4a|aac|ogg|oga|wav|webm)$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (/mp4|m4a|aac/.test(file.type)) return 'm4a';
  if (/ogg/.test(file.type)) return 'ogg';
  if (/mpeg|mp3/.test(file.type)) return 'mp3';
  if (/wav/.test(file.type)) return 'wav';
  return 'webm';
}

/** The best recording format this browser offers (Opus in WebM, or AAC in MP4 on Safari). */
export function recorderType(): string | undefined {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
}

export { youtubeId, youtubeCanonical } from '../lib/youtube';
