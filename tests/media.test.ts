import { describe, it, expect } from 'vitest';
import { fmtBytes, checkSize, audioExt, youtubeId, youtubeCanonical, LIMITS } from '../src/studio/media';
import { youtubeFacadeHtml, loopHtml } from '../src/studio/media-upload';

describe('media limits', () => {
  it('reads sizes the way a file manager does', () => {
    expect(fmtBytes(LIMITS.loopBytes)).toBe('8 MB');
    expect(fmtBytes(LIMITS.audioBytes)).toBe('15 MB');
    expect(fmtBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(fmtBytes(300)).toBe('1 KB');
  });
  it('explains an oversized file in plain words', () => {
    const big = new Blob([new Uint8Array(LIMITS.docBytes + 1)]);
    expect(() => checkSize(big, LIMITS.docBytes, 'Compress it.')).toThrow(/limit here is 10 MB\. Compress it\./);
    expect(() => checkSize(new Blob(['ok']), LIMITS.docBytes, '')).not.toThrow();
  });
  it('names audio from the file name first, then its type', () => {
    expect(audioExt(new Blob([], { type: 'audio/webm' }), 'note.M4A')).toBe('m4a');
    expect(audioExt(new Blob([], { type: 'audio/mp4' }))).toBe('m4a');
    expect(audioExt(new Blob([], { type: 'audio/ogg;codecs=opus' }))).toBe('ogg');
    expect(audioExt(new Blob([], { type: 'audio/webm;codecs=opus' }))).toBe('webm');
    expect(audioExt(new File([], 'take.mp3'))).toBe('mp3');
  });
});

describe('YouTube', () => {
  it('finds the id in every common link form', () => {
    for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])
      expect(youtubeId(u)).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://vimeo.com/123')).toBeNull();
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQextra')).toBeNull();
    expect(youtubeCanonical('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
  });
  it('builds the click-to-load facade, escaping the title', () => {
    const html = youtubeFacadeHtml('https://youtu.be/dQw4w9WgXcQ', 'A "site" walk')!;
    expect(html).toContain('data-yt="dQw4w9WgXcQ"');
    expect(html).toContain('A &quot;site&quot; walk');
    expect(html).not.toContain('<iframe');
    expect(youtubeFacadeHtml('nope')).toBeNull();
  });
  it('builds a silent loop that never autoplays sound', () => {
    const html = loopHtml('/media/loops/a.mp4', '/media/loops/a-poster.jpg');
    expect(html).toMatch(/\bmuted\b/);
    expect(html).toContain('preload="none"');
  });
});
