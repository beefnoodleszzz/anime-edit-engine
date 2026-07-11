import { describe, expect, it } from 'vitest';
import { angleLerp, shortestAngleDelta } from '../engine/camera/EditCamera';

const wrapDelta = (a: number, b: number): number => (((b - a + 180) % 360 + 360) % 360) - 180;

describe('angleLerp shortest-arc rotation boundary', () => {
  it('interpolates 170deg -> -170deg through the +/-180 seam, a 20deg path, not the long 340deg way', () => {
    const samples = Array.from({ length: 4097 }, (_, index) => angleLerp(170, -170, index / 4096));
    expect(samples[0]).toBeCloseTo(170, 10);
    // The endpoint is numerically 190 (== -170 modulo 360); congruence, not identity, is what matters.
    expect(wrapDelta(samples.at(-1)!, -170)).toBeCloseTo(0, 6);

    for (let index = 1; index < samples.length; index += 1) {
      const step = Math.abs(samples[index]! - samples[index - 1]!);
      expect(step).toBeLessThan(0.02); // smooth: no 360-style jump between adjacent samples
    }
    const totalPath = Math.abs(samples.at(-1)! - samples[0]!);
    expect(totalPath).toBeCloseTo(20, 6);
  });

  it('never spikes camera velocity to a 360deg jump across the boundary', () => {
    // A finite-difference "velocity" computed the same way EditCamera.velocity does: if the
    // interpolation ever wrapped the long way, this delta would be ~340deg/frame instead of ~tiny.
    const frameDelta = 1 / 4096;
    for (let progress = 0; progress <= 1; progress += 0.05) {
      const a = angleLerp(170, -170, Math.max(0, progress - frameDelta));
      const b = angleLerp(170, -170, Math.min(1, progress + frameDelta));
      expect(Math.abs(b - a)).toBeLessThan(1);
    }
  });
});

describe('shortestAngleDelta (used directly by EditCamera.velocity rotation)', () => {
  it('crossing the +/-180 seam yields a small delta, not a ~360deg raw-subtraction spike', () => {
    // Two adjacent camera-segment keyframes authored as +179 and -179 represent a 2deg turn,
    // not a 358deg one; raw (b - a) would wrongly give -358.
    expect(shortestAngleDelta(179, -179)).toBeCloseTo(2, 10);
    expect(shortestAngleDelta(-179, 179)).toBeCloseTo(-2, 10);
  });

  it('agrees with angleLerp: a + shortestAngleDelta(a, b) * progress === angleLerp(a, b, progress)', () => {
    for (const [a, b] of [[170, -170], [-170, 170], [10, 350], [0, 0], [45, 90]] as const) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        expect(a + shortestAngleDelta(a, b) * progress).toBeCloseTo(angleLerp(a, b, progress), 10);
      }
    }
  });
});
