import { describe, expect, it } from 'vitest';
import { EditCamera } from '../engine/camera/EditCamera';

describe('EditCamera', () => {
  const camera = new EditCamera();
  it('creates a stable sharp hold for eye push', () => {
    expect(camera.velocity('EYE_PUSH', 0.5, 1 / 120, 0.6).magnitude).toBeLessThan(0.1);
  });
  it('creates high velocity during a whip', () => {
    expect(camera.velocity('WHIP_RIGHT', 0.5, 1 / 120, 0.8).magnitude).toBeGreaterThan(0.1);
  });
  it('measures the same camera move faster in a shorter shot', () => {
    const short = camera.velocity('WHIP_RIGHT', 0.5, 1 / 120, 0.8);
    const long = camera.velocity('WHIP_RIGHT', 0.5, 1 / 120, 1.6);
    expect(short.magnitude).toBeGreaterThan(long.magnitude);
    expect(short.zoom).toBeGreaterThan(long.zoom);
  });
  it('uses logarithmic zoom velocity', () => {
    const velocity = camera.velocity('HERO_CRASH_IN', 0.2, 1 / 120, 1.2);
    expect(Number.isFinite(velocity.zoom)).toBe(true);
  });
});
