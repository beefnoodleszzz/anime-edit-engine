import { describe, expect, it } from 'vitest';
import { angleLerp } from '../engine/camera/EditCamera';

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
