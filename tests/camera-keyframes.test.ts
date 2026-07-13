import { describe, expect, it } from 'vitest';
import { EditCamera } from '../engine/camera/EditCamera';

describe('data-driven camera keyframes', () => {
  it('interpolates partial keyframes with cubic-bezier easing', () => {
    const camera = new EditCamera();
    const transform = camera.resolve({ keyframes: [{ time: 0, scale: 1, easing: 'cubic-bezier', cubicBezier: [0.25, 0.1, 0.25, 1] }, { time: 1, scale: 2 }] }, 0.5);
    expect(transform.scale).toBeGreaterThan(1);
    expect(transform.scale).toBeLessThan(2);
  });
});
