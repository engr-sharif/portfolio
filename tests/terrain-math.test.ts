import { describe, it, expect } from 'vitest';
import { perspective, lookAt, multiply, project, invert, unprojectToGround } from '../src/scripts/ground/math';

/** The coordinate lens is only honest if screen → ground inverts ground → screen. */
describe('terrain projection', () => {
  const W = 800, H = 600;
  const mvp = multiply(perspective((32 * Math.PI) / 180, W / H, 0.1, 200), lookAt([3, 9, 12], [0.4, 0, -0.5]));

  it('inverts to the identity', () => {
    const inv = invert(mvp)!;
    const id = multiply(mvp, inv);
    for (let i = 0; i < 16; i++) expect(id[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 4);
  });

  it('round-trips ground points through the screen', () => {
    const inv = invert(mvp)!;
    for (const [x, z] of [[0, 0], [2.5, -3], [-3.2, 1.7], [4, 4]]) {
      const s = project(mvp, x, 0, z, W, H);
      expect(s.visible).toBe(true);
      const g = unprojectToGround(inv, s.x, s.y, W, H)!;
      expect(g.x).toBeCloseTo(x, 3);
      expect(g.z).toBeCloseTo(z, 3);
    }
  });

  it('returns null for a ray that never meets the ground (the sky)', () => {
    const inv = invert(mvp)!;
    const up = multiply(perspective(0.5, 1, 0.1, 200), lookAt([0, 2, 10], [0, 6, 0]));
    expect(unprojectToGround(invert(up)!, 400, 10, W, H)).toBeNull();
    expect(inv).not.toBeNull();
  });
});
