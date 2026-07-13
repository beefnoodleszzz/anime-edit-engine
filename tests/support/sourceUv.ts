import type { EditTransform } from '../../engine/types';

export interface SourceUvParams { transform: EditTransform; sourceWidth: number; sourceHeight: number; outputWidth: number; outputHeight: number; }

/**
 * CPU-exact mirror of the fragment shader's `sourceUv()` (engine/compositor/Compositor.ts).
 * Kept in sync by hand — if the shader's math changes, this must change with it. It exists so
 * transform-path/pivot tests have an independent ground truth for the sampled source UV instead
 * of only asserting "the array has more than one element."
 */
export function sourceUv([uvX, uvY]: readonly [number, number], { transform, sourceWidth, sourceHeight, outputWidth, outputHeight }: SourceUvParams): [number, number] {
  const px0 = uvX - transform.pivotX;
  const py0 = uvY - transform.pivotY;
  const radians = (transform.rotation * Math.PI) / 180;
  const c = Math.cos(radians); const s = Math.sin(radians);
  const rx = c * px0 - s * py0; const ry = s * px0 + c * py0;
  let px = rx / Math.max(transform.scale, 0.001) + transform.x;
  let py = ry / Math.max(transform.scale, 0.001) + transform.y;
  const sourceAspect = sourceWidth / sourceHeight;
  const outputAspect = outputWidth / outputHeight;
  if (sourceAspect > outputAspect) px *= outputAspect / sourceAspect; else py *= sourceAspect / outputAspect;
  return [px + transform.pivotX, py + transform.pivotY];
}
