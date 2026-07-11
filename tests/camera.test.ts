import { describe, expect, it } from 'vitest';
import { EditCamera } from '../engine/camera/EditCamera';

describe('EditCamera', () => {
  const camera = new EditCamera();
  it('creates a stable sharp hold for eye push', () => {
    expect(camera.velocity('EYE_PUSH', 0.5, 1 / 120).magnitude).toBeLessThan(0.1);
  });
  it('creates high velocity during a whip', () => {
    expect(camera.velocity('WHIP_RIGHT', 0.5, 1 / 120).magnitude).toBeGreaterThan(0.1);
  });
});
