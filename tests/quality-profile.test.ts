import { describe, expect, it } from 'vitest';
import { mergeQualityConfig, resolveQualityConfig, samplingModeForRender } from '../engine/compositor/QualityProfile';
import type { ProjectManifest } from '../engine/types';

const project = { id: 'quality', name: 'quality', duration: 1, seed: 1, renderModes: { draft: { width: 10, height: 10, fps: 30, blurSamples: 4, postFX: 'reduced' }, review: { width: 10, height: 10, fps: 60, blurSamples: 8, postFX: 'full' }, master: { width: 10, height: 10, fps: 60, blurSamples: 8, postFX: 'full' } }, sources: [] } as ProjectManifest;

describe('quality profiles', () => {
  it('keeps legacy defaults when no profile is declared', () => {
    const quality = resolveQualityConfig(project);
    expect(quality).toMatchObject({ glow: 0.18, chromatic: 0, grain: 0.016, clarity: 0, contrast: 0, saturation: 0, samplingMode: 'linear' });
    expect(quality.sharpen).toEqual({ amount: 0.1, threshold: 0, limit: 0.25 });
  });
  it('resolves anime ultra clear when explicitly requested', () => {
    const quality = resolveQualityConfig({ ...project, qualityProfile: 'anime-ultra-clear' });
    expect(quality).toMatchObject({ glow: 0, chromatic: 0, grain: 0, clarity: 0.1, contrast: 0.06, saturation: 0.02, samplingMode: 'bicubic-sharp' });
    expect(quality.sharpen).toEqual({ amount: 0.12, threshold: 0.03, limit: 0.18 });
  });
  it('deep merges project/shot overrides', () => {
    const quality = resolveQualityConfig({ ...project, qualityProfile: 'anime-ultra-clear' });
    expect(mergeQualityConfig(quality, { contrast: 0.2, sharpen: { amount: 0.3 } })).toMatchObject({ contrast: 0.2, sharpen: { amount: 0.3, threshold: 0.03, limit: 0.18 } });
  });
  it('downgrades sampling only for draft', () => {
    expect(samplingModeForRender('draft', 'bicubic-sharp')).toBe('linear');
    expect(samplingModeForRender('master', 'bicubic-sharp')).toBe('bicubic-sharp');
  });
});
