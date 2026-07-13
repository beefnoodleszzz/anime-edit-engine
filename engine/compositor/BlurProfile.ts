import type { BlurProfile, RenderContext } from '../types';

/** Explicit adaptive profile: low motion is genuinely unblurred. */
export function resolveBlurProfile(motionScore: number, context: RenderContext): BlurProfile {
  const motion = Math.max(0, motionScore);
  if (motion < 0.10) return { strength: 0, samples: 1, shutterSeconds: 0 };
  const cap = motion < 0.25 ? Math.min(6, context.blurSamples) : motion < 0.55 ? Math.min(12, context.blurSamples) : context.blurSamples;
  const strength = Math.min(1, (motion - 0.10) / 0.65);
  return { strength, samples: Math.max(2, Math.round(2 + strength * (cap - 2))), shutterSeconds: context.frameDeltaSeconds * (0.25 + strength * 0.75) };
}
