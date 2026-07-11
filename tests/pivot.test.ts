import { describe, expect, it } from 'vitest';
import { EditCamera } from '../engine/camera/EditCamera';
import type { EditTransform } from '../engine/types';
import { sourceUv } from './support/sourceUv';

const square = { sourceWidth: 100, sourceHeight: 100, outputWidth: 100, outputHeight: 100 };

describe('Camera pivot', () => {
  it('preserves the authored eye pivot', () => { const camera = new EditCamera(); expect(camera.resolve('EYE_PUSH', 0.5).pivotY).toBeCloseTo(0.42); });
  it('interpolates rotation using the shortest arc', () => { const camera = new EditCamera(); const transform = camera.resolve('FACE_CROSS_LEFT', 0.5); expect(Math.abs(transform.rotation)).toBeLessThan(3); });

  it('actually changes the sampled source UV, not just a stored field: same scale/rotation, different pivot', () => {
    const shared = { scale: 1.7, rotation: 20, x: 0.03, y: -0.01 };
    const centerPivot: EditTransform = { ...shared, pivotX: 0.5, pivotY: 0.5 };
    const offCenterPivot: EditTransform = { ...shared, pivotX: 0.25, pivotY: 0.42 };
    for (const uv of [[0.2, 0.8], [0.6, 0.3], [0.9, 0.9]] as const) {
      const fromCenter = sourceUv(uv, { transform: centerPivot, ...square });
      const fromOffCenter = sourceUv(uv, { transform: offCenterPivot, ...square });
      expect(fromCenter).not.toEqual(fromOffCenter);
    }
  });

  it('EYE_PUSH really samples around pivot (0.5, 0.42), not the default (0.5, 0.5), for the same zoom', () => {
    const camera = new EditCamera();
    const transform = camera.resolve('EYE_PUSH', 0.5);
    const defaultPivot: EditTransform = { ...transform, pivotX: 0.5, pivotY: 0.5 };
    const uv: [number, number] = [0.5, 0.9];
    const authored = sourceUv(uv, { transform, ...square });
    const withDefaultPivot = sourceUv(uv, { transform: defaultPivot, ...square });
    expect(authored[1]).not.toBeCloseTo(withDefaultPivot[1], 3);
  });
});
