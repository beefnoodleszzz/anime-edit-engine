import type { PostFXConfig, ProjectManifest, QualityConfig, QualityProfile, ShotPostFXOverride } from '../types';

export const QUALITY_PROFILES: Record<Exclude<QualityProfile, 'custom'>, PostFXConfig> = {
  cinematic: {
    glow: 0.18, chromatic: 0, grain: 0.016, clarity: 0, contrast: 0, saturation: 0,
    samplingMode: 'linear', sharpen: { amount: 0.1, threshold: 0, limit: 0.25 },
  },
  'anime-ultra-clear': {
    glow: 0, chromatic: 0, grain: 0, sharpen: { amount: 0.12, threshold: 0.03, limit: 0.18 },
    clarity: 0.1, contrast: 0.06, saturation: 0.02, samplingMode: 'bicubic-sharp',
  },
  'anime-impact': {
    glow: 0.06, chromatic: 0.002, grain: 0, sharpen: { amount: 0.16, threshold: 0.03, limit: 0.2 },
    clarity: 0.14, contrast: 0.08, saturation: 0.04, samplingMode: 'bicubic-sharp',
  },
};

const clone = (config: PostFXConfig): PostFXConfig => ({ ...config, sharpen: { ...config.sharpen } });

export function resolveQualityConfig(project: ProjectManifest): PostFXConfig {
  const profile = project.qualityProfile ?? 'anime-ultra-clear';
  const base = profile === 'custom' ? QUALITY_PROFILES['anime-ultra-clear'] : QUALITY_PROFILES[profile];
  const quality = project.quality ?? {};
  return mergeQualityConfig(base, quality);
}

export function mergeQualityConfig(base: PostFXConfig, override: QualityConfig | ShotPostFXOverride | undefined): PostFXConfig {
  if (!override) return clone(base);
  const sharpen = override.sharpen;
  const sharpenOverride = typeof sharpen === 'number' ? { amount: sharpen } : sharpen;
  return {
    ...base,
    ...override,
    sharpen: { ...base.sharpen, ...sharpenOverride },
  } as PostFXConfig;
}

export function samplingModeForRender(mode: 'draft' | 'review' | 'master', requested: PostFXConfig['samplingMode']): PostFXConfig['samplingMode'] {
  if (mode === 'draft') return 'linear';
  if (mode === 'review' && requested === 'bicubic-sharp') return 'bicubic';
  return requested;
}
