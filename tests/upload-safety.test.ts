import { describe, it, expect } from 'vitest';
import { pickFreeNames } from '../src/studio/api';
import { roundCoord } from '../src/studio/image-process';

/** An upload must never replace a file that's already in the repo. */
describe('pickFreeNames', () => {
  it('keeps a name that is free', () => {
    expect(pickFreeNames(['a.jpg'], ['b.jpg'])).toEqual(['b.jpg']);
  });

  it('numbers a name that is taken, case-insensitively', () => {
    expect(pickFreeNames(['Photo.JPG'], ['photo.jpg'])).toEqual(['photo-2.jpg']);
    expect(pickFreeNames(['x.jpg', 'x-2.jpg'], ['x.jpg'])).toEqual(['x-3.jpg']);
  });

  it('keeps names within one batch distinct', () => {
    expect(pickFreeNames([], ['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-2.jpg', 'a-3.jpg']);
  });

  it('handles names without an extension', () => {
    expect(pickFreeNames(['notes'], ['notes'])).toEqual(['notes-2']);
  });
});

/** Coordinates are stored at public precision only (0.01°, ~1 km). */
describe('roundCoord', () => {
  it('rounds to two decimals', () => {
    expect(roundCoord(39.026713)).toBe(39.03);
    expect(roundCoord(-122.671449)).toBe(-122.67);
  });
});
