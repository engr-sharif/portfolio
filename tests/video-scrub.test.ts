import { describe, it, expect } from 'vitest';
import { scrubLocation, findMoov } from '../src/studio/video-scrub';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function box(type: string | number[], payload: Uint8Array) {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(typeof type === 'string' ? enc(type) : type, 4);
  out.set(payload, 8);
  return out;
}
const cat = (...parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('video location scrub', () => {
  // ftyp | mdat (frames that happen to contain a coordinate-like string) | moov { udta { ©xyz }, meta { ISO 6709 } }
  const frames = enc('\u0000\u0001+38.58-121.49 raw frame bytes');
  const xyz = box([0xa9, 0x78, 0x79, 0x7a], enc('\u0000\u0012\u0015Ç+38.5816-121.4944/'));
  const apple = box('meta', enc('com.apple.quicktime.location.ISO6709\u0000+38.5816-121.4944+012.345/'));
  const file = () => cat(box('ftyp', enc('isom')), box('mdat', frames), box('moov', cat(box('udta', xyz), apple)));

  it('finds the movie header among top-level boxes', () => {
    const f = file();
    const m = findMoov(f)!;
    expect(text(f.subarray(m.start + 4, m.start + 8))).toBe('moov');
    expect(m.end).toBe(f.length);
    expect(findMoov(enc('not a video at all'))).toBeNull();
  });

  it('blanks the ©xyz box and ISO 6709 strings, leaving sizes and frames alone', () => {
    const f = file();
    const before = f.length;
    const found = scrubLocation(f);
    const s = text(f);
    expect(found).toBe(2);
    expect(f.length).toBe(before);
    expect(s).not.toMatch(/38\.5816|121\.4944/);
    expect(s).toContain('free');
    expect(s).toContain('+00.0000-000.0000+000.000/');
    expect(s).toContain('+38.58-121.49 raw frame bytes'); // mdat untouched
  });

  it('leaves a clip without location exactly as it was', () => {
    const clean = cat(box('ftyp', enc('isom')), box('moov', box('udta', enc('nothing here'))));
    const copy = clean.slice();
    expect(scrubLocation(copy)).toBe(0);
    expect(copy).toEqual(clean);
  });
});
