import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { resolveBlurProfile } from '../engine/compositor/BlurProfile';
import { createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest } from '../engine/types';
describe('BlurProfile', () => {
  const draft = createRenderContext(project as ProjectManifest, 'draft');
  const review = createRenderContext(project as ProjectManifest, 'review');
  const master = createRenderContext(project as ProjectManifest, 'master');
  it('has a true zero-blur region', () => expect(resolveBlurProfile(0.099, master)).toMatchObject({ strength: 0, samples: 1 }));
  it('is monotonic and respects each mode cap at high motion', () => {
    const scores = [0.1, 0.25, 0.55, 1].map((score) => resolveBlurProfile(score, master).samples);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(resolveBlurProfile(1, draft).samples).toBeLessThanOrEqual(draft.blurSamples);
    expect(resolveBlurProfile(1, review).samples).toBeLessThanOrEqual(16);
    expect(resolveBlurProfile(1, master).samples).toBeLessThanOrEqual(24);
  });
  it('review caps at 16 samples, not the old 12', () => expect(review.blurSamples).toBe(16));
  it('master caps at 24 samples', () => expect(master.blurSamples).toBe(24));
});
