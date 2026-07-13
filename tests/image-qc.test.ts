import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { assertProductionPng, computeImageQc } from '../engine/qc/ImageQc';
import { resolveProductionAssetPolicy, validateProjectProductionAssets } from '../engine/qc/ProductionAssets';
import type { ProjectManifest } from '../engine/types';

const png = (width: number, height: number): Buffer => { const image = new PNG({ width, height }); image.data.fill(255); return PNG.sync.write(image); };
const project = (override: Partial<ProjectManifest>): ProjectManifest => ({
  id: 'qc-project',
  name: 'qc-project',
  duration: 1,
  seed: 1,
  renderModes: {
    draft: { width: 10, height: 10, fps: 30, blurSamples: 1, postFX: 'reduced' },
    review: { width: 10, height: 10, fps: 60, blurSamples: 1, postFX: 'full' },
    master: { width: 10, height: 10, fps: 60, blurSamples: 1, postFX: 'full' },
  },
  sources: [],
  ...override,
});

describe('production image QC', () => {
  it('rejects undersized production images', () => expect(() => assertProductionPng(png(941, 1672), 'small.png')).toThrow(/below/));
  it('accepts valid 9:16 production images and computes objective metrics', () => expect(computeImageQc(assertProductionPng(png(1440, 2560), 'valid.png'))).toMatchObject({ width: 1440, height: 2560 }));
  it('allows empty production assets for legacy projects', async () => {
    const legacy = project({ id: 'legacy', qualityProfile: 'legacy', images: [] });
    await expect(validateProjectProductionAssets(legacy)).resolves.toEqual([]);
    expect(resolveProductionAssetPolicy(legacy)).toBe('optional');
  });
  it('requires registered production assets for anime profiles or explicit policy', async () => {
    await expect(validateProjectProductionAssets(project({ id: 'anime', qualityProfile: 'anime-ultra-clear', images: [] }))).rejects.toThrow(/requires at least one/);
    await expect(validateProjectProductionAssets(project({ id: 'required', productionAssetPolicy: 'required', images: [] }))).rejects.toThrow(/requires at least one/);
  });
});
